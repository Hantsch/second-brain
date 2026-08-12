/**
 * Formatier-Helfer der Rohquellen-Dateien: Zeitcodes, Dauer, Tabellenzellen und
 * das Zusammensetzen von Frontmatter plus Rumpf.
 *
 * Das YAML kommt aus `@core/vault/frontmatter` — es gibt genau einen Serialisierer
 * im Projekt. Hier wird nur vorher weggeraeumt, was leer ist: eine Rohquelle soll
 * `duration_seconds: null` nicht behaupten, wenn niemand die Dauer kennt.
 */

import { serialize } from '@core/vault/frontmatter';
import type { Frontmatter } from '@core/vault/frontmatter';

/** Leere Felder entfernen: null, undefined, leerer String, leere Liste. */
export function compact(fields: Frontmatter): Frontmatter {
  const out: Frontmatter = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Eine Markdown-Datei aus Frontmatter und Zeilen. Mehrere Leerzeilen am Ende
 * fallen weg, genau ein Umbruch bleibt — so wie der Vault-Store es schreibt.
 */
export function markdownDoc(frontmatter: Frontmatter, lines: readonly string[]): string {
  const body = lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return serialize(compact(frontmatter), `${body}\n`);
}

/** Sekunden → `MM:SS` bzw. `HH:MM:SS`. `padHours` erzwingt die breite Form. */
export function formatTimecode(seconds: number, options: { padHours?: boolean } = {}): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (hours > 0 || options.padHours === true) return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
  return `${pad(minutes)}:${pad(rest)}`;
}

/** Sekunden → `1h 12m 05s` fuer die menschenlesbare Dauer. */
export function formatDuration(seconds: number | null): string | null {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total === 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (hours > 0 || minutes > 0) parts.push(`${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}m`);
  parts.push(`${String(rest).padStart(2, '0')}s`);
  return parts.join(' ');
}

/** Pipes maskieren, Umbrueche entfernen — fuer Zellen in Markdown-Tabellen. */
export function escapeTableCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/** Zahl mit Tausendertrennung, sprachneutral (schmales Leerzeichen). */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
