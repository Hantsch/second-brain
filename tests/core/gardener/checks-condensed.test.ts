/* Die Verdichtung-faellig-Pruefung (story 039, D2): rein deterministisch ueber
 * `areaInputs()` und `recordedSources()`, kein Modell, kein Dateizugriff.
 *
 * Der Kontext wird hier von Hand gebaut statt ueber `gardenerFixture()`
 * (`GardenerIndexView` ist strukturell erfuellbar, `types.ts`): der Vergleich
 * haengt an genauen Hash-Paaren, und die Grenzfaelle „verschwundener Eingang"
 * und „leere Area" verlangen ein Frontmatter mit `source_hashes`, das ein echter
 * Vault erst nach einem Verdichtungslauf so schreibt. Ein handgebautes
 * Frontmatter-Objekt ist dafuer die direktere Grundlage.
 */

import { describe, expect, it } from 'vitest';
import {
  condensationDueCheck,
  GERMAN_GARDENER_LABELS,
  inScope,
  LLM_ONLY_KINDS,
  scopeAdmits,
} from '@core/gardener';
import type { GardenerContext, GardenerIndexView } from '@core/gardener';
import { condensedAreaPath } from '@core/condense/paths';
import type { IndexedDoc } from '@core/index/types';
import type { Area, GardenerFinding } from '@shared/types';
import { makeDoc } from '../index/fixtures';

const TODAY = '2026-08-10';
const SLUG = 'testbereich';
const AREA_PATH = 'areas/testbereich.md';
const DAY_PATH = 'journal/2026/07/2026-07-15.md';
const ARTIFACT_PATH = condensedAreaPath(SLUG);

function areaDoc(body = 'Laufen, schlafen, weniger Kaffee.\n'): IndexedDoc {
  return makeDoc({
    path: AREA_PATH,
    docType: 'area',
    title: 'Testbereich',
    frontmatter: { type: 'area', title: 'Testbereich' },
    body,
  });
}

function dayDoc(body = 'Rueckenuebungen gemacht.'): IndexedDoc {
  return makeDoc({
    path: DAY_PATH,
    docType: 'journal',
    frontmatter: { type: 'journal', date: '2026-07-15', areas: [SLUG] },
    body,
  });
}

/** Ein Artefakt-Dokument mit dem angegebenen `sources:`/`source_hashes:`-Paar. */
function artifactDoc(sources: string[], hashes: Record<string, string>): IndexedDoc {
  return makeDoc({
    path: ARTIFACT_PATH,
    docType: 'condensed',
    title: 'Testbereich — verdichtet',
    frontmatter: {
      type: 'condensed',
      title: 'Testbereich — verdichtet',
      condensed_at: '2026-08-01T09:00:00+02:00',
      sources,
      source_hashes: hashes,
    },
    body: '## Stand\n\nAlt.\n',
  });
}

function area(): Area {
  const doc = areaDoc();
  return {
    path: AREA_PATH,
    slug: SLUG,
    title: 'Testbereich',
    scope: 'work',
    hash: doc.hash,
    noteCount: 0,
    openTodoCount: 0,
    notes: [],
  };
}

/** Handgebauter `GardenerIndexView` — Tests reichen ein Objekt herein (types.ts). */
function fakeIndex(docs: readonly IndexedDoc[], areas: readonly Area[]): GardenerIndexView {
  const byPath = new Map(docs.map((doc) => [doc.path, doc]));
  return {
    index: () => ({ docs, byPath, brokenLinks: [] }),
    pages: () => [],
    projects: () => [],
    sources: () => [],
    dumps: () => [],
    journal: () => [],
    todos: () => [],
    areas: () => areas,
  };
}

function ctxFor(docs: readonly IndexedDoc[], areas: readonly Area[]): GardenerContext {
  return {
    index: fakeIndex(docs, areas),
    modules: [],
    limits: { reviewAfterDays: 120, unfiledAfterDays: 14 },
    today: TODAY,
    ranAt: '2026-08-10T09:00:00.000Z',
    labels: GERMAN_GARDENER_LABELS,
    docLanguage: 'de',
    replyLanguage: 'de',
  };
}

