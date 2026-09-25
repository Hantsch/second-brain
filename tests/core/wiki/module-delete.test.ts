/* `deleteModule` is measured against `discardPage`'s promise (tests/core/gardener/
 * discard.test.ts) and D2's `renameModule` suite: what the preview announced, it
 * did; a stale preview writes nothing; a failure half-way leaves the vault
 * byte-identical; and one mark undoes all of it. The one thing worth pinning
 * specifically for a delete (story 063's decisions) is what stays *untouched*:
 * raw payloads, inbound wikilinks from outside the module, and dump `filed_into`
 * receipts. */

import { describe, expect, it } from 'vitest';
import { fixJournalPath, parseFixJournal, undoFix } from '@core/gardener';
import { parse } from '@core/vault/frontmatter';
import type { MemoryVaultStore } from '@core/vault/memory-store';
import { VaultConflictError } from '@core/vault/types';
import { deleteModule, deletePlan, WikiError } from '@core/wiki';
import type { DeleteWriteDeps, ModuleLifecycleDeps } from '@core/wiki';
import { NOW_MS } from '../../helpers/time';
import {
  DUMP,
  LOG,
  MODULE,
  MODULE_FILE,
  OTHER_PAGE,
  PAGE_A,
  PROJECT,
  PROTOCOL_ONE,
  PROTOCOL_TWO,
  RAW_ONE,
  RAW_TWO,
  fixture,
} from './module-lifecycle-fixture';

const MODULE_DIR = `modules/${MODULE}`;

/** Every file outside `.secondbrain/` — the vault as the user sees it. The journal
 * lives in the trash, and a rolled-back attempt may leave it behind. */
function vaultFiles(store: MemoryVaultStore): Record<string, string> {
  return Object.fromEntries(
    Object.entries(store.allFiles()).filter(([path]) => !path.startsWith('.secondbrain/')),
  );
}

function under(files: Record<string, string>, dir: string): string[] {
  return Object.keys(files).filter((path) => path.startsWith(`${dir}/`));
}

type Overrides = Partial<Pick<MemoryVaultStore, 'writeText' | 'delete'>>;

/** The same store with `writeText`/`delete` swapped — the hooks call through themselves. */
function storeWith(store: MemoryVaultStore, overrides: Overrides): MemoryVaultStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      const override = overrides[property as keyof Overrides];
      return override ?? Reflect.get(target, property, receiver);
    },
  });
}

/** A store whose `nth` content write (anything outside `.secondbrain/`) throws `error`. */
function failingOnWrite(store: MemoryVaultStore, nth: number, error: Error): MemoryVaultStore {
  let count = 0;
  return storeWith(store, {
    writeText: async (path, content, options) => {
      if (!path.startsWith('.secondbrain/')) {
        count += 1;
        if (count === nth) throw error;
      }
      return store.writeText(path, content, options);
    },
  });
}

async function setup() {
  const base = await fixture();
  const plan = await deletePlan(base.deps, { slug: MODULE });
  return { ...base, plan };
}

function writeDeps(deps: ModuleLifecycleDeps, store = deps.store): DeleteWriteDeps {
  return { store, index: deps.index, now: new Date(NOW_MS) };
}

function frontmatterOf(store: MemoryVaultStore, path: string): Record<string, unknown> {
  const raw = store.allFiles()[path];
  if (raw === undefined) throw new Error(`missing in fixture: ${path}`);
  return parse(raw).frontmatter;
}

const isConflict = (error: unknown): boolean =>
  error instanceof WikiError && error.code === 'conflict';

