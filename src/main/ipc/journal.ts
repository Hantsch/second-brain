/* Journal and coaching — the area where the app has to be human.
 *
 * Deciding and writing happens in the core (`@core/journal`), the text work
 * on the file lives in `journal-day.ts`; this is where the flow lives. Four
 * decisions you wouldn't otherwise see in the code:
 *
 * - **The renderer parses no markdown.** `journal:get` already delivers the
 *   day pre-split (prose, turns, facts). A second version of the file format
 *   in the renderer would drift apart the first time someone hand-writes a
 *   day.
 * - **The conversation lives in the daily entry, not in
 *   `.secondbrain/chats/`.** The file is the thread (docs/VAULT-FORMAT.md);
 *   a second storage location would be a second truth — and a copy of the
 *   most sensitive thing of all, no less. That's why the stream's identifier
 *   is the day, not a conversation object.
 * - **The user's own turn is written before a model is asked** (in the
 *   core). That's why the error path also brings the index up to date and
 *   wakes the renderer: the human's sentence is there, even if the answer
 *   failed.
 * - **Nothing gets invented without a model.** The completion event then
 *   carries the reason as a code (`LlmUnavailable.reason`) and — in
 *   "analyze" mode — the earlier entries found as evidence. Wording happens
 *   in the renderer.
 */

import { newMessageId } from '@core/chat';
import {
  answerLooseEnd,
  appendEntry,
  closeDay,
  coach,
  dayOf,
  ensureDay,
  interviewFollowup,
  journalTitle,
  newDayBody,
  pathFor,
  planInterview,
  readDay,
  recordAnswer,
  reopenIfClosed,
  requireDay,
  setClosed,
  setMood,
  INTERVIEW_TOPICS,
} from '@core/journal';
import type {
  CoachDeps,
  InterviewMode,
  JournalDayDoc,
  JournalIndexView,
  JournalStore,
} from '@core/journal';
import { toVaultDoc } from '@core/vault';
import { isoDay } from '@core/vault/paths';
import { COACH_MODES } from '@shared/types';
import type { Citation, DocLanguage, JournalDay, JournalFrontmatter } from '@shared/types';
import type { IpcRequest } from '@shared/ipc';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { applyClose, foldDay, journalStore, toView, withDayText } from './journal-day';
import { journalDayLooseEnds, openLooseEnds } from './journal-loose-ends';
import { llmStreams } from './llm-stream';
import type { StreamRun } from './llm-stream';
import { requireLists } from './lists';
import { docLanguage, replyLanguage, settle } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { IndexLike } from '../contracts';
import { looseEndState } from '../loose-end-state';
import type { Services } from '../services';

/** What the journal core needs from the index — `IndexService` satisfies it. */
const INDEX_METHODS: readonly string[] = ['index', 'search', 'projects', 'modules'];

