/* Tagebuch und Coaching — der Bereich, in dem die App menschlich sein muss.
 *
 * Entschieden und geschrieben wird im Kern (`@core/journal`), die Textarbeit an
 * der Datei steht in `journal-day.ts`; hier steht der Ablauf. Vier Entscheidungen,
 * die man im Code sonst nicht sieht:
 *
 * - **Der Renderer parst kein Markdown.** `journal:get` liefert den Tag schon
 *   getrennt (Prosa, Runden, Fakten). Eine zweite Fassung des Dateiformats im
 *   Renderer liefe beim ersten von Hand geschriebenen Tag auseinander.
 * - **Das Gespräch steht im Tageseintrag, nicht in `.secondbrain/chats/`.** Der
 *   Faden ist die Datei (docs/VAULT-FORMAT.md); eine zweite Ablage wäre eine
 *   zweite Wahrheit — und ausgerechnet vom Sensibelsten eine Kopie. Die Marke des
 *   Streams ist deshalb der Tag, nicht ein Gesprächs-Objekt.
 * - **Die eigene Runde ist geschrieben, bevor ein Modell gefragt wird** (im Kern).
 *   Deshalb zieht auch der Fehlerweg den Index nach und weckt den Renderer: der
 *   Satz des Menschen steht da, auch wenn die Antwort ausfiel.
 * - **Ohne Modell wird nichts erfunden.** Das Abschluss-Ereignis trägt dann den
 *   Grund als Code (`LlmUnavailable.reason`) und — im Modus „analysieren" — die
 *   gefundenen früheren Stellen als Belege. Formuliert wird im Renderer.
 */

import { newMessageId } from '@core/chat';
import {
  appendToDay,
  closeDay,
  coach,
  dayOf,
  ensureDay,
  pathFor,
  readDay,
  setMood,
} from '@core/journal';
import type { CoachDeps, JournalIndexView } from '@core/journal';
import { COACH_MODES } from '@shared/types';
import type { Citation } from '@shared/types';
import type { IpcRequest } from '@shared/ipc';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { applyClose, journalStore, toView, withDayText } from './journal-day';
import { llmStreams } from './llm-stream';
import type { StreamRun } from './llm-stream';
import { requireLists } from './lists';
import { docLanguage, replyLanguage, settle } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** Was der Tagebuch-Kern am Index braucht — `IndexService` erfüllt es. */
const INDEX_METHODS: readonly string[] = ['index', 'search', 'projects', 'modules'];