describe('condensationDueCheck', () => {
  it('meldet eine faellige Verdichtung, wenn ein Eingangshash sich geaendert hat', () => {
    const areaFile = areaDoc();
    const day = dayDoc();
    const artifact = artifactDoc([AREA_PATH, DAY_PATH], {
      [AREA_PATH]: areaFile.hash,
      [DAY_PATH]: 'alter-hash-nicht-mehr-aktuell',
    });
    const ctx = ctxFor([areaFile, day, artifact], [area()]);

    const findings = condensationDueCheck.run(ctx);

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.kind).toBe('condensation-due');
    expect(finding?.severity).toBe('info');
    expect(finding?.fix).toBeNull();
    expect(finding?.module).toBeNull();
    expect(finding?.paths[0]).toBe(AREA_PATH);
    expect(finding?.paths[1]).toBe(ARTIFACT_PATH);
  });

  it('meldet die fehlende Variante, wenn Material da ist, aber kein Artefakt', () => {
    const areaFile = areaDoc();
    const ctx = ctxFor([areaFile], [area()]);

    const findings = condensationDueCheck.run(ctx);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.fix).toBeNull();
    expect(findings[0]?.module).toBeNull();
    expect(findings[0]?.paths).toEqual([AREA_PATH]);
  });

  it('schweigt bei einer unveraenderten Area', () => {
    const areaFile = areaDoc();
    const day = dayDoc();
    const artifact = artifactDoc([AREA_PATH, DAY_PATH], {
      [AREA_PATH]: areaFile.hash,
      [DAY_PATH]: day.hash,
    });
    const ctx = ctxFor([areaFile, day, artifact], [area()]);

    expect(condensationDueCheck.run(ctx)).toEqual([]);
  });

  it('schweigt bei einer leeren Area ohne Material und ohne Artefakt', () => {
    // Absichtlich ohne zugehoeriges Dokument: `areaInputs()` liefert dann eine
    // leere Liste, obwohl der Slug in `ctx.index.areas()` steht — genau der Fall,
    // den die Entscheidung "current.length === 0, kein Artefakt: kein Fund" prueft.
    const emptyArea: Area = {
      path: 'areas/leer.md',
      slug: 'leer',
      title: 'Leer',
      scope: 'work',
      hash: 'x'.repeat(64),
      noteCount: 0,
      openTodoCount: 0,
      notes: [],
    };
    const ctx = ctxFor([], [emptyArea]);

    expect(condensationDueCheck.run(ctx)).toEqual([]);
  });

  it('loest durch einen verschwundenen Eingang allein nichts aus', () => {
    const areaFile = areaDoc();
    const day = dayDoc();
    // `source_hashes` nennt einen dritten Pfad, den es unter den aktuellen
    // Eingaengen nicht mehr gibt (z. B. ein Tageseintrag, der aus dem
    // 90-Tage-Fenster gerutscht ist) — beide aktuellen Eingaenge stimmen weiter.
    const vanished = 'journal/2026/01/2026-01-01.md';
    const artifact = artifactDoc([AREA_PATH, DAY_PATH, vanished], {
      [AREA_PATH]: areaFile.hash,
      [DAY_PATH]: day.hash,
      [vanished]: 'irgendein-hash',
    });
    const ctx = ctxFor([areaFile, day, artifact], [area()]);

    expect(condensationDueCheck.run(ctx)).toEqual([]);
  });

  it('meldet einen Fund, wenn ein sources-Eintrag keinen Hash hat', () => {
    const areaFile = areaDoc();
    const day = dayDoc();
    // `source_hashes` nennt nur die Area-Datei — der Tageseintrag steht in
    // `sources:`, aber ohne verzeichneten Hash, gilt also als geaendert.
    const artifact = artifactDoc([AREA_PATH, DAY_PATH], { [AREA_PATH]: areaFile.hash });
    const ctx = ctxFor([areaFile, day, artifact], [area()]);

    const findings = condensationDueCheck.run(ctx);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.paths).toEqual([AREA_PATH, ARTIFACT_PATH]);
  });

  it('behaelt die Kennung bei unveraendertem Bestand und aendert sie bei neuem Material', () => {
    const areaFile = areaDoc();
    const day = dayDoc();
    const ctxFirst = ctxFor([areaFile], [area()]); // kein Artefakt: fehlende Variante
    const ctxSecond = ctxFor([areaDoc()], [area()]); // gleicher Bestand, neu gebaut

    const first = condensationDueCheck.run(ctxFirst);
    const second = condensationDueCheck.run(ctxSecond);
    expect(second[0]?.id).toBe(first[0]?.id);

    const changedDoc = areaDoc('Ganz anderer Inhalt als vorher.\n');
    const ctxChanged = ctxFor([changedDoc, day], [{ ...area(), hash: changedDoc.hash }]);
    const changed = condensationDueCheck.run(ctxChanged);
    expect(changed[0]?.id).not.toBe(first[0]?.id);
  });
});

