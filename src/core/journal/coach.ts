/**
 * Das Coaching-Gespraech — das Herz des Tagebuchs.
 *
 * Seit 011 sind es zwei sehr verschiedene Ablaeufe hinter einer Funktion, und der
 * Unterschied ist der Punkt:
 *
 * - **`listen` legt ab und fragt nichts.** Der Satz des Menschen wird als Prosa in
 *   den Tagesstrom geschrieben, und damit ist die Runde fertig. Das Gateway wird
 *   nicht angefasst — kein `isAvailable`, kein `stream`. Das ist ein Erfolg und
 *   ausdruecklich **kein** `noModel`: Es war keins gewollt, nicht keins da.
 * - **`tips` und `analyze` fragen ein Modell** — in dieser Reihenfolge:
 *   1. Die Tagesdatei wird bereitgestellt (`ensureDay`, idempotent).
 *   2. Kontext wird gelesen: der heutige Eintrag, die bisherigen Runden des Tages,
 *      im Modus `analyze` zusaetzlich die relevantesten frueheren Tage.
 *   3. **Die eigenen Worte werden geschrieben — vor dem Modellaufruf.** Stirbt die
 *      App mitten im Stream, steht der Satz des Menschen trotzdem in der Datei.
 *      Verloren ist dann eine Antwort, die ohnehin nicht fertig war.
 *   4. `journal-chat` wird streamend gefragt.
 *   5. Die Antwort wird als Antwortblock angehaengt, wortwoertlich wie sie kam.
 *
 * Ohne Modell entsteht **kein toter Zustand und keine gespielte Empathie**: der
 * Eintrag ist geschrieben (das ist der Wert — der Mensch hat sich mitgeteilt),
 * `noModel` ist gesetzt, und im Modus `analyze` liegen die gefundenen frueheren
 * Stellen bei. Aus denen macht der Renderer „Aufgeschrieben. Antworten kann ich
 * ohne Modell nicht — hier sind aber drei fruehere Tage, an denen es dir aehnlich
 * ging." Der Kern formuliert das nicht, er belegt es.
 */

import type { CoachRequest } from '@shared/types';
import { LlmUnavailableError, journalChatPrompt } from '@core/llm';
import { toJournalDay } from '@core/index/journal';
import { collapse } from '@core/index/text';
import { dayOf, ensureDay } from './day';
import { dialogHistory } from './dialog';
import { dayText } from './sections';
import { appendAnswer, appendEntry, parseStream } from './stream';
import { DIALOG_HISTORY_TURNS, JournalError, MAX_EARLIER_DAYS } from './types';
import type { CoachDeps, CoachEvidence, CoachResult, DialogRole, JournalIndexView } from './types';

/** So viel Text geht in die Volltextsuche — mehr verwaessert die Anfrage. */
const SEARCH_CHARS = 400;

/** So viele Kandidaten holt die Suche, bevor gefiltert wird. */
const CANDIDATE_FACTOR = 3;

export interface EarlierDaysOptions {
  /** Der Tag, um den es geht. Nur aeltere Eintraege zaehlen als „frueher". */
  date: string;
  /** Woran sich die Suche orientiert: die Nachricht und der heutige Eintrag. */
  text: string;
  limit?: number;
}

/**
 * Die relevantesten frueheren Tage zu dem, was der Nutzer gerade schreibt.
 *
 * Ausschliesslich aus der Volltextsuche und wortwoertlich aus den Dateien —
 * daraus darf auch ohne Modell eine Aussage werden. Ein Tag zaehlt nur einmal,
 * und der heutige nie: er steht schon im Kontext.
 */
export function earlierDays(index: JournalIndexView, options: EarlierDaysOptions): CoachEvidence[] {
  const text = collapse(options.text).slice(0, SEARCH_CHARS);
  const limit = Math.max(0, options.limit ?? MAX_EARLIER_DAYS);
  if (text.length === 0 || limit === 0) return [];

  const hits = index.search({ text, types: ['journal'], limit: limit * CANDIDATE_FACTOR });
  const byPath = index.index().byPath;
  const found: CoachEvidence[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const doc = byPath.get(hit.path);
    if (doc === undefined) continue;
    const day = toJournalDay(doc);
    if (day.date.length === 0 || day.date >= options.date || seen.has(day.date)) continue;
    const excerpt = day.excerpt.trim();
    if (excerpt.length === 0) continue;
    seen.add(day.date);
    found.push({ date: day.date, path: doc.path, excerpt });
    if (found.length >= limit) break;
  }
  /* Aeltester zuerst: so liest das Modell eine Zeitreihe und kann „das dritte Mal
     in drei Wochen" ueberhaupt erkennen. */
  return found.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Die bisherigen Runden **dieses Tages** als Vorgeschichte, aelteste zuerst.
 *
 * Zwei Quellen, weil eine Tagesdatei in zwei Formaten vorliegen kann: der Strom
 * unter „Tag" (011, `parseStream` — eigene Prosa als Nutzerrunde, Antwortbloecke
 * als Antwort) und, solange der Tag nicht gefaltet ist, der alte Abschnitt
 * „Gespraech". In den schreibt seit 011 nichts mehr, seine Runden sind also immer
 * die aelteren — deshalb stehen sie vorn.
 *
 * Ohne den Strom saehe die zweite Tipp-Frage desselben Tages die erste **Antwort**
 * nicht mehr: die eigene Prosa kommt als „bisheriger Eintrag" mit, was die App
 * darauf gesagt hat, stand nirgends. Dafuer steht ein Absatz, der schon im
 * Eintrag steht, hier ein zweites Mal — die Reihenfolge der Runden ist das wert,
 * und ein fehlender Absatz waere der teurere Fehler.
 */