function knowsJournal(index: IndexLike): index is IndexLike & JournalIndexView {
  const record = index as unknown as Record<string, unknown>;
  return INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** Der Index als Lesesicht des Kerns. Fehlt eine Ableitung, sagt der Kanal es. */
function journalIndex(services: Services): JournalIndexView {
  const index = services.requireIndex();
  if (!knowsJournal(index)) throw fail('io', 'der Index liefert keine Tagebuch-Ableitungen');
  return index;
}

// ── Coaching ─────────────────────────────────────────────────────────────────

/** Die Marke des Streams: der Tag ist der Gesprächsfaden. */
function threadOf(date: string): string {
  return `journal-${date}`;
}

/**
 * Ein früherer Tag als Beleg. `Citation` passt genau: Pfad, wörtlicher Auszug und
 * als Titel der Kalendertag — daraus macht der Renderer „am 22. Juli klang es
 * ähnlich" samt Sprung dorthin. Erfunden ist daran nichts, es steht so in der Datei.
 */
function asCitation(evidence: { date: string; path: string; excerpt: string }): Citation {
  return { path: evidence.path, title: evidence.date, quote: evidence.excerpt, line: null };
}

/**
 * Die Runde erarbeiten und laufend melden. Beendet den Stream selbst, weil nur
 * hier bekannt ist, was am Abschluss hängt: der Grund eines Ausfalls und, im Modus
 * „analysieren", die gefundenen früheren Tage als Belege.
 */
async function runCoach(
  services: Services,
  deps: CoachDeps,
  run: StreamRun,
  request: IpcRequest<'journal:coach'>,
): Promise<void> {
  const result = await coach(deps, request);
  /* Erst die Datei, dann das Abschluss-Ereignis: der Renderer lädt den Tag neu,
     sobald es ankommt — dann muss die Runde schon dort stehen. */
  await settle(services, [result.path], 'journal');
  run.end({
    ...(result.noModel ? { error: result.failure?.reason ?? 'error' } : {}),
    ...(result.earlier.length === 0 ? {} : { citations: result.earlier.map(asCitation) }),
  });
}

export function journalHandlers(services: Services): HandlerMap {
  /* Derselbe Streaming-Weg wie beim Fragen (`ipc/llm-stream.ts`) — eine Mechanik,
     ein Abschluss-Ereignis, ein Abbruch. */
  const streams = llmStreams(services);

  return defineHandlers({
    'journal:list': ({ limit }) => {
      const days = requireLists(services).journal();
      return limit === undefined ? [...days] : days.slice(0, Math.max(0, limit));
    },

    'journal:get': async ({ date }) => {
      const found = await readDay(journalStore(services), date);
      return found === null ? null : toView(found);
    },

    'journal:append': async ({ date, text }) => {
      const store = journalStore(services);
      const created = (await store.stat(pathFor(date))) === null;
      const written = await appendToDay(store, date, 'day', text, {
        docLanguage: docLanguage(services),
      });
      await settle(services, [written.path], 'journal');
      return { path: written.path, hash: written.hash, created };
    },

    'journal:setDay': async ({ date, text, expectedHash }) => {
      const store = journalStore(services);
      const language = docLanguage(services);
      /* Auch der erste Satz eines Tages darf hier entstehen — dann gibt es keinen
         eingefrorenen Hash, weil es noch nichts zu überschreiben gab. */
      const day = await ensureDay(store, date, language);
      const result = await store.write({
        path: day.path,
        body: withDayText(day.doc.body, text, language),
        expectedHash: expectedHash ?? day.doc.hash,
      });
      await settle(services, [result.path], 'journal');
      return result;
    },

    'journal:setMood': async ({ date, mood, energy, expectedHash }) => {
      const store = journalStore(services);
      /* Eine Stimmung ohne Datei wäre ein Klick, der nichts tut: der Tag entsteht. */
      await ensureDay(store, date, docLanguage(services));
      const day = await setMood(
        store,
        date,
        {
          ...(mood === undefined ? {} : { mood }),
          ...(energy === undefined ? {} : { energy }),
        },
        expectedHash === undefined ? {} : { expectedHash },
      );
      await settle(services, [pathFor(date)], 'journal');
      return day;
    },

    'journal:coach': (request) => {
      const message = (request.message ?? '').trim();
      if (message.length === 0) throw fail('invalid', 'eine Gespraechsrunde ohne Text');
      /* Die Haltung entscheidet den Prompt: eine unbekannte waere ein Absturz im
         Hintergrundlauf, und der kaeme als Stream-Fehler zurueck statt als Absage. */
      if (!COACH_MODES.includes(request.mode)) throw fail('invalid', 'diese Haltung gibt es nicht');
      /* Wirft bei einem Datum, das kein Kalendertag ist — bevor irgendetwas läuft. */
      const date = dayOf(request.date);
      const messageId = newMessageId(new Date());
      const run = streams.begin(threadOf(date), messageId);
      /* Store, Index und Gateway hier, nicht im Hintergrundlauf: „kein Vault" und
         „kein Index" gehören als Fehler an den Aufruf, nicht in einen Stream. */
      const deps: CoachDeps = {
        store: journalStore(services),
        index: journalIndex(services),
        gateway: createGateway(services),
        docLanguage: docLanguage(services),
        replyLanguage: replyLanguage(services),
        signal: run.signal,
        onDelta: run.delta,
      };

      streams.run(
        run,
        (active) =>
          runCoach(services, deps, active, {
            mode: request.mode,
            date,
            message,
            useHistory: request.useHistory !== false,
          }),
        {
          label: 'journal',
          /* Die eigene Runde steht schon in der Datei (der Kern schreibt sie vor
             dem Modellaufruf). Der Renderer muss sie sehen, auch im Fehlerfall. */
          onFailure: () => settle(services, [pathFor(date)], 'journal'),
        },
      );
      return { threadId: run.threadId, messageId };
    },

    /* Abgebrochen ist kein Fehler: die eigene Runde bleibt geschrieben, der Stream
       endet, und der Renderer wartet nicht weiter. */
    'journal:abort': ({ messageId }) => {
      streams.abort(messageId);
    },

    'journal:close': ({ date }) =>
      closeDay(
        {
          store: journalStore(services),
          index: journalIndex(services),
          gateway: createGateway(services),
          docLanguage: docLanguage(services),
          now: new Date(),
        },
        date,
      ),

    'journal:applyClose': async (request) => {
      const store = journalStore(services);
      const result = await applyClose(
        store,
        journalIndex(services),
        docLanguage(services),
        request,
      );
      await settle(services, result.written, 'journal');
      return result;
    },
  });
}