/* Konformitaet (039, D4): der Check haengt an keinem Modell, seine Schwere ist
 * `info`, und er nimmt an einem eingegrenzten Lauf genauso teil wie jede andere
 * Befundart — geprueft ueber `scopeAdmits`/`inScope` (`run-scope.ts`), nicht ueber
 * eine neu erfundene Mechanik. */
describe('condensationDueCheck: Konformitaet', () => {
  it('steht nicht in LLM_ONLY_KINDS — der Check laeuft ohne Modell', () => {
    // `run()` selbst nimmt gar kein Gateway entgegen (Signatur oben): das
    // Schweigen eines modellosen Laufs ueber diese Art ist ein echtes
    // Alles-in-Ordnung, kein blinder Fleck wie bei `contradiction`/`loose-end`.
    expect(LLM_ONLY_KINDS).not.toContain('condensation-due');
  });

  it('bleibt bei einem auf die eigene Art eingegrenzten Lauf erhalten, bei einer anderen faellt sie weg', () => {
    const areaFile = areaDoc();
    const ctx = ctxFor([areaFile], [area()]); // fehlende Variante: ein Fund
    const [finding] = condensationDueCheck.run(ctx);
    if (finding === undefined) throw new Error('kein Fund im Fixture-Bestand');

    expect(scopeAdmits({ kinds: ['condensation-due'] }, finding.kind, finding.module)).toBe(true);
    expect(scopeAdmits({ kinds: ['orphan'] }, finding.kind, finding.module)).toBe(false);
    expect(inScope(finding, { kinds: ['condensation-due'] })).toBe(true);
    expect(inScope(finding, { kinds: ['orphan'] })).toBe(false);
  });

  it('faellt bei einem auf ein Modul eingegrenzten Lauf weg — die Area gehoert zu keinem Modul', () => {
    const areaFile = areaDoc();
    const ctx = ctxFor([areaFile], [area()]);
    const [finding] = condensationDueCheck.run(ctx);
    if (finding === undefined) throw new Error('kein Fund im Fixture-Bestand');

    expect(finding.module).toBeNull();
    // `module: 'irgendein-modul'` ist ein Wert, `null` ein anderer — ein
    // Modul-Lauf will genau die Befunde seines Moduls, nicht "unbekannt".
    expect(scopeAdmits({ module: 'irgendein-modul' }, finding.kind, finding.module)).toBe(false);
    expect(inScope(finding, { module: 'irgendein-modul' })).toBe(false);
  });

  it('bleibt gehalten, wenn ein anderer Fund neben ihm im Bereich liegt und wird von ihm getrennt, wenn nicht', () => {
    const areaFile = areaDoc();
    const ctx = ctxFor([areaFile], [area()]);
    const [condensation] = condensationDueCheck.run(ctx);
    if (condensation === undefined) throw new Error('kein Fund im Fixture-Bestand');
    const orphan: GardenerFinding = {
      id: 'orphan:abc',
      kind: 'orphan',
      severity: 'info',
      title: 'verwaiste Seite',
      detail: '',
      paths: ['modules/anderes/wiki/concepts/verwaist.md'],
      module: 'anderes',
      foundAt: condensation.foundAt,
      fix: null,
    };
    const all = [condensation, orphan];

    const kindScoped = all.filter((entry) => inScope(entry, { kinds: ['condensation-due'] }));
    expect(kindScoped.map((entry) => entry.id)).toEqual([condensation.id]);

    const moduleScoped = all.filter((entry) => inScope(entry, { module: 'anderes' }));
    expect(moduleScoped.map((entry) => entry.id)).toEqual([orphan.id]);
  });
});
