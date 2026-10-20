/* The section-heading migration (story 024, D7) over IPC: `vault:sectionPlan`
 * reads the vault fresh and reports which files still carry the other
 * document language's headings; `vault:sectionMigrate` runs a plan (or a
 * subset of it) through the engine in `@core/vault/section-migration`.
 *
 * The engine's own rule carries through unchanged at this boundary: plan and
 * apply are the same computation, so this module never caches a body between
 * the two calls — `sectionMigrate` re-reads every file through the real
 * store, exactly as `migrateOne` expects.
 */

import { applySectionMigration, planSectionMigration } from '@core/vault/section-migration';
import type {
  MigratableDoc,
  SectionMigrationEntry as CoreEntry,
  SectionMigrationStore,
} from '@core/vault/section-migration';
import type { SectionKind } from '@core/vault/section-names';
import type { DocLanguage } from '@shared/types';
import type { SectionMigrationEntry } from '@shared/ipc';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { settle } from './wiki-bridge';
import type { Services } from '../services';

const DOC_LANGUAGES: readonly DocLanguage[] = ['de', 'en'];

function requireDocLanguage(value: unknown): DocLanguage {
  if (typeof value === 'string' && (DOC_LANGUAGES as readonly string[]).includes(value)) {
    return value as DocLanguage;
  }
  throw fail('invalid', 'to: erwartet "de" oder "en"');
}

/**
 * Every markdown file in the vault, read fresh. `isMigratablePath` inside the
 * engine narrows this down further — reading everything here keeps this
 * module from duplicating that filter's rules about `raw/`, `.secondbrain/`
 * and wiki pages.
 */
async function readAllDocs(services: Services): Promise<MigratableDoc[]> {
  const store = services.requireStore();
  const paths: string[] = [];
  for await (const entry of store.walk({ ext: '.md', recursive: true })) {
    if (!entry.dir) paths.push(entry.path);
  }
  const docs: MigratableDoc[] = [];
  for (const path of paths) {
    const doc = await store.read(path);
    /* Gone between listing and reading (e.g. a concurrent delete) — the plan
       simply doesn't mention it, exactly like a file with nothing to do. */
    if (doc !== null) docs.push({ path: doc.path, body: doc.body, hash: doc.hash });
  }
  return docs;
}

const SECTION_KINDS: readonly SectionKind[] = [
  'notes',
  'todos',
  'state',
  'day',
  'facts',
  'dialogue',
];

/**
 * A plan entry crosses IPC as a plain string for `kind`; the engine only
 * takes it back as `SectionKind`. A request entry that isn't from this
 * app's own `vault:sectionPlan` (or was edited by hand) is rejected here
 * instead of trusted — the same stance `gardener:linkOrphan` takes toward a
 * bare path from the renderer.
 */
function requireSectionKind(value: string): SectionKind {
  if ((SECTION_KINDS as readonly string[]).includes(value)) return value as SectionKind;
  throw fail('invalid', `entries: unbekannte Abschnittsart "${value}"`);
}

/** A request entry, unchecked, into the shape the engine works on. */
function toCoreEntry(entry: SectionMigrationEntry): CoreEntry {
  return {
    path: entry.path,
    hash: entry.hash,
    renames: entry.renames.map((rename) => ({ ...rename, kind: requireSectionKind(rename.kind) })),
    folds: entry.folds.map((fold) => ({ ...fold, kind: requireSectionKind(fold.kind) })),
  };
}

function requireEntries(value: unknown): SectionMigrationEntry[] {
  if (!Array.isArray(value)) throw fail('invalid', 'entries: erwartet eine Liste');
  return value as SectionMigrationEntry[];
}

export function sectionMigrationHandlers(services: Services): HandlerMap {
  const store: SectionMigrationStore = {
    read: (path) => services.requireStore().read(path),
    write: (input) => services.requireStore().write(input),
  };

  return defineHandlers({
    'vault:sectionPlan': async ({ to }) => {
      const target = requireDocLanguage(to);
      const docs = await readAllDocs(services);
      const entries = planSectionMigration(docs, target);
      return { to: target, count: entries.length, entries };
    },

    'vault:sectionMigrate': async ({ to, entries }) => {
      const target = requireDocLanguage(to);
      const plan = requireEntries(entries).map(toCoreEntry);
      const results = await applySectionMigration(store, plan, target);
      const migratedPaths = results
        .filter((result) => result.outcome === 'migrated')
        .map((result) => result.path);
      if (migratedPaths.length > 0) await settle(services, migratedPaths, 'section-migration');
      return {
        results,
        migrated: migratedPaths.length,
        conflicts: results.filter((result) => result.outcome === 'conflict').length,
      };
    },
  });
}
