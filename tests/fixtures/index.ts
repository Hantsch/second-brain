/* Zugang zu den Fixture-Dateien. Sie liegen als echte Dateien daneben, nicht als
 * Zeichenketten im Code — so kann man den Bestand in Obsidian aufschlagen und
 * sieht dasselbe, was die Tests sehen.
 *
 * `tests/fixtures/vault/` ist ein kleiner, in sich stimmiger Bestand: ein
 * Arbeits- und ein Privatprojekt, ein Bereich, ein Tageseintrag mit Dialog, ein
 * Dump, ein Wissens-Modul mit Katalog und Chronik, eine Rohquelle.
 *
 * Er trägt absichtlich vier Pflege-Befunde — Tests des Gardeners brauchen etwas
 * zu finden:
 *   - kaputter Wikilink: `entities/oauth2.md` → `[[device-code-flow]]`
 *   - verwaiste Seite:   `entities/scim.md` (keine eingehenden Links)
 *   - fehlt im Katalog:  `entities/scim.md` steht nicht in `wiki/index.md`
 *   - unverdichtete Quelle: `raw/web/...ingest.json` mit `sourcePage: null`
 *
 * Alle Daten liegen um `TODAY` aus `tests/helpers/time.ts` (2026-08-10). Wer mit
 * Altersrechnungen arbeitet, friert die Uhr mit `freezeTime()` ein.
 *
 * `tests/fixtures/claude/projects/` enthält nachgebaute Claude-Code-Sessions
 * im JSONL-Format (Kopf, Werkzeugaufruf, Ergebnis, Antwort, Summary-Zeile). Der
 * Aufbau ist an `../claude-control/test/fixtures` abgeschaut, aber nachgebaut —
 * vor dem Verlassen darauf bitte gegen eine echte Datei prüfen. Absichtlich
 * dabei: ein Ordner mit großem Laufwerksbuchstaben (`C--development-...`, die
 * Schreibweise ist auf der Platte inkonsistent), eine Datei mit kaputter Zeile
 * und halbgeschriebenem Ende, und eine leere Datei — die drei Fälle, die der
 * Leser aushalten muss.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

/** Absoluter Pfad einer Fixture-Datei oder eines Fixture-Ordners. */
export function fixturePath(...parts: string[]): string {
  return join(FIXTURES_DIR, ...parts);
}

/** Inhalt einer Fixture-Datei als Text. */
export function readFixture(...parts: string[]): string {
  return readFileSync(fixturePath(...parts), 'utf8');
}

/** Wurzel des Fixture-Vaults — für Tests, die nur lesen und nichts anlegen. */
export const FIXTURE_VAULT_DIR = fixturePath('vault');

/** Wurzel der nachgebauten Claude-Projekte (entspricht `~/.claude/projects`). */
export const CLAUDE_PROJECTS_DIR = fixturePath('claude', 'projects');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute, out);
    else out.push(absolute);
  }
  return out;
}

/**
 * Der Fixture-Vault als Abbildung „vault-relativer Pfad → Inhalt".
 * `createTempVault({ sample: true })` schreibt genau das in einen Temp-Ordner.
 */
export function fixtureVaultFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const absolute of walk(FIXTURE_VAULT_DIR)) {
    const path = relative(FIXTURE_VAULT_DIR, absolute).replace(/\\/g, '/');
    files[path] = readFileSync(absolute, 'utf8');
  }
  return files;
}

/* ── Projektnotizen (additiv) ──────────────────────────────────────────────
 *
 * Zwei Notizen mit demselben Stichwort, je eine im Arbeits- und im
 * Privatprojekt des Fixture-Vaults. Sie liegen bewusst **nicht** in
 * `tests/fixtures/vault/`: der Bestand dort ist auf Zaehlungen und
 * Pflege-Befunde festgelegt. Wer den Projektfilter prueft, legt sie ueber
 * `wikiFixture(extra)` bzw. `createTempVault({ files })` obendrauf.
 */

/** Projekt-Slug des Arbeitsprojekts im Fixture-Vault. */
export const WORK_PROJECT = 'kundenportal-relaunch';
/** Projekt-Slug des Privatprojekts im Fixture-Vault. */
export const PRIVATE_PROJECT = 'hochbeet-bauen';

export const WORK_NOTE_PATH = `projects/work/${WORK_PROJECT}/notes/2026-08-09-zeitplan.md`;
export const PRIVATE_NOTE_PATH = `projects/private/${PRIVATE_PROJECT}/notes/2026-08-09-zeitplan.md`;

/** Steht in beiden Notizen und sonst nirgends — ohne Filter treffen beide. */
export const PROJECT_QUESTION = 'Wie sieht der Zeitplan aus?';

function projectNote(title: string, tag: string, body: string): string {
  return [
    '---',
    'type: note',
    `title: ${title}`,
    'created: 2026-08-09',
    'updated: 2026-08-09',
    `tags: [${tag}]`,
    'lang: de',
    '---',
    '',
    body,
    '',
  ].join('\n');
}

/** Die beiden Notizen als „vault-relativer Pfad → Inhalt". */
export function projectNoteFiles(): Record<string, string> {
  return {
    [WORK_NOTE_PATH]: projectNote(
      'Zeitplan bis zur Abnahme',
      'kundenportal',
      [
        'Der Zeitplan bis zur Abnahme steht: Mittwoch die Ladezeiten der Angebotsliste,',
        'Donnerstag der Fallback für abgelaufene Sitzungen, Freitag das Protokoll mit Miriam.',
      ].join('\n'),
    ),
    [PRIVATE_NOTE_PATH]: projectNote(
      'Zeitplan für den Aufbau',
      'garten',
      [
        'Der Zeitplan für den Aufbau: Samstag die Bretter sägen, Sonntag die Noppenfolie',
        'tackern. Erde und Kompost holen wir erst danach.',
      ].join('\n'),
    ),
  };
}
