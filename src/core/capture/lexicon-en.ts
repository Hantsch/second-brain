/**
 * The English word lists used for classification — the counterpart to the German
 * lists in `lexicon.ts`. Kept in its own file so the German lists stay untouched
 * when 'en' isn't requested, and so `lexicon.ts` stays under the soft line limit.
 *
 * English has no infinitive-at-end rule (see `signals.ts`), so there is no
 * counterpart to `REPORT_WORDS` or `NOT_A_VERB` here — those only exist to make
 * that German rule safe.
 */

import { anyWordRegex, wordRegex } from './words';

/** Phrasings that signal a journal entry. */
export const MOOD_WORDS_EN = wordRegex(
  'i\\s+feel|feels|feeling|stressed|tired|exhausted|overwhelmed|anxious|worried|sad|angry|' +
    'grateful|relieved|lonely|drained|slept\\s+badly|too\\s+much',
);

/** Phrasings that signal an intent: their presence turns a sentence into a task. */
export const TASK_WORDS_EN = wordRegex(
  "need\\s+to|have\\s+to|has\\s+to|must|should|todo|to-do|don't\\s+forget|remember\\s+to|urgent",
);

/** Verbs that, as the first word of a sentence, read as an imperative — a task. */
const TASK_VERB_STEMS_EN = [
  'call',
  'email',
  'send',
  'buy',
  'order',
  'book',
  'cancel',
  'check',
  'fix',
  'schedule',
  'prepare',
  'submit',
  'follow\\s+up',
  'pick\\s+up',
  'write',
  'ask',
  'pay',
  'renew',
];

/** Same verbs, anywhere in the sentence — used to build the imperative check. */
export const TASK_VERBS_EN = wordRegex(TASK_VERB_STEMS_EN.join('|'));

/** The verb list anchored to the start of the sentence: the imperative form. */
export const IMPERATIVE_START_EN = new RegExp(`^\\s*(?:${TASK_VERB_STEMS_EN.join('|')})\\b`, 'iu');

const WORK_STEMS_EN = ['customer', 'client', 'colleague', 'invoice', 'contract', 'office', 'boss'];

const PRIVATE_STEMS_EN = [
  'family',
  'wife',
  'husband',
  'kids',
  'daughter',
  'son',
  'garden',
  'apartment',
  'rent',
  'doctor',
  'dentist',
  'birthday',
  'groceries',
  'vacation',
  'weekend',
  'friends',
  'parents',
];

export const WORK_WORDS_EN = anyWordRegex(WORK_STEMS_EN);
export const PRIVATE_WORDS_EN = anyWordRegex(PRIVATE_STEMS_EN);

/** Prefixes that stand in front of the actual task in English text. */
export const TASK_PREFIX_EN =
  /^(?:todo|to-do)\s*[:-]\s*|^(?:i|we)\s+(?:need|have)\s+to\s+|^don't\s+forget\s+to\s+|^remember\s+to\s+/i;
