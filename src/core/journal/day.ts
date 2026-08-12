/**
 * Die Tagesdatei: ein Tag ist eine Datei (`journal/YYYY/MM/YYYY-MM-DD.md`).
 *
 * `ensureDay` ist der einzige Weg, auf dem ein Tageseintrag entsteht — und er ist
 * **idempotent**: liegt die Datei schon, wird sie gelesen und nicht angefasst.
 * Zweimal aufgerufen aendert er nichts, auch nicht das Frontmatter des Nutzers.
 *
 * Angelegt wird genau, was docs/VAULT-FORMAT.md zeigt: `type`, der ausgeschriebene
 * Titel in der Dokumentsprache, `date`, `tags` — und die drei leeren Abschnitte.
 * Mehr nicht: was hier nicht steht, wird nicht geschrieben.
 */

import type { DocLanguage, JournalDay, JournalFrontmatter } from '@shared/types';
import { toIndexedDoc } from '@core/index/build';
import { deriveJournalDays, toJournalDay } from '@core/index/journal';
import { toVaultDoc } from '@core/vault/doc';
import { isoDay, journalPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { journalSections, sectionIn } from './sections';
import type { JournalSectionKind } from './sections';
import { JournalError } from './types';
import type {
  EnsureDayResult,
  JournalDayDoc,
  JournalIndexView,
  JournalStore,
  MoodPatch,
} from './types';

/** Wochentage in der Dokumentsprache, Sonntag zuerst (wie `Date.getUTCDay`). */
const WEEKDAYS: Record<DocLanguage, readonly string[]> = {
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const MONTHS: Record<DocLanguage, readonly string[]> = {
  de: [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

/** Stimmung und Energie sind eine Skala von 1 bis 5 (docs/VAULT-FORMAT.md). */
const MOOD_MIN = 1;
const MOOD_MAX = 5;

/**
 * Kalendertag aus einer beliebigen Angabe. Wirft, wenn es keiner ist — auch bei
 * einem Tag, den der Kalender nicht hat: aus dem 31. Februar wuerde sonst eine
 * Datei, die kein Datum meint.
 */
export function dayOf(date: DateLike): string {
  const day = isoDay(date);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new JournalError('invalid', `Kein Kalendertag: ${String(date)}`);
  }
  return day;
}

/** `journal/2026/08/2026-08-10.md` */
export function pathFor(date: DateLike): string {
  return journalPath(dayOf(date));
}

/**
 * Das ausgeschriebene Datum in der Dokumentsprache: 'Montag, 10. August 2026'
 * bzw. 'Monday, 10 August 2026'. Deterministisch aus eigenen Tabellen, damit der
 * Titel nicht von der ICU-Fassung des Rechners abhaengt.
 */
export function journalTitle(date: DateLike, docLanguage: DocLanguage = 'de'): string {
  const day = dayOf(date);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const number = Number(day.slice(8, 10));
  const weekday = WEEKDAYS[docLanguage] ?? WEEKDAYS.de;
  const months = MONTHS[docLanguage] ?? MONTHS.de;
  const name = weekday[new Date(Date.UTC(year, month - 1, number)).getUTCDay()] ?? '';
  const monthName = months[month - 1] ?? '';
  return docLanguage === 'en'
    ? `${name}, ${number} ${monthName} ${year}`
    : `${name}, ${number}. ${monthName} ${year}`;
}

/** Das Frontmatter eines neuen Tageseintrags nach docs/VAULT-FORMAT.md. */
export function newDayFrontmatter(
  date: DateLike,
  docLanguage: DocLanguage = 'de',
): Record<string, unknown> {
  const day = dayOf(date);
  return {
    type: 'journal',
    title: journalTitle(day, docLanguage),
    date: day,
    /* `lang` haelt fest, in welcher Sprache Titel und Abschnitte stehen — sonst
       waere nach einem Sprachwechsel nicht mehr erkennbar, warum die
       Ueberschriften der alten Tage anders heissen. */
    lang: docLanguage,
    tags: [],
  };
}

/** Der Rumpf eines neuen Tageseintrags: die drei Abschnitte, noch leer. */
export function newDayBody(docLanguage: DocLanguage = 'de'): string {
  const sections = journalSections(docLanguage);
  return [`## ${sections.day}`, '', `## ${sections.dialogue}`, '', `## ${sections.facts}`, ''].join(
    '\n',
  );
}

/**
 * Einen Tageseintrag lesen. `null`, wenn es die Datei nicht gibt.
 *
 * Gelesen wird **einmal**; Anzeigeform und Dokument entstehen aus demselben Text.
 * Zwei Lesevorgaenge koennten zwei Staende sehen, und dann waere der Hash, mit
 * dem der Aufrufer spaeter schreibt, nicht der des Textes, den er gelesen hat.
 */
export async function readDay(store: JournalStore, date: DateLike): Promise<JournalDayDoc | null> {
  const path = pathFor(date);
  const content = await store.readText(path);
  if (content === null) return null;
  const stat = await store.stat(path);
  if (stat === null) return null;
  const doc = toVaultDoc<JournalFrontmatter>(path, content, {
    modified: stat.modified,
    size: stat.size,
  });
  const indexed = toIndexedDoc(path, content, { ...stat, path, dir: false });
  return { day: toJournalDay(indexed), doc };
}

/** Wie `readDay`, aber ein fehlender Tag ist ein Fehler. */
export async function requireDay(store: JournalStore, date: DateLike): Promise<JournalDayDoc> {
  const found = await readDay(store, date);
  if (found === null) {
    throw new JournalError('not-found', `Kein Tageseintrag fuer ${dayOf(date)}.`);
  }
  return found;
}

/**
 * Den Tageseintrag bereitstellen. Existiert er, wird nichts geschrieben —
 * `created: false` sagt das ausdruecklich.
 */
export async function ensureDay(
  store: JournalStore,
  date: DateLike,
  docLanguage: DocLanguage = 'de',
): Promise<EnsureDayResult> {
  const path = pathFor(date);
  const existing = await readDay(store, date);
  if (existing !== null) return { path, created: false, ...existing };
  await store.create(path, newDayFrontmatter(date, docLanguage), newDayBody(docLanguage));
  return { path, created: true, ...(await requireDay(store, date)) };
}

/**
 * Text unter einem Abschnitt des Tageseintrags anhaengen; fehlt die Datei, wird
 * sie angelegt.
 *
 * Ohne `expectedHash`: Anhaengen fuegt hinzu und schreibt keine Nutzerzeile um.
 * Ein Konflikt waere hier reine Reibung — der Store liest den aktuellen Stand und
 * setzt den Block darunter.
 */
export async function appendToDay(
  store: JournalStore,
  date: DateLike,
  section: JournalSectionKind | string,
  text: string,
  options: { docLanguage?: DocLanguage; expectedHash?: string } = {},
): Promise<{ path: string; hash: string; sectionCreated: boolean }> {
  const block = text.replace(/\r\n/g, '\n').trim();
  if (block.length === 0) {
    throw new JournalError('invalid', 'Ein leerer Text wird nicht angehaengt.');
  }
  const docLanguage = options.docLanguage ?? 'de';
  const day = await ensureDay(store, date, docLanguage);
  const heading = isKind(section) ? sectionIn(day.doc.body, section, docLanguage) : section.trim();
  const result = await store.append(day.path, heading, block, {
    ...(options.expectedHash === undefined ? {} : { expectedHash: options.expectedHash }),
  });
  return { path: result.path, hash: result.hash, sectionCreated: result.sectionCreated };
}

function isKind(section: string): section is JournalSectionKind {
  return section === 'day' || section === 'dialogue' || section === 'facts';
}

/**
 * Die Tageseintraege aus dem Index, der juengste zuerst. Luecken bleiben Luecken:
 * ein Tag ohne Datei taucht nicht als leerer Eintrag auf.
 */
export function listDays(index: JournalIndexView, limit?: number): JournalDay[] {
  const days = deriveJournalDays(index.index().docs);
  return limit === undefined ? days : days.slice(0, Math.max(0, limit));
}

function levelOf(value: number | null | undefined, field: string): number | null | undefined {
  if (value === undefined || value === null) return value;
  const rounded = Math.trunc(value);
  if (!Number.isFinite(value) || rounded < MOOD_MIN || rounded > MOOD_MAX) {
    throw new JournalError('invalid', `${field} liegt ausserhalb von ${MOOD_MIN}–${MOOD_MAX}.`);
  }
  return rounded;
}

/**
 * Stimmung und Energie setzen — genau diese Felder, sonst nichts.
 *
 * Der Weg fuehrt ueber den Frontmatter-Patch des Stores: geaendert wird die eine
 * Zeile, die sich unterscheidet. Flow-Listen, Anfuehrungszeichen und Kommentare
 * des Nutzers bleiben Zeichen fuer Zeichen stehen.
 *
 * `updated` bleibt unberuehrt. Ein Tageseintrag ist ueber `date` identifiziert,
 * und wie frisch er ist, sagt die mtime (`core/index/build.ts`) — ein zusaetzliches
 * Feld im Frontmatter waere eine Aenderung, die niemand verlangt hat.
 */
export async function setMood(
  store: JournalStore,
  date: DateLike,
  patch: MoodPatch,
  options: { expectedHash?: string } = {},
): Promise<JournalDay> {
  const mood = levelOf(patch.mood, 'mood');
  const energy = levelOf(patch.energy, 'energy');
  if (mood === undefined && energy === undefined) {
    throw new JournalError('invalid', 'Weder Stimmung noch Energie angegeben.');
  }
  const current = await requireDay(store, date);
  await store.write({
    path: current.doc.path,
    frontmatter: {
      ...(mood === undefined ? {} : { mood }),
      ...(energy === undefined ? {} : { energy }),
    },
    /* Der Hash, den der Aufrufer beim Oeffnen gelesen hat — sonst der gerade
       gelesene. So schlaegt ein Schreibvorgang auf einem fremden Stand fehl,
       statt die Aenderung des Nutzers zu ueberschreiben. */
    expectedHash: options.expectedHash ?? current.doc.hash,
  });
  return (await requireDay(store, date)).day;
}