describe('deleteModule', () => {
  it('trashes the whole module folder under one mark and rewrites every reference', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);

    const result = await deleteModule(writeDeps(deps), {
      slug: MODULE,
      fingerprint: plan.fingerprint,
    });

    const files = store.allFiles();
    expect(under(files, MODULE_DIR)).toEqual([]);
    expect(await store.exists(MODULE_DIR)).toBe(false);
    expect(result.deleted).toBe(MODULE_DIR);

    // One mark: `result.undoToken` names the journal, and the journal's own `deleted.token`
    // names the `VaultStore.delete` mark that holds the folder — nested, as `discardPage`
    // nests a page's delete mark.
    const journal = parseFixJournal(files[fixJournalPath(result.undoToken)] ?? null);
    expect(journal?.kind).toBe('module-delete');
    expect(journal?.deleted?.path).toBe(MODULE_DIR);
    const deleteToken = journal?.deleted?.token ?? '';
    const manifestPath = `.secondbrain/trash/${deleteToken}.json`;
    const manifest = JSON.parse(files[manifestPath] ?? 'null') as { entries: unknown };
    expect(manifest.entries).toEqual([{ path: MODULE_DIR, dir: true }]);

    // Sources: one loses its only module and becomes undigested, the other keeps
    // its remaining module and its `sourcePage`.
    const protocolOne = JSON.parse(files[PROTOCOL_ONE] ?? '{}') as Record<string, unknown>;
    expect(protocolOne['modules']).toEqual([]);
    expect(protocolOne['sourcePage']).toBeNull();
    const protocolTwo = JSON.parse(files[PROTOCOL_TWO] ?? '{}') as Record<string, unknown>;
    expect(protocolTwo['modules']).toEqual(['andere-notizen']);
    expect(protocolTwo['sourcePage']).toBe('s-2026-08-02-quelle-zwei');

    // Project loses the slug.
    expect(frontmatterOf(store, PROJECT)['modules']).toEqual([]);

    // Raw payloads are byte-identical — only the `.ingest.json` sidecars changed.
    expect(files[RAW_ONE]).toBe(before[RAW_ONE]);
    expect(files[RAW_TWO]).toBe(before[RAW_TWO]);

    // Inbound wikilink from outside the module is left exactly as it was.
    expect(files[OTHER_PAGE]).toBe(before[OTHER_PAGE]);

    // The dump's `filed_into` receipt still points at the now-deleted module.
    expect(frontmatterOf(store, DUMP)['filed_into']).toBe(`${MODULE_DIR}/wiki/concepts/a.md`);

    expect(result.written).toEqual(expect.arrayContaining([PROTOCOL_ONE, PROTOCOL_TWO, PROJECT]));
    expect(result.slug).toBe(MODULE);
  });

  it.each([PROJECT, PROTOCOL_ONE])(
    'refuses with conflict and writes nothing when %s changed after the preview',
    async (path) => {
      const { store, deps, plan } = await setup();
      await store.writeText(path, `${store.allFiles()[path] ?? ''}\nEin fremder Satz.\n`);
      const before = store.allFiles();

      await expect(
        deleteModule(writeDeps(deps), { slug: MODULE, fingerprint: plan.fingerprint }),
      ).rejects.toSatisfy(isConflict);

      expect(store.allFiles()).toEqual(before);
    },
  );

  it('refuses with conflict when a page inside the module changed after the preview', async () => {
    const { store, deps, plan } = await setup();
    await store.writeText(PAGE_A, `${store.allFiles()[PAGE_A] ?? ''}\nEin fremder Satz.\n`);
    const before = store.allFiles();

    await expect(
      deleteModule(writeDeps(deps), { slug: MODULE, fingerprint: plan.fingerprint }),
    ).rejects.toSatisfy(isConflict);

    expect(store.allFiles()).toEqual(before);
  });

  it.each([1, 2, 3])(
    'rolls back to byte-identical and rethrows when content write %i fails',
    async (nth) => {
      const { store, deps, plan } = await setup();
      expect(plan.changes).toHaveLength(3);
      const before = vaultFiles(store);
      const boom = new Error('disk full');

      await expect(
        deleteModule(writeDeps(deps, failingOnWrite(store, nth, boom)), {
          slug: MODULE,
          fingerprint: plan.fingerprint,
        }),
      ).rejects.toBe(boom);

      expect(vaultFiles(store)).toEqual(before);
    },
  );

  it('keeps a foreign write that races a rewrite, and rolls back the rest', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);
    const foreign = 'Jemand anders war schneller.\n';
    let armed = true;
    const racing = storeWith(store, {
      writeText: async (path, content, options) => {
        if (armed && path === PROJECT) {
          armed = false;
          await store.writeText(PROJECT, foreign);
        }
        return store.writeText(path, content, options);
      },
    });

    await expect(
      deleteModule(writeDeps(deps, racing), { slug: MODULE, fingerprint: plan.fingerprint }),
    ).rejects.toBeInstanceOf(VaultConflictError);

    expect(vaultFiles(store)).toEqual({ ...before, [PROJECT]: foreign });
  });

  it('does not delete a folder that changed after the writes (the last look)', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);
    const intruder = `${MODULE_DIR}/wiki/concepts/neu.md`;
    let writes = 0;
    const sneaky = storeWith(store, {
      writeText: async (path, content, options) => {
        const result = await store.writeText(path, content, options);
        if (!path.startsWith('.secondbrain/')) {
          writes += 1;
          if (writes === plan.changes.length) await store.writeText(intruder, 'Neu.\n');
        }
        return result;
      },
    });

    await expect(
      deleteModule(writeDeps(deps, sneaky), { slug: MODULE, fingerprint: plan.fingerprint }),
    ).rejects.toSatisfy(isConflict);

    expect(vaultFiles(store)).toEqual({ ...before, [intruder]: 'Neu.\n' });
  });

  it('rolls back when the delete itself fails', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);
    const boom = new Error('delete refused');
    const failing = storeWith(store, {
      delete: async () => {
        throw boom;
      },
    });

    await expect(
      deleteModule(writeDeps(deps, failing), { slug: MODULE, fingerprint: plan.fingerprint }),
    ).rejects.toBe(boom);

    expect(vaultFiles(store)).toEqual(before);
  });

  it('refuses with conflict and writes nothing when the fingerprint is stale', async () => {
    const { store, deps, plan } = await setup();
    const before = store.allFiles();

    await expect(
      deleteModule(writeDeps(deps), { slug: MODULE, fingerprint: `${plan.fingerprint}-stale` }),
    ).rejects.toSatisfy(isConflict);

    expect(store.allFiles()).toEqual(before);
  });
});

