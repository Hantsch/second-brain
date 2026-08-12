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
