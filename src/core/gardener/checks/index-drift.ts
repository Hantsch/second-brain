/**
 * Index-Drift: der Katalog eines Moduls und der Bestand laufen auseinander.
 *
 * Gerechnet wird ueber `diffIndex` aus `core/wiki/index-md.ts` — dieselbe Funktion,
 * mit der der Ingest den Katalog pflegt. Sie kennt gewachsene Rubriken („Begriffe"
 * statt „Konzepte") und eigene Zeilen des Nutzers; hier wird nichts nachgebaut.
 *
 * Vier Formen, drei Haltungen:
 * - **fehlt** (Seite ohne Eintrag) und **ohne Einzeiler**: dafuer gibt es einen Fix,
 *   denn die Zeile ist maschinell bestimmbar (`catalog.ts`).
 * - **falsche Rubrik** und **Eintrag ohne Seite**: nur melden. Eine Zeile des
 *   Nutzers zu verschieben oder zu loeschen ist seine Entscheidung, nicht unsere.
 * - **kein Katalog**: ein Befund fuer das Modul, nicht dreissig fuer seine Seiten.
 */

import type { GardenerFinding, WikiPage } from '@shared/types';
import { diffIndex } from '@core/wiki';
import type { WikiIndexEntry } from '@core/wiki';
import { catalogLine } from '../catalog';
import { buildFinding, buildFix } from '../types';
import type { Check, GardenerContext, GardenerModuleView } from '../types';
import type { IndexDriftKind } from '../labels';

interface Drift {
  drift: IndexDriftKind;
  /** Slug, um den es geht — Teil der stabilen Kennung. */
  slug: string;
  subject: string;
  paths: string[];
  preview: string | null;
}

function pageOfSlug(module: GardenerModuleView, slug: string): WikiPage | undefined {
  return module.pages.find((page) => page.slug === slug);
}

function driftOfEntry(module: GardenerModuleView, entry: WikiIndexEntry): Drift | null {
  const page = pageOfSlug(module, entry.slug);
  if (page === undefined) return null;
  const empty = entry.summary.trim().length === 0;
  return {
    drift: empty ? 'summary' : 'category',
    slug: entry.slug,
    subject: page.title,
    paths: [page.path, module.catalogPath],
    preview: empty
      ? catalogLine({ slug: page.slug, type: page.type, summary: page.excerpt })
      : null,
  };
}

function driftsOf(module: GardenerModuleView): Drift[] {
  if (module.catalog === null) {
    return [
      {
        drift: 'no-catalog',
        slug: '',
        subject: module.slug,
        paths: [module.catalogPath],
        preview: null,
      },
    ];
  }
  const diff = diffIndex(
    module.catalog,
    module.pages.map((page) => ({ slug: page.slug, type: page.type, title: page.title })),
  );
  const drifts: Drift[] = [];
  for (const missing of diff.missing) {
    const page = pageOfSlug(module, missing.slug);
    if (page === undefined) continue;
    drifts.push({
      drift: 'missing',
      slug: page.slug,
      subject: page.title,
      paths: [page.path, module.catalogPath],
      preview: catalogLine({ slug: page.slug, type: page.type, summary: page.excerpt }),
    });
  }
  for (const entry of diff.outdated) {
    const drift = driftOfEntry(module, entry);
    if (drift !== null) drifts.push(drift);
  }
  for (const entry of diff.orphaned) {
    drifts.push({
      drift: 'stale-entry',
      slug: entry.slug,
      subject: entry.slug,
      paths: [module.catalogPath],
      preview: null,
    });
  }
  return drifts;
}

export const indexDriftCheck: Check = {
  kind: 'index-drift',

  run(ctx: GardenerContext): GardenerFinding[] {
    const findings: GardenerFinding[] = [];
    for (const module of ctx.modules) {
      for (const drift of driftsOf(module)) {
        const text = ctx.labels.indexDrift(drift.subject, drift.drift);
        findings.push(
          buildFinding(ctx, {
            kind: 'index-drift',
            severity: drift.drift === 'no-catalog' ? 'warn' : 'info',
            title: text.title,
            detail: text.detail,
            paths: drift.paths,
            module: module.slug,
            key: [module.catalogPath, drift.slug, drift.drift],
            fix: drift.preview === null ? null : buildFix(ctx, 'add-to-index', drift.preview),
          }),
        );
      }
    }
    return findings;
  },
};