function knowsJournal(index: IndexLike): index is IndexLike & JournalIndexView {
  const record = index as unknown as Record<string, unknown>;
  return INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** The index as the core's read view. If a derivation is missing, the channel reports it. */
function journalIndex(services: Services): JournalIndexView {
  const index = services.requireIndex();
  if (!knowsJournal(index)) throw fail('io', 'der Index liefert keine Tagebuch-Ableitungen');
  return index;
}

// ── Reopening a closed day (068, D2) ────────────────────────────────────────

/**
 * Reopen the day a write just landed in, and say so.
 *
 * A day marked finished must not silently swallow new content: the content is
 * in the file by the time this runs, so a `closed` field left standing would
 * be a claim the file itself contradicts. The decision is in the core
 * (`reopenIfClosed`); what belongs here is the toast — the app doesn't change
 * a state the user set without telling them (guardrail 2).
 *
 * Two things every call site depends on:
 *
 * - **The hash it returns is the one to answer with.** The reopen is a
 *   *second* write on the same file, so the hash of the content write is one
 *   generation behind the moment this reopens. Handing that stale one to the
 *   renderer would turn its next save into a false `conflict` — on the
 *   journal, of all files.
 * - **Called after the write, before `settle()`**, so the index follow-up
 *   already sees the cleared field instead of refreshing a stale one.
 *
 * Returns the whole result, not just the hash: `journal:setMood` answers with
 * the day itself and has to re-read it when this wrote.
 *
 * Without `hash` (the coaching path, which has none), the core guards the
 * reopen with the hash it reads itself — same contract as `setClosed`.
 */
async function reopenAfterWrite(
  services: Services,
  store: JournalStore,
  date: string,
  hash?: string,
): Promise<{ reopened: boolean; hash: string }> {
  const result = await reopenIfClosed(
    store,
    date,
    hash === undefined ? {} : { expectedHash: hash },
  );
  /* Only when it actually happened, and then exactly once: a toast for an
     already open day would announce a write that never took place. */
  if (result.reopened) {
    services.sendEvent('event:toast', { kind: 'info', message: 'toast.journalReopened' });
  }
  return result;
}

// ── Coaching ─────────────────────────────────────────────────────────────────

/** The stream's identifier: the day is the conversation thread. */
function threadOf(date: string): string {
  return `journal-${date}`;
}

/**
 * An earlier day as evidence. `Citation` fits exactly: path, verbatim
 * excerpt, and the calendar day as title — the renderer turns that into
 * "on July 22 it sounded similar" complete with a jump there. Nothing about
 * this is invented, it's exactly what's in the file.
 */
function asCitation(evidence: { date: string; path: string; excerpt: string }): Citation {
  return { path: evidence.path, title: evidence.date, quote: evidence.excerpt, line: null };
}

/**
 * A day that has no file yet, as `planInterview` needs it: empty frontmatter
 * fields (nothing is covered yet) and the body a fresh day would start with
 * (no stream, so no topic reads as already answered).
 *
 * `journal:interviewPlan` is a read — like `journal:get`, it must not create
 * the file just to answer "what's still open". `ensureDay` would create it;
 * this builds the same shape in memory instead, without writing anything.
 */
function emptyDayDoc(date: string, language: DocLanguage): JournalDayDoc {
  const day: JournalDay = {
    path: pathFor(date),
    date,
    title: journalTitle(date, language),
    closed: null,
    mood: null,
    energy: null,
    people: [],
    projects: [],
    tags: [],
    areas: [],
    excerpt: '',
    wordCount: 0,
    turns: 0,
  };
  const doc = toVaultDoc<JournalFrontmatter>(day.path, newDayBody(language), {
    modified: new Date().toISOString(),
  });
  return { day, doc };
}

/**
 * Work out the turn and report it as it goes. Ends the stream itself,
 * because only here is it known what hangs off the completion: the reason
 * for a failure and, in "analyze" mode, the earlier days found as evidence.
 */
async function runCoach(
  services: Services,
  deps: CoachDeps,
  run: StreamRun,
  request: IpcRequest<'journal:coach'>,
): Promise<void> {
  const result = await coach(deps, request);
  /* The user's own turn was written before the model was asked, so this day
     carries new content in every outcome — including "no model configured". */
  await reopenAfterWrite(services, deps.store, request.date);
  /* File first, then the completion event: the renderer reloads the day as
     soon as it arrives — the turn has to already be there by then. */
  await settle(services, [result.path], 'journal');
  run.end({
    ...(result.noModel ? { error: result.failure?.reason ?? 'error' } : {}),
    ...(result.earlier.length === 0 ? {} : { citations: result.earlier.map(asCitation) }),
  });
}

export function journalHandlers(services: Services): HandlerMap {
  /* The same streaming path as with questions (`ipc/llm-stream.ts`) — one
     mechanism, one completion event, one abort. */
  const streams = llmStreams(services);

  return defineHandlers({
    'journal:list': ({ limit }) => {
      const days = requireLists(services).journal();
      return limit === undefined ? [...days] : days.slice(0, Math.max(0, limit));
    },

    'journal:get': async ({ date }) => {
      const found = await readDay(journalStore(services), date);
      if (found === null) return null;
      /* The union of open (`openLooseEnds`, same source the interview's
         follow-up and the maintenance report already read) and resolved
         (`dayLooseEnds`, 069/D2) loose ends of this day — composed in
         `journal-loose-ends.ts`, read-only, so this call never touches the
         announcing day's hash. */
      const looseEnds = await journalDayLooseEnds(services, date);
      return { ...toView(found), looseEnds };
    },

    'journal:append': async ({ date, text }) => {
      const store = journalStore(services);
      const created = (await store.stat(pathFor(date))) === null;
      /* `appendEntry` (011, D2) is the named entry point for writing into the
         "Day" stream — the same target `appendToDay(..., 'day', ...)` reached
         before, now through the module that owns the stream format. */
      const written = await appendEntry(store, date, text, {
        docLanguage: docLanguage(services),
      });
      const { hash } = await reopenAfterWrite(services, store, date, written.hash);
      await settle(services, [written.path], 'journal');
      return { path: written.path, hash, created };
    },

    'journal:setDay': async ({ date, text, expectedHash }) => {
      const store = journalStore(services);
      const language = docLanguage(services);
      /* Even the first sentence of a day can be created here — then there's
         no frozen hash, because there was nothing yet to overwrite. */
      const day = await ensureDay(store, date, language);
      const body = withDayText(day.doc.body, text, language);
      const result = await store.write({
        path: day.path,
        body,
        expectedHash: expectedHash ?? day.doc.hash,
      });
      /* A save that changes no byte is not new content: the day view saves on
         its own, so reopening here would undo a close-out just because
         someone looked at the day. The write itself still runs — it's what
         checks the hash. */
      const reopened =
        body === day.doc.body ? result : await reopenAfterWrite(services, store, date, result.hash);
      await settle(services, [result.path], 'journal');
      return { ...result, hash: reopened.hash };
    },

    'journal:setMood': async ({ date, mood, energy, expectedHash }) => {
      const store = journalStore(services);
      /* A mood without a file would be a click that does nothing: the day gets created. */
      const before = await ensureDay(store, date, docLanguage(services));
      const day = await setMood(
        store,
        date,
        {
          ...(mood === undefined ? {} : { mood }),
          ...(energy === undefined ? {} : { energy }),
        },
        expectedHash === undefined ? {} : { expectedHash },
      );
      /* Compared against the file's own values, not the request: `setMood`
         normalizes the level, so only the day before and after can answer
         whether anything actually changed. Setting the mood a day already
         carries is no new content and must not reopen a closed day. */
      const changed = day.mood !== before.day.mood || day.energy !== before.day.energy;
      let answer = day;
      if (changed) {
        /* Re-read when the reopen wrote: `day` was read before it and would
           report the day as still closed. */
        const reopened = await reopenAfterWrite(services, store, date);
        if (reopened.reopened) answer = (await requireDay(store, date)).day;
      }
      await settle(services, [pathFor(date)], 'journal');
      return answer;
    },

    'journal:setClosed': async ({ date, closed, expectedHash }) => {
      const store = journalStore(services);
      /* Unlike `setMood`, a missing day is not created here — marking a day
         finished only makes sense for a day that already has an entry. */
      const day = await setClosed(
        store,
        date,
        closed,
        expectedHash === undefined ? {} : { expectedHash },
      );
      await settle(services, [pathFor(date)], 'journal');
      return day;
    },

    'journal:coach': (request) => {
      const message = (request.message ?? '').trim();
      if (message.length === 0) throw fail('invalid', 'eine Gespraechsrunde ohne Text');
      /* The mode decides the prompt: an unknown one would be a crash in the
         background run, and that would come back as a stream error instead
         of a proper refusal. */
      if (!COACH_MODES.includes(request.mode)) throw fail('invalid', 'diese Haltung gibt es nicht');
      /* Throws on a date that isn't a calendar day — before anything runs. */
      const date = dayOf(request.date);
      const messageId = newMessageId(new Date());
      const run = streams.begin(threadOf(date), messageId);
      /* Store, index, and gateway here, not in the background run: "no
         vault" and "no index" belong as errors on the call, not in a stream. */
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
          /* The user's own turn is already in the file (the core writes it
             before calling the model). The renderer has to see it even on
             failure — and the day it went into counts as reopened either
             way, so the same reopen as on the success path runs here.
             Guarded: `llm-stream` has already left its catch by now, so a
             throw out of `onFailure` would leave the stream unended and the
             renderer waiting forever. */
          onFailure: async () => {
            try {
              await reopenAfterWrite(services, deps.store, date);
            } catch (error) {
              console.warn('[journal] Wiederoeffnen nach Fehler fehlgeschlagen:', error);
            }
            await settle(services, [pathFor(date)], 'journal');
          },
        },
      );
      return { threadId: run.threadId, messageId };
    },

    /* Aborted is not an error: the user's own turn stays written, the stream
       ends, and the renderer stops waiting. */
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

    'journal:foldDay': async ({ date, expectedHash }) => {
      const store = journalStore(services);
      const result = await foldDay(store, date, docLanguage(services), expectedHash);
      await settle(services, [result.path], 'journal');
      return result;
    },

    'journal:answerLooseEnd': async ({ id, day, text, expectedHash }) => {
      const store = journalStore(services);
      const today = isoDay(new Date());
      const written = await answerLooseEnd(store, today, day, text, {
        docLanguage: docLanguage(services),
        ...(expectedHash === undefined ? {} : { expectedHash }),
      });
      /* Recorded only once the write actually succeeded — a stale hash throws
         above and nothing here runs, so a `conflict` never gets remembered as
         answered. */
      const state = await looseEndState(services.requireVaultRoot());
      await state.recordAnswered({
        id,
        day,
        path: written.path,
        answeredAt: new Date().toISOString(),
      });
      /* `today`, not `day`: the answer is written into today's stream, so
         today is the day that gets reopened — not the one that announced it. */
      const { hash } = await reopenAfterWrite(services, store, today, written.hash);
      await settle(services, [written.path], 'journal');
      return { ...written, hash };
    },

    'journal:interviewPlan': async ({ date }) => {
      /* Throws on a date that isn't a calendar day — before anything runs,
         same as `journal:coach`. */
      const day = dayOf(date);
      const language = docLanguage(services);
      const found = await readDay(journalStore(services), day);
      /* Whether the optional follow-up can run at all is a question about
         this running app's configuration — `core/journal` knows nothing of
         `LlmGateway` (guardrail 4), so it's decided here, not in the core. */
      const mode: InterviewMode = createGateway(services).isAvailable('journal-chat')
        ? 'model'
        : 'fixed';
      const looseEnds = await openLooseEnds(services);
      return planInterview(found ?? emptyDayDoc(day, language), language, mode, looseEnds);
    },

    'journal:interviewAnswer': async ({ date, step, answer }) => {
      const day = dayOf(date);
      /* An unknown topic would otherwise write a blockquote `planInterview`
         can never recognize as covering one of the fixed five — refused
         before anything is written. */
      if (!(INTERVIEW_TOPICS as readonly string[]).includes(step.topic)) {
        throw fail('invalid', 'dieses Interview-Thema gibt es nicht');
      }
      const store = journalStore(services);
      const written = await recordAnswer(store, day, step, answer, {
        docLanguage: docLanguage(services),
      });
      const { hash } = await reopenAfterWrite(services, store, day, written.hash);
      await settle(services, [written.path], 'journal');
      return { ...written, hash };
    },

    'journal:interviewFollowUp': async ({ date, step, answer }) => {
      const day = dayOf(date);
      /* Context only, never a claim (interview-followup.ts): the projects
         already on the day's own frontmatter, and todos that are actually
         open and due on or before this day — nothing re-derived, nothing
         guessed. Writes nothing, so no `settle()` call. */
      const found = await readDay(journalStore(services), day);
      const projects = found?.day.projects ?? [];
      const todosDue = requireLists(services)
        .todos()
        .filter((todo) => todo.state === 'open' && todo.due !== null && todo.due <= day)
        .map((todo) => todo.text);
      return interviewFollowup(
        { gateway: createGateway(services), docLanguage: docLanguage(services) },
        {
          step,
          answer,
          ...(projects.length > 0 ? { projects } : {}),
          ...(todosDue.length > 0 ? { todosDue } : {}),
        },
      );
    },
  });
}
