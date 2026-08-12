/* Fragen an das Second Brain — der Screen, an dem sich entscheidet, ob das Archiv
   etwas wert ist.

   Der Ablauf einer Frage, und warum er so aussieht:

   1. Die Frage wird **sofort** geschrieben (`@core/chat`), noch bevor irgendein
      Modell gefragt wird. Stirbt die App mitten im Stream, steht sie noch da.
   2. Der Kanal antwortet danach schon — mit Thread- und Nachrichten-Marke. Die
      Antwort selbst laeuft im Hintergrund und fliesst als `event:llm-stream`
      unter derselben Marke zum Renderer.
   3. Ohne Modell wird nicht gestreamt: dann traegt das Abschluss-Ereignis den
      ganzen Text (die Fundstellen als Antwort). Sonst bliebe der Screen leer.
   4. Erst am Ende wird die Antwort samt gepruefter Belege geschrieben. Ein
      Abbruch schreibt nichts: eine halbe Antwort mit halben Belegen waere eine
      Behauptung.

   Entschieden und geprueft wird im Kern (`@core/wiki/ask` — Belege gegen die
   Dateien, `@core/wiki/file-back` — Antwort als Wiki-Seite). Hier steht nur der
   Ablauf: wer streamt, wer abbricht, wer den Index nachzieht. */

