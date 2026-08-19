/**
 * The interview (012): a fixed set of five short questions that get the day
 * started when the blank page is the obstacle — what I worked on, what came
 * up, who I dealt with, what is still open, how it felt. `INTERVIEW_TOPICS`
 * (types.ts) is the stated coverage set and is never extended, not even by a
 * model (`interview-followup.ts`, D3 of 012).
 *
 * Two halves live here, and they are two sides of the same format: the pure
 * planning (`planInterview`, D1) reads the day-stream, and `recordAnswer` (D2)
 * writes into it. They stay in one file on purpose — the question text is
 * `INTERVIEW_QUESTIONS`, and both sides must use exactly that text, or a
 * question written yesterday stops suppressing its topic tomorrow.
 *
 * `planInterview` never guesses. A topic is dropped only for a **hard
 * signal** — CLAUDE.md guardrail 3, and the story's own decision:
 *
 * - the day's frontmatter already carries it (`people`/`projects`/`mood`/
 *   `energy` — fields the human confirmed, via the close suggestion or the
 *   mood/energy pickers, never re-derived here from free prose), or
 * - this same day's stream already shows a completed question/answer pair
 *   for it, from an earlier run.
 *
 * `events` and `open` have no frontmatter field standing for them, so only
 * the second signal can ever drop them.
 */

import type { DocLanguage, JournalDay } from '@shared/types';
import type { DateLike } from '@core/vault/paths';
import { appendToDay } from './day';
import { timeOf } from './dialog';
import { formatAnswer, parseStream } from './stream';
import { INTERVIEW_TOPICS, JournalError } from './types';
import type {
  InterviewMode,
  InterviewPlan,
  InterviewStep,
  InterviewTopic,
  JournalBlock,
  JournalDayDoc,
  JournalStore,
} from './types';

/**
 * The five questions, one per topic, per document language. Sentence case,
 * no emoji, calm tone (CLAUDE.md "Gaston" tone rules). The overlay (D5) shows
 * exactly this text and D2 writes exactly this text as the app's stream
 * block — one wording, read from one place, so file and screen never drift
 * apart.
 */
const INTERVIEW_QUESTIONS: Record<DocLanguage, Record<InterviewTopic, string>> = {
  de: {
    work: 'Woran hast du heute gearbeitet?',
    events: 'Was ist heute passiert, das dir aufgefallen ist?',
    people: 'Mit wem hattest du heute zu tun?',
    open: 'Was ist noch offen?',
    feeling: 'Wie hat sich der Tag angefühlt?',
  },
  en: {
    work: 'What did you work on today?',
    events: 'What happened today that stood out?',
    people: 'Who did you deal with today?',
    open: "What's still open?",
    feeling: 'How did today feel?',
  },
};

/**
 * Is `topic` already covered by a frontmatter field the day carries? These
 * fields are set only once the human confirmed them (day close, mood/energy
 * pickers) — that is exactly what makes them a hard signal instead of a
 * guess. `events` and `open` have no frontmatter counterpart, so they are
 * never dropped this way.
 */
function coveredByFrontmatter(day: JournalDay, topic: InterviewTopic): boolean {
  switch (topic) {
    case 'people':
      return day.people.length > 0;
    case 'work':
      return day.projects.length > 0;
    case 'feeling':
      return day.mood !== null || day.energy !== null;
    case 'events':
    case 'open':
      return false;
  }
}

/** Which topic (in either document language) this exact question text belongs
 *  to — `null` if it matches none. A day's document language can change
 *  between runs (settings), so both tables are checked, not just the
 *  requested one. */