describe('undoFix after a delete', () => {
  async function deleted() {
    const context = await setup();
    const before = vaultFiles(context.store);
    const result = await deleteModule(writeDeps(context.deps), {
      slug: MODULE,
      fingerprint: context.plan.fingerprint,
    });
    return { ...context, before, result };
  }

  it('brings the folder, the protocols and the projects back byte for byte', async () => {
    const { store, before, result } = await deleted();

    const undone = await undoFix(store, result.undoToken);

    const after = vaultFiles(store);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const path of Object.keys(before)) {
      expect(after[path], path).toBe(before[path]);
    }
    expect(undone.restored).toEqual(
      expect.arrayContaining([MODULE_DIR, PROTOCOL_ONE, PROTOCOL_TWO, PROJECT]),
    );
    expect(undone.kept).toEqual([]);
    // Sanity: the module's own log came back untouched (a delete never rewrites it).
    expect(store.allFiles()[LOG]).toBe(before[LOG]);
    expect(frontmatterOf(store, MODULE_FILE)['slug']).toBe(MODULE);
  });

  it('is a no-op the second time', async () => {
    const { store, result } = await deleted();
    await undoFix(store, result.undoToken);
    const once = store.allFiles();

    const second = await undoFix(store, result.undoToken);

    expect(store.allFiles()).toEqual(once);
    expect(second.restored).toEqual([]);
  });

  it('keeps a project someone else edited after the delete', async () => {
    const { store, result } = await deleted();
    const projectEdit = 'Ein voellig neues Projekt am selben Pfad.\n';
    await store.writeText(PROJECT, projectEdit);

    const undone = await undoFix(store, result.undoToken);

    expect(undone.kept).toEqual(expect.arrayContaining([PROJECT]));
    expect(store.allFiles()[PROJECT]).toBe(projectEdit);
    expect(await store.exists(MODULE_DIR)).toBe(true); // the folder still comes back
  });
});