import { ChatArchive, historyOf } from '@core/chat';
import { askQuestion, createModule, fileBack } from '@core/wiki';
import type { ChatMessage } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { llmStreams } from './llm-stream';
import type { StreamRun } from './llm-stream';
import { replyLanguage, settle, wikiDeps } from './wiki-bridge';
import type { VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/** Eine Ablage je offenem Vault — sie serialisiert die Schreibvorgaenge je Gespraech. */
const ARCHIVES = new WeakMap<VaultStoreLike, ChatArchive>();

function archiveOf(services: Services): ChatArchive {
  const store = services.requireStore();
  const known = ARCHIVES.get(store);
  if (known !== undefined) return known;
  const created = new ChatArchive(store);
  ARCHIVES.set(store, created);
  return created;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Das Modell, das geantwortet hat — Transparenz ueber die Route. */
function modelLabel(model: { providerId: string; model: string } | null): string | null {
  return model === null ? null : model.model;
}

interface AnswerInput {
  question: string;
  module: string | null;
  scope: 'work' | 'private' | null;
  history: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * Die Antwort erarbeiten und laufend melden. Wirft nur nach oben durch — den
 * Ausfall macht `llmStreams.run` zu einem Abschluss-Ereignis mit `error`, damit
 * der Renderer nicht fuer immer am Stream haengt.
 *
 * Beendet die Runde selbst, weil nur hier bekannt ist, was am Abschluss haengt:
 * ohne Modell hat niemand gestreamt, dann traegt der Abschluss den ganzen Text.
 */
async function runAnswer(
  services: Services,
  archive: ChatArchive,
  run: StreamRun,
  input: AnswerInput,
): Promise<void> {
  const answer = await askQuestion(wikiDeps(services, run.signal), {
    question: input.question,
    module: input.module,
    scope: input.scope,
    history: input.history,
    replyLanguage: replyLanguage(services),
    onDelta: run.delta,
  });

  /* Erst schreiben, dann melden: das Abschluss-Ereignis laedt das Gespraech im
     Renderer neu, und dann muss die Antwort schon als Datei liegen. */
  const model = modelLabel(answer.model);
  await archive.append(run.threadId, {
    id: run.messageId,
    role: 'assistant',
    content: answer.answer,
    at: nowIso(),
    ...(answer.citations.length === 0 ? {} : { citations: answer.citations }),
    ...(model === null ? {} : { model }),
    ...(answer.unsupported ? { unsupported: true } : {}),
  });

  run.end({ citations: answer.citations }, answer.usedLlm ? '' : answer.answer);
}

export function chatHandlers(services: Services): HandlerMap {
  /* Derselbe Streaming-Weg wie beim Coaching (`ipc/llm-stream.ts`) — eine
     Mechanik, ein Abschluss-Ereignis, ein Abbruch. */
  const streams = llmStreams(services);

  return defineHandlers({
    'chat:ask': async ({ question, threadId, module, scope }) => {
      const text = (question ?? '').trim();
      if (text.length === 0) throw fail('invalid', 'eine Frage ohne Text');
      const archive = archiveOf(services);
      const messageId = archive.nextMessageId();
      const asked: ChatMessage = {
        /* Frage und Antwort einer Runde teilen die Marke — das haelt beide
           zusammen, auch wenn die Antwort erst Minuten spaeter dazukommt. */
        id: `${messageId}-q`,
        role: 'user',
        content: text,
        at: nowIso(),
      };

      /* Ein Gespraech, das es nicht mehr gibt (geloescht, fremde Marke), kostet
         die Frage nicht: dann beginnt hier ein neues. */
      const known = threadId === undefined ? null : await archive.get(threadId);
      const thread =
        known === null
          ? await archive.create({ kind: 'ask', context: module ?? null, first: asked })
          : await archive.append(known.id, asked);

      const run = streams.begin(thread.id, messageId);
      streams.run(
        run,
        (active) =>
          runAnswer(services, archive, active, {
            question: text,
            module: module ?? null,
            scope: scope ?? null,
            /* Der Stand *vor* dieser Frage: sie steckt schon im Prompt, und zweimal
               dieselbe Frage wuerde das Modell nur verwirren. */
            history: historyOf(known),
          }),
        { label: 'chat' },
      );

      return { threadId: thread.id, messageId };
    },

    'chat:threads': ({ kind, query, limit }) =>
      archiveOf(services).list({
        ...(kind === undefined ? {} : { kind }),
        ...(query === undefined ? {} : { query }),
        ...(limit === undefined ? {} : { limit }),
      }),

    'chat:thread': ({ id }) => archiveOf(services).get(id),

    'chat:delete': async ({ id }) => {
      await archiveOf(services).remove(id);
    },

    /* Abgebrochen ist kein Fehler, sondern eine Entscheidung des Nutzers — auch
       sie beendet den Stream, damit die Oberflaeche nicht weiter wartet. */
    'chat:abort': ({ messageId }) => {
      streams.abort(messageId);
    },

    'chat:fileBack': async ({ threadId, messageId, module, title }) => {
      const named = (module ?? '').trim();
      const heading = (title ?? '').trim();
      if (named.length === 0 || heading.length === 0) {
        throw fail('invalid', 'Modul und Titel gehoeren dazu');
      }
      const thread = await archiveOf(services).require(threadId);
      const at = thread.messages.findIndex((entry) => entry.id === messageId);
      const message = at < 0 ? undefined : thread.messages[at];
      if (message === undefined || message.role !== 'assistant') {
        throw fail('not-found', 'diese Antwort gibt es nicht mehr');
      }
      const question =
        [...thread.messages.slice(0, at)].reverse().find((entry) => entry.role === 'user')
          ?.content ?? thread.title;

      const deps = wikiDeps(services);
      /* `createModule` ist idempotent: ein vorhandenes Modul wird weitergefuehrt,
         ein neues angelegt. Damit funktioniert „Modul neu anlegen" im Dialog, ohne
         dass der Renderer einen zweiten Kanal braucht. */
      const target = await createModule(
        deps.store,
        { title: named },
        { docLanguage: deps.docLanguage ?? 'de', now: deps.now ?? new Date() },
      );
      const result = await fileBack(deps, {
        module: target.slug,
        title: heading,
        answer: message.content,
        citations: message.citations ?? [],
        question,
      });
      await settle(services, [...target.created, ...result.written], 'chat');
      return result.write;
    },
  });
}