function topicOfQuestion(text: string): InterviewTopic | null {
  const trimmed = text.trim();
  for (const language of Object.keys(INTERVIEW_QUESTIONS) as DocLanguage[]) {
    const table = INTERVIEW_QUESTIONS[language];
    const found = INTERVIEW_TOPICS.find((topic) => table[topic] === trimmed);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Topics already answered earlier the same day. An interview question is
 * recognizable in the stream because its text is, verbatim, one of
 * `INTERVIEW_QUESTIONS` — D2 writes it as the app's stream block, the same
 * shape `stream.ts#parseStream` reads back as an `answer` block. It only
 * counts as answered if human prose immediately follows it (an `entry`
 * block): a question with nothing behind it means the run was left before
 * submitting, and nothing was confirmed there to suppress it with.
 */
function answeredTopics(blocks: readonly JournalBlock[]): Set<InterviewTopic> {
  const answered = new Set<InterviewTopic>();
  for (let at = 0; at < blocks.length; at += 1) {
    const block = blocks[at];
    if (block === undefined || block.kind !== 'answer') continue;
    const topic = topicOfQuestion(block.text);
    if (topic === null) continue;
    const reply = blocks[at + 1];
    if (reply !== undefined && reply.kind === 'entry') answered.add(topic);
  }
  return answered;
}

/**
 * The interview steps still open for this day, in `INTERVIEW_TOPICS` order.
 *
 * `mode` is supplied by the caller rather than decided here: whether a model
 * route exists for the optional follow-up (`journal-chat`) is a question
 * about the running app's configuration, and this module — like every file
 * under `core/journal/` — knows nothing about `LlmGateway` (guardrail 4). The
 * IPC layer (D4) is the one place that can honestly answer it.
 */
export function planInterview(
  { day, doc }: JournalDayDoc,
  docLanguage: DocLanguage,
  mode: InterviewMode,
): InterviewPlan {
  const table = INTERVIEW_QUESTIONS[docLanguage] ?? INTERVIEW_QUESTIONS.de;
  const answered = answeredTopics(parseStream(doc.body));
  const steps: InterviewStep[] = INTERVIEW_TOPICS.filter(
    (topic) => !coveredByFrontmatter(day, topic) && !answered.has(topic),
  ).map((topic) => ({ topic, question: table[topic] }));
  return { steps, mode, finished: steps.length === 0 };
}

/**
 * Options of `recordAnswer` — the same shape `AppendAnswerOptions` (stream.ts)
 * has, minus `expectedHash`: appending adds and rewrites no line of the
 * user's, so a conflict here would be pure friction (story 012, Decisions —
 * the same trade-off `appendTurn`/`appendToDay` already document).
 */
export interface RecordAnswerOptions {
  docLanguage?: DocLanguage;
  /** Time 'HH:MM' for the question's speaker line. If missing, from `now`. */
  at?: string;
  now?: DateLike;
}

/**
 * Writes one answered interview step into the day: the question as the app's
 * blockquote, my answer as plain prose right below it.
 *
 * Both go through the one day-stream append surface 011 established
 * (`day.ts#appendToDay` with the `day` section), in **one** call — the block is
 * `formatAnswer`'s blockquote plus a blank line plus the answer, and
 * `vault/sections.ts#appendToSection` inserts it line by line, so the pair
 * lands as one unit. That matters twice over: no second blockquote format is
 * invented, and the file can never hold a question whose answer failed to be
 * written after it (which `planInterview` would then read as "asked but
 * unanswered" and ask again).
 *
 * Read back by `stream.ts#parseStream` this is an `answer` block immediately
 * followed by an `entry` block — exactly the pattern `planInterview` counts as
 * a covered topic.
 *
 * A skipped question is not this function's business: the caller simply does
 * not call it, and nothing is written. There is no skip path here.
 */
export async function recordAnswer(
  store: JournalStore,
  date: DateLike,
  step: InterviewStep,
  answer: string,
  options: RecordAnswerOptions = {},
): Promise<{ path: string; hash: string; at: string }> {
  const text = answer.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) {
    throw new JournalError('invalid', 'Eine Frage ohne Antwort wird nicht protokolliert.');
  }
  /* A question without text would produce a blockquote that `parseStream` does
     not read back as an `answer` — the pair would be unreadable, so neither
     half is written. */
  const question = step.question.trim();
  if (question.length === 0) {
    throw new JournalError('invalid', 'Eine Antwort ohne Frage wird nicht protokolliert.');
  }
  const at = options.at ?? timeOf(options.now ?? new Date());
  const docLanguage = options.docLanguage ?? 'de';
  const block = `${formatAnswer(question, at, docLanguage)}\n\n${text}`;
  const written = await appendToDay(store, date, 'day', block, { docLanguage });
  return { path: written.path, hash: written.hash, at };
}
