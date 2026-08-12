/* Werkzeug des Seeds: Datum, YAML-Frontmatter, Schreiben mit Zeitstempel.
   Bewusst ohne Import aus src/: der Seed ist ein reines Node-Skript und muss
   auch ohne Build laufen. Das Format kommt aus docs/VAULT-FORMAT.md. */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const MONTHS = [
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
];

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

/** Lokales Datum als 'YYYY-MM-DD'. */
export function isoDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Zeitstempel ISO-8601 mit lokaler Zeitzone, z. B. '2026-08-10T14:32:11+02:00'. */
export function isoStamp(date) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const zone = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return (
    `${isoDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    zone
  );
}

/**
 * Uhr mit signierten Tagesabständen: negativ ist Vergangenheit, positiv Zukunft.
 * Alles im Demo-Vault hängt daran, damit der Bestand beim nächsten Seed-Lauf
 * wieder frisch ist (Fristen bleiben Fristen, Altes bleibt alt).
 */
export function createClock(base = new Date()) {
  const midnight = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const date = (offsetDays = 0, hhmm = '09:00') => {
    const result = new Date(midnight);
    result.setDate(result.getDate() + offsetDays);
    const [hours, minutes] = hhmm.split(':');
    result.setHours(Number(hours), Number(minutes), 0, 0);
    return result;
  };
  return {
    date,
    /** 'YYYY-MM-DD' */
    day: (offsetDays = 0) => isoDay(date(offsetDays)),
    /** ISO-Zeitstempel mit Zone */
    at: (offsetDays = 0, hhmm = '09:00') => isoStamp(date(offsetDays, hhmm)),
    /** 'Montag, 10. August 2026' — Titel eines Tageseintrags. */
    title: (offsetDays = 0) => {
      const value = date(offsetDays);
      return `${WEEKDAYS[value.getDay()]}, ${value.getDate()}. ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
    },
    /** 'YYYY-MM-DD-HHmm' — Namensteil eines Dumps. */
    stamp: (offsetDays = 0, hhmm = '09:00') => {
      const value = date(offsetDays, hhmm);
      return `${isoDay(value)}-${pad(value.getHours())}${pad(value.getMinutes())}`;
    },
    /** Echte Uhrzeit minus `hours` — für Dumps, die „gerade eben" entstanden sind. */
    hoursAgo: (hours) => new Date(base.getTime() - hours * 3600 * 1000),
  };
}

const YAML_KEYWORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~', '']);
/* Zeichen, bei denen YAML einen Wert deuten würde statt ihn zu lesen. */
const YAML_SPECIAL = /[:#[\]{},&*!|>'"%@`]/;

function scalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  const numeric = text.trim().length > 0 && !Number.isNaN(Number(text));
  const risky =
    YAML_KEYWORDS.has(text.toLowerCase()) ||
    numeric ||
    YAML_SPECIAL.test(text) ||
    /^[\s-]/.test(text) ||
    /\s$/.test(text);
  return risky ? `'${text.replace(/'/g, "''")}'` : text;
}

function isScalar(value) {
  return value === null || typeof value !== 'object';
}

/**
 * Frontmatter-Block wie in docs/VAULT-FORMAT.md: einfache Listen inline
 * (`tags: [a, b]`), Listen von Objekten als Blöcke (`waiting_on`).
 * `undefined` fällt weg — ein Feld, das nicht gesetzt ist, existiert nicht.
 */
export function frontmatter(fields) {
  const lines = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${key}: []`);
      else if (value.every(isScalar)) lines.push(`${key}: [${value.map(scalar).join(', ')}]`);
      else {
        lines.push(`${key}:`);
        for (const item of value) {
          const entries = Object.entries(item).filter(([, inner]) => inner !== undefined);
          entries.forEach(([innerKey, inner], index) => {
            lines.push(`${index === 0 ? '  - ' : '    '}${innerKey}: ${scalar(inner)}`);
          });
        }
      }
      continue;
    }
    if (value && typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [innerKey, inner] of Object.entries(value)) {
        lines.push(`  ${innerKey}: ${scalar(inner)}`);
      }
      continue;
    }
    lines.push(`${key}: ${scalar(value)}`);
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

/** Rumpf normalisieren wie der Kern: kein Vorspann, genau ein Umbruch am Ende. */
export function normalizeBody(body) {
  const text = String(body ?? '')
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '');
  return text.length === 0 ? '' : `${text}\n`;
}

/**
 * Schreibt den Vault und merkt sich, was entstanden ist. Zeitstempel werden
 * gesammelt und am Ende gesetzt — jedes Schreiben würde sie sonst überschreiben.
 */
export class Seeder {
  constructor(root) {
    this.root = root;
    /** @type {{path: string, bytes: number}[]} */
    this.files = [];
    /** @type {{path: string, when: Date}[]} */
    this.stamps = [];
    /** @type {Map<string, number>} */
    this.counters = new Map();
  }

  /** Rohe Datei. `when` setzt die mtime — davon hängen `lastTouch` und Alter ab. */
  write(relativePath, content, when) {
    const absolute = join(this.root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, 'utf8');
    this.files.push({ path: relativePath, bytes: Buffer.byteLength(content, 'utf8') });
    if (when) this.stamps.push({ path: relativePath, when });
    return relativePath;
  }

  /** Markdown mit Frontmatter. */
  doc(relativePath, fields, body, when) {
    const text = normalizeBody(body);
    return this.write(
      relativePath,
      `${frontmatter(fields)}${text.length > 0 ? `\n${text}` : ''}`,
      when,
    );
  }

  /** Markdown ohne Frontmatter — `wiki/log.md` und README tragen bewusst keins. */
  text(relativePath, body, when) {
    return this.write(relativePath, normalizeBody(body), when);
  }

  json(relativePath, value, when) {
    return this.write(relativePath, `${JSON.stringify(value, null, 2)}\n`, when);
  }

  mkdir(relativePath) {
    mkdirSync(join(this.root, relativePath), { recursive: true });
  }

  /** Zählt, was für die Zusammenfassung interessant ist. */
  bump(kind, amount = 1) {
    this.counters.set(kind, (this.counters.get(kind) ?? 0) + amount);
  }

  count(kind) {
    return this.counters.get(kind) ?? 0;
  }

  get bytes() {
    return this.files.reduce((sum, file) => sum + file.bytes, 0);
  }

  /** Setzt alle gemerkten Zeitstempel. Zum Schluss, sonst gehen sie verloren. */
  applyStamps() {
    for (const { path, when } of this.stamps) {
      const seconds = when.getTime() / 1000;
      utimesSync(join(this.root, path), seconds, seconds);
    }
  }
}