function dayHistory(body: string, limit: number): { role: DialogRole; content: string }[] {
  if (limit <= 0) return [];
  const stream = parseStream(body).map((block) => ({
    role: block.kind === 'answer' ? ('assistant' as const) : ('user' as const),
    content: block.text,
  }));
  const recent = [...dialogHistory(body, limit), ...stream].slice(-limit);
  /* Eine Vorgeschichte, die mit einer Antwort beginnt, nimmt nicht jede API an
     (die Messages-API von Anthropic verlangt die erste Nachricht in der
     Nutzerrolle). Vorne abgeschnittene Antworten fallen deshalb weg. */
  const start = recent.findIndex((turn) => turn.role === 'user');
  return start < 0 ? [] : recent.slice(start);
}

/**
 * Eine Runde. Wirft nur bei leerer Nachricht, bei einem Abbruch des Aufrufers und
 * bei einem echten Providerfehler — und in jedem dieser Faelle stehen die eigenen
 * Worte schon in der Datei.
 */
export async function coach(deps: CoachDeps, request: CoachRequest): Promise<CoachResult> {
  const message = (request.message ?? '').replace(/\r\n/g, '\n').trim();
  if (message.length === 0) {
    throw new JournalError('invalid', 'Eine Gespraechsrunde ohne Text.');
  }
  /* In eine lokale Variable, damit die Verzweigung den Modus auch nach dem ersten
     `await` noch auf `tips | analyze` verengt haelt. */
  const mode = request.mode;
  const date = dayOf(request.date);
  const docLanguage = deps.docLanguage ?? 'de';

  if (mode === 'listen') {
    /* Zuhoeren heisst seit 011: ablegen. Kein Modell wird gefragt, also wird auch
       keins vermisst — `noModel` bleibt falsch, `failure` bleibt null. Der Wert
       der Runde ist der Eintrag, und der steht. */
    const filed = await appendEntry(deps.store, date, message, { docLanguage });
    return {
      date,
      path: filed.path,
      mode,
      message,
      reply: '',
      noModel: false,
      failure: null,
      earlier: [],
      usedLlm: false,
      model: null,
      hash: filed.hash,
    };
  }

  const now = deps.now ?? new Date();
  const day = await ensureDay(deps.store, date, docLanguage);
  const entry = dayText(day.doc.body);
  const history = dayHistory(day.doc.body, DIALOG_HISTORY_TURNS);
  /* Belege gibt es nur im Modus, der sie braucht — und nur, wenn der Nutzer die
     Vorgeschichte zulaesst. */
  const earlier =
    mode === 'analyze' && request.useHistory !== false
      ? earlierDays(deps.index, { date, text: `${message}\n${entry}` })
      : [];

  /* Vor dem Modell: was der Mensch gesagt hat, ist gesagt. */
  const asked = await appendEntry(deps.store, date, message, { docLanguage });
  const base = { date, path: asked.path, mode, message, earlier };

  const messages = journalChatPrompt(
    {
      mode,
      message,
      date,
      ...(entry.length === 0 ? {} : { entry }),
      ...(history.length === 0 ? {} : { history }),
      ...(earlier.length === 0 ? {} : { earlierDays: earlier }),
    },
    docLanguage,
    deps.replyLanguage ?? docLanguage,
  );

  try {
    /* `journal-chat` streamt (siehe `core/llm/tasks`): der Mensch soll die Antwort
       entstehen sehen. Hoert niemand zu, laeuft der Strom ins Leere — die Antwort
       kommt trotzdem vollstaendig zurueck. */
    const result = await deps.gateway.stream(
      {
        task: 'journal-chat',
        messages,
        ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      },
      deps.onDelta ?? noSink,
    );
    const reply = result.text.trim();
    if (reply.length === 0) {
      /* Ein leeres Modell-Ergebnis wird nicht protokolliert. Ein leerer
         Antwortblock in der Datei waere die Behauptung, es haette geantwortet. */
      return {
        ...base,
        reply: '',
        noModel: true,
        failure: { reason: 'error', task: 'journal-chat', detail: 'empty-response' },
        usedLlm: true,
        model: result.model,
        hash: asked.hash,
      };
    }
    const answered = await appendAnswer(deps.store, date, reply, { docLanguage, now });
    return {
      ...base,
      reply,
      noModel: false,
      failure: null,
      usedLlm: true,
      model: result.model,
      hash: answered.hash,
    };
  } catch (error) {
    /* Kein Modell, ein abgeschalteter Provider, ein nicht erreichbares Modell: das
       ist ein Zustand, kein Absturz. Der Eintrag steht, der Grund kommt als Code
       mit — im Modus `analyze` samt der Belege, die wirklich gefunden wurden.
       Erfunden wird nichts.
       Nur der Abbruch des Nutzers geht nach oben: er hat ihn selbst ausgeloest. */
    if (error instanceof LlmUnavailableError) {
      return {
        ...base,
        reply: '',
        noModel: true,
        failure: error.info,
        usedLlm: false,
        model: null,
        hash: asked.hash,
      };
    }
    throw error;
  }
}

function noSink(): void {
  /* Absichtlich leer: ohne Zuhoerer wird der Strom nur eingesammelt. */
}
