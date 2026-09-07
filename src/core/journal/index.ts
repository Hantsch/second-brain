/**
 * Oeffentliche Oberflaeche des Tagebuch-Kerns. Andere Module importieren von hier,
 * nicht aus den Einzeldateien.
 *
 * Der Weg eines Tages, in dieser Reihenfolge:
 *   `day`       Tagesdatei anlegen (idempotent), lesen, anhaengen, Stimmung setzen
 *   `dialog`    das Gespraech im Tageseintrag protokollieren und zurueck lesen (legacy)
 *   `stream`    „Tag" als ein Block-Strom: eigene Worte und Antworten der App,
 *               in Schreibreihenfolge (011) — lesen mit `parseStream`, schreiben
 *               mit `appendEntry`/`appendAnswer`
 *   `loose-ends` was ein Tag angekuendigt hat und niemand mehr erwaehnt hat
 *               (`findLooseEnds`) — reine Ableitung ueber Tage und Todos, ohne Uhr
 *   `loose-ends-llm` die optionale Modellstufe darauf (`modelLooseEnds`): findet,
 *               was die Regel nicht sieht, und verwirft jedes Zitat, das nicht
 *               wortwoertlich in der genannten Tagesdatei steht
 *   `interview` Fragebogen als Starthilfe (012): `planInterview` bestimmt, was
 *               von den fuenf festen Themen an einem Tag noch offen ist,
 *               `recordAnswer` schreibt eine beantwortete Frage als Paar
 *               (Frage als App-Blockzitat, Antwort als eigene Prosa) in den Strom
 *   `interview-followup` die optionale Rueckfrage zu einer schon beantworteten
 *               Frage (`interviewFollowup`, mit Modell) — die feste Themenmenge
 *               bleibt dabei unangetastet, das ist nur eine Zusatzfrage
 *   `legacy`    `foldLegacyDay`: den alten „Gespräch"-Abschnitt in den Strom
 *               falten — reine Textfunktion, wird nie von selbst aufgerufen
 *   `coach`     die drei Haltungen — zuhoeren, Tipps, analysieren
 *   `close`     Tagesabschluss: Todos, Warte-auf, Personen, Stimmung als Vorschlag
 *   `streak`    Serie, laengste Serie, Monat, Stimmungsverlauf
 *
 * Geschrieben wird nur, was der Mensch selbst gesagt hat, plus die Antwort, die
 * wirklich kam. Der Tagesabschluss schreibt nichts — er schlaegt vor.
 */

export {
  appendToDay,
  dayOf,
  ensureDay,
  journalTitle,
  listDays,
  newDayBody,
  newDayFrontmatter,
  pathFor,
  readDay,
  requireDay,
  setMood,
} from './day';
export { setClosed } from './closed';
export { reopenIfClosed } from './reopen';
export {
  appendTurn,
  dialogHistory,
  formatTurn,
  parseDialog,
  timeOf,
  type AppendTurnOptions,
} from './dialog';
export {
  appendAnswer,
  appendEntry,
  formatAnswer,
  parseStream,
  type AppendAnswerOptions,
  type AppendEntryOptions,
} from './stream';
export {
  findLooseEnds,
  looseEndId,
  sentencesOf,
  subjectTerms,
  type LooseEndDay,
  type LooseEndTodo,
} from './loose-ends';
export {
  MAX_LOOSE_END_DAYS,
  MAX_LOOSE_END_QUOTE_CHARS,
  MAX_TRACKED_TODOS,
  modelLooseEnds,
  type LooseEndModelInput,
  type LooseEndModelOptions,
  type LooseEndModelResult,
} from './loose-ends-llm';
export { answerLooseEnd, type AnswerLooseEndOptions } from './loose-end-answer';
export { planInterview, recordAnswer, type RecordAnswerOptions } from './interview';
export {
  interviewFollowup,
  type InterviewFollowupDeps,
  type InterviewFollowupInput,
  type InterviewFollowupResult,
} from './interview-followup';
export { foldLegacyDay } from './legacy';
export {
  dayText,
  isSectionOf,
  journalSections,
  rawDayText,
  sectionIn,
  sectionText,
  type JournalSectionKind,
  type JournalSections,
} from './sections';
export { coach, earlierDays, type EarlierDaysOptions } from './coach';
export {
  dayFacts,
  heuristicFacts,
  heuristicMood,
  knownPeople,
  sanitizeFacts,
  type DayFacts,
  type FactsDeps,
  type FactsInput,
} from './facts';
export { GERMAN_CLOSE_LABELS, closeDay } from './close';
export {
  DEFAULT_MOOD_SPAN,
  entriesInMonth,
  journalStreaks,
  lastEntryDate,
  longestStreak,
  moodHistory,
  type JournalStreakStats,
  type MoodPoint,
} from './streak';
export {
  DIALOG_HISTORY_TURNS,
  INTERVIEW_TOPICS,
  JournalError,
  MAX_EARLIER_DAYS,
  type CloseDayDeps,
  type CloseFindings,
  type CloseLabels,
  type CoachDeps,
  type CoachEvidence,
  type CoachResult,
  type DayCloseSuggestion,
  type DialogRole,
  type DialogTurn,
  type EnsureDayResult,
  type InterviewLooseEnd,
  type InterviewMode,
  type InterviewPlan,
  type InterviewStep,
  type InterviewTopic,
  type JournalBlock,
  type JournalDayDoc,
  type JournalFrontmatterSuggestion,
  type JournalIndexView,
  type JournalOptions,
  type JournalStore,
  type MoodPatch,
} from './types';
