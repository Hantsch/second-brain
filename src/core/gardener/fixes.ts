/**
 * Die Ein-Klick-Korrekturen. Sechs Aktionen, und **jede tut genau das, was ihre
 * Beschriftung sagt** — nicht mehr:
 *
 * | Aktion           | Was passiert                                                     |
 * | ---------------- | ---------------------------------------------------------------- |
 * | `add-to-index`   | eine Zeile in `wiki/index.md` (ueber `upsertEntries`)             |
 * | `add-links`      | **eine** Zeile in eine Seite: Verweis oder benannter Widerspruch  |
 * | `mark-reviewed`  | `reviewed: heute` im Frontmatter — genau eine Zeile              |
 * | `merge`          | **nichts.** Beide Seiten werden zum Vergleich geoeffnet           |
 * | `open-classify`  | nichts. Weg in den Inbox-Screen                                   |
 * | `open-ingest`    | nichts. Weg in den Quellen-Screen                                 |
 *
 * Drei Regeln, die ueber allem stehen:
 *
 * 1. **Frisch lesen, frisch pruefen.** Ein Befund ist ein Fund von vorhin; beim
 *    Klick wird die Datei neu gelesen, die Voraussetzung neu geprueft und mit dem
 *    **gerade gelesenen** Hash geschrieben. Ist der Befund ueberholt (Eintrag steht
 *    schon im Katalog, Widerspruch ist schon benannt), passiert nichts und der
 *    Aufrufer bekommt `invalid` — statt blind zu schreiben.
 * 2. **Die Vorschau ist die Zeile.** Bei `add-links` wird `fix.preview`
 *    wortwoertlich angehaengt. Was der Nutzer gelesen hat, steht danach in der
 *    Datei — kein neu formulierter Satz.
 * 3. **Rueckgaengig ist Pflicht.** Jeder Schreibvorgang legt vorher sein Protokoll
 *    (`undo.ts`) und gibt eine Marke zurueck. Die Chronik des Moduls bekommt einen
 *    `lint`-Eintrag; sie ist append-only und wird nicht zurueckgedreht.
 */

import type { DocLanguage, GardenerFinding, GardenerFix } from '@shared/types';
import { asDate } from '@core/index/text';
import { composeContent } from '@core/vault/compose';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { isoDay, wikiIndexPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import {
  appendParagraph,
  appendUnderSection,
  appendLog,
  pageRefOf,
  parseIndex,
  phrases,
  upsertEntries,
} from '@core/wiki';
import type { PageRef, WikiStore } from '@core/wiki';
import { summaryOfBody } from './catalog';
import { namesContradiction } from './relations';
import { GardenerError } from './types';
import { writeFixJournal } from './undo';
import type { FixStep } from './undo';

/** Laenger als das ist keine Zeile mehr, die ein Fix anhaengt. */
const MAX_LINE_CHARS = 400;

export interface FixDeps {
  store: WikiStore;
  /** Sprache der Zeilen, die geschrieben werden. */
  docLanguage?: DocLanguage;
  /** Das „jetzt". Tests geben eine feste Zeit. */
  now?: DateLike;
}

export interface FixResult {
  action: GardenerFix['action'];
  /** Dateien, deren Inhalt dieser Fix geaendert hat. */
  written: string[];
  /** Dateien, die die Oberflaeche oeffnen soll. */
  open: string[];
  /** Marke fuer `undoFix`; `null`, wenn nichts geschrieben wurde. */
  undoToken: string | null;
  /** Chronik mit dem `lint`-Eintrag; wird nicht zurueckgedreht. */
  logged: string | null;
}

/**
 * Eine gelesene Datei, so wie sie **jetzt** auf der Platte steht. `raw` ist der
 * volle Inhalt: aus ihm entsteht der Hash fuer den Schreibvorgang und der Stand,
 * auf den ein Rueckweg zurueckfaellt.
 */
export interface Current {
  path: string;
  raw: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Eine Aenderung: derselbe Pfad, davor und danach. */
export interface Change {
  path: string;
  before: string;
  next: string;
}

export async function readCurrent(store: WikiStore, path: string): Promise<Current> {
  const raw = await store.readText(path);
  if (raw === null) throw new GardenerError('not-found', `Datei fehlt: ${path}`);
  const parsed = parse(raw);
  return { path, raw, frontmatter: parsed.frontmatter, body: parsed.body };
}

export function refOf(current: Current): PageRef {
  const ref = pageRefOf(current.path, current.frontmatter);
  if (ref === null) throw new GardenerError('invalid', `Keine Wiki-Seite: ${current.path}`);
  return ref;
}

function pathAt(finding: GardenerFinding, at: number): string {
  const path = finding.paths[at];
  if (path === undefined) throw new GardenerError('invalid', `Befund ohne Pfad ${at}.`);
  return path;
}

/** Die Zeile aus der Vorschau — geprueft, aber nicht umformuliert. */
export function previewLine(finding: GardenerFinding, mustMention: string): string {
  const preview = finding.fix?.preview ?? '';
  const line = preview.trim();
  if (line.length === 0 || line.includes('\n') || line.length > MAX_LINE_CHARS) {
    throw new GardenerError('invalid', 'Die Vorschau ist keine einzelne Zeile.');
  }
  if (!line.includes(`[[${mustMention}]]`)) {
    throw new GardenerError('invalid', 'Die Vorschau nennt die verknuepfte Seite nicht.');
  }
  return line;
}

/**
 * Schreiben, protokollieren, in die Chronik eintragen. Das Protokoll entsteht
 * **vor** dem Schreiben: es traegt den Hash des kuenftigen Inhalts, und ein
 * Protokoll ohne passenden Hash bewirkt beim Zurueckdrehen nichts.
 */
export async function commit(
  deps: FixDeps,
  finding: GardenerFinding,
  changes: readonly Change[],
  touched: readonly string[],
  /* Aus der geschriebenen Seite abgeleitet, nicht aus dem Befund: die Chronik
     gehoert zu dem Modul, in dem wirklich etwas passiert ist. */
  module: string,
): Promise<FixResult> {
  const action = finding.fix?.action;
  if (action === undefined) throw new GardenerError('invalid', 'Befund ohne Fix.');
  const day = isoDay(deps.now ?? new Date());
  const token = createUndoToken(new Date(deps.now === undefined ? Date.now() : deps.now));
  const steps: FixStep[] = changes.map((change) => ({
    path: change.path,
    before: change.before,
    hashAfter: sha256(change.next),
  }));
  await writeFixJournal(deps.store, token, { version: 1, kind: finding.kind, action, steps });

  const written: string[] = [];
  for (const change of changes) {
    await deps.store.writeText(change.path, change.next, {
      expectedHash: sha256(change.before),
    });
    written.push(change.path);
  }

  let logged: string | null = null;
  if (module.length > 0) {
    const entry = await appendLog(
      deps.store,
      module,
      {
        kind: 'lint',
        day,
        touched: [...touched],
        findings: `${finding.kind} (${action})`,
      },
      { language: deps.docLanguage ?? 'de', now: day },
    );
    logged = entry.path;
  }
  return { action, written, open: [], undoToken: token, logged };
}

/** Einen Katalogeintrag nachtragen. */
async function addToIndex(deps: FixDeps, finding: GardenerFinding): Promise<FixResult> {
  const page = await readCurrent(deps.store, pathAt(finding, 0));
  const ref = refOf(page);
  /* Der Katalog wird aus dem Modul der Seite abgeleitet, nicht aus dem Befund:
     der Befund kommt ueber den IPC-Kanal herein, und ein Pfad von aussen soll
     nicht bestimmen, in welche Datei geschrieben wird. */
  const catalogPath = wikiIndexPath(ref.module);
  const catalog = await readCurrent(deps.store, catalogPath);

  const existing = parseIndex(catalog.raw).find((entry) => entry.slug === ref.slug);
  if (existing !== undefined && existing.summary.trim().length > 0) {
    throw new GardenerError('invalid', `„${ref.slug}" steht schon mit Einzeiler im Katalog.`);
  }
  /* Der Einzeiler aus der Vorschau, damit die geschriebene Zeile die versprochene
     ist; hat die Seite sich seither geaendert, wird er neu abgeleitet. */
  const preview = parseIndex(finding.fix?.preview ?? '')[0];
  const summary = preview?.summary ?? summaryOfBody(page.body);
  const next = upsertEntries(catalog.raw, [{ type: ref.type, slug: ref.slug, summary }], {
    language: deps.docLanguage ?? 'de',
  });
  if (next === catalog.raw) {
    throw new GardenerError('invalid', 'Am Katalog waere nichts zu aendern.');
  }
  return commit(
    deps,
    finding,
    [{ path: catalogPath, before: catalog.raw, next }],
    ['index.md', `[[${ref.slug}]]`],
    ref.module,
  );
}

/** `reviewed: heute` setzen — eine Zeile, sonst nichts. */
async function markReviewed(deps: FixDeps, finding: GardenerFinding): Promise<FixResult> {
  const page = await readCurrent(deps.store, pathAt(finding, 0));
  const ref = refOf(page);
  const day = isoDay(deps.now ?? new Date());
  if (asDate(page.frontmatter['reviewed']) === day) {
    throw new GardenerError('invalid', `„${ref.slug}" ist heute schon als geprueft markiert.`);
  }
  /* Bewusst ohne `updated`: geprueft heisst gelesen, nicht geaendert. Ein neues
     `updated` wuerde die Seite in jeder „zuletzt bearbeitet"-Liste nach oben
     schieben, ohne dass ein Zeichen anders ist. */
  const next = composeContent(page.path, page.raw, {
    path: page.path,
    frontmatter: { reviewed: day },
  });
  if (next === page.raw)
    throw new GardenerError('invalid', 'An der Seite waere nichts zu aendern.');
  return commit(
    deps,
    finding,
    [{ path: page.path, before: page.raw, next }],
    [`[[${ref.slug}]]`],
    ref.module,
  );
}

/**
 * Eine Zeile mit einem Wikilink anhaengen. Zwei Faelle, dieselbe Zusicherung:
 * angehaengt wird die Vorschau, wortwoertlich, an einer bestimmbaren Stelle.
 * Beim Widerspruch ist das der Abschnitt „Widersprueche" der ersten Seite, beim
 * verwaisten Verweis das Ende der einen Seite, die den Namen nennt.
 */
async function addLinks(deps: FixDeps, finding: GardenerFinding): Promise<FixResult> {
  const language = deps.docLanguage ?? 'de';
  const contradiction = finding.kind === 'contradiction';
  const targetPath = contradiction ? pathAt(finding, 0) : pathAt(finding, 1);
  const otherPath = contradiction ? pathAt(finding, 1) : pathAt(finding, 0);

  const target = await readCurrent(deps.store, targetPath);
  const targetRef = refOf(target);
  const other = await readCurrent(deps.store, otherPath);
  const otherRef = refOf(other);
  const line = previewLine(finding, otherRef.slug);

  if (contradiction) {
    if (namesContradiction(target, otherRef.slug)) {
      throw new GardenerError('invalid', 'Der Widerspruch ist auf der Seite schon benannt.');
    }
  } else if (target.body.includes(`[[${otherRef.slug}]]`)) {
    throw new GardenerError('invalid', 'Die Seite verlinkt das Ziel schon.');
  }

  /* Die Overview fuehrt ihre Verweise als Liste im Abschnitt „Seiten" — dort
     schreibt auch der Ingest hin. Jede andere Seite bekommt die Zeile als Absatz. */
  const body = contradiction
    ? appendUnderSection(target.body, phrases(language).contradictions, line)
    : targetRef.type === 'overview'
      ? appendUnderSection(target.body, phrases(language).pages, line)
      : appendParagraph(target.body, line, phrases(language).contradictions);
  const next = composeContent(target.path, target.raw, {
    path: target.path,
    frontmatter: { updated: isoDay(deps.now ?? new Date()) },
    body,
  });
  if (next === target.raw)
    throw new GardenerError('invalid', 'An der Seite waere nichts zu aendern.');

  return commit(
    deps,
    finding,
    [{ path: target.path, before: target.raw, next }],
    [`[[${targetRef.slug}]]`, `[[${otherRef.slug}]]`],
    targetRef.module,
  );
}

/**
 * Einen Fix ausfuehren. `merge`, `open-classify` und `open-ingest` schreiben
 * **nichts** — sie geben die Pfade zurueck, die die Oberflaeche oeffnen soll. Genau
 * das sagen ihre Beschriftungen auch.
 */
export async function applyFix(deps: FixDeps, finding: GardenerFinding): Promise<FixResult> {
  const fix = finding.fix;
  if (fix === null) throw new GardenerError('invalid', 'Dieser Befund hat keinen Fix.');

  if (fix.action === 'merge' || fix.action === 'open-classify' || fix.action === 'open-ingest') {
    return {
      action: fix.action,
      written: [],
      open: [...finding.paths],
      undoToken: null,
      logged: null,
    };
  }
  if (fix.action === 'add-to-index') return addToIndex(deps, finding);
  if (fix.action === 'mark-reviewed') return markReviewed(deps, finding);
  return addLinks(deps, finding);
}
