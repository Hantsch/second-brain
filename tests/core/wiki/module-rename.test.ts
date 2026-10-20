/* `renameModule` is measured against `discardPage`'s promise (tests/core/gardener/
 * discard.test.ts): what the preview announced, it did; a stale preview writes
 * nothing; a failure half-way leaves the vault byte-identical; and one mark undoes
 * all of it. The one new thing is the folder move — the step without a hash guard —
 * so the undo suite below also pins its order: folder back first, then the content
 * steps recorded at the old paths, and no step at all when the old path is taken.
 *
 * gardener has no `undo.test.ts`; the `moved` journal entry is unit-tested here. */

import { describe, expect, it } from 'vitest';
import { GardenerError, fixJournalPath, parseFixJournal, undoFix } from '@core/gardener';
import { parse } from '@core/vault/frontmatter';
import type { MemoryVaultStore } from '@core/vault/memory-store';
import { VaultConflictError } from '@core/vault/types';
import { renameModule, renamePlan, WikiError } from '@core/wiki';
import type { ModuleLifecycleDeps, RenameWriteDeps } from '@core/wiki';
import { NOW_MS } from '../../helpers/time';
import {
  AGENTS,
  CATALOG,
  DUMP,
  LOG,
  MODULE,
  MODULE_FILE,
  OTHER_PAGE,
  OVERVIEW,
  PAGE_A,
  PAGE_B,
  PROJECT,
  PROTOCOL_ONE,
  PROTOCOL_TWO,
  RAW_ONE,
  fixture,
} from './module-lifecycle-fixture';

const NEW_TITLE = 'Produktkenntnisse';
const NEW = 'produktkenntnisse';
const OLD_DIR = `modules/${MODULE}`;
const NEW_DIR = `modules/${NEW}`;

/** `path` inside the renamed folder. */
function moved(path: string): string {
  return `${NEW_DIR}${path.slice(OLD_DIR.length)}`;
}

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

type Overrides = Partial<Pick<MemoryVaultStore, 'writeText' | 'move'>>;

/** The same store with `writeText`/`move` swapped — the hooks call through themselves. */
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
  const plan = await renamePlan(base.deps, { slug: MODULE, title: NEW_TITLE });
  return { ...base, plan };
}

function writeDeps(deps: ModuleLifecycleDeps, store = deps.store): RenameWriteDeps {
  return { store, index: deps.index, now: new Date(NOW_MS) };
}

function frontmatterOf(store: MemoryVaultStore, path: string): Record<string, unknown> {
  const raw = store.allFiles()[path];
  if (raw === undefined) throw new Error(`missing in fixture: ${path}`);
  return parse(raw).frontmatter;
}

const isConflict = (error: unknown): boolean =>
  error instanceof WikiError && error.code === 'conflict';

describe('renameModule', () => {
  it('moves the folder and points every reference class at the new slug', async () => {
    const { store, deps, plan } = await setup();
    const logBefore = store.allFiles()[LOG] ?? '';

    const result = await renameModule(writeDeps(deps), {
      slug: MODULE,
      title: NEW_TITLE,
      fingerprint: plan.fingerprint,
    });

    const files = store.allFiles();
    expect(result.moved).toBe(true);
    expect(result.newSlug).toBe(NEW);
    expect(under(files, OLD_DIR)).toEqual([]);
    expect(await store.exists(OLD_DIR)).toBe(false);

    expect(frontmatterOf(store, moved(MODULE_FILE))).toMatchObject({
      title: NEW_TITLE,
      slug: NEW,
      module: NEW,
    });
    for (const page of [PAGE_A, PAGE_B, OVERVIEW]) {
      expect(frontmatterOf(store, moved(page))['module']).toBe(NEW);
    }
    expect(frontmatterOf(store, moved(OVERVIEW))['title']).toBe(`${NEW_TITLE} — Synthese`);

    const agents = files[moved(AGENTS)] ?? '';
    expect(agents).toContain(`modules/${NEW}`);
    expect(agents).not.toContain(`modules/${MODULE}`);
    expect(agents.split('\n')[0]).toMatch(new RegExp(`: ${NEW_TITLE}$`, 'u'));
    expect((files[moved(CATALOG)] ?? '').split('\n')[0]).toBe(`# Katalog — ${NEW_TITLE}`);

    expect(JSON.parse(files[PROTOCOL_ONE] ?? '{}').modules).toEqual([NEW]);
    expect(JSON.parse(files[PROTOCOL_TWO] ?? '{}').modules).toEqual([NEW, 'andere-notizen']);
    expect(frontmatterOf(store, PROJECT)['modules']).toEqual([NEW]);
    expect(frontmatterOf(store, DUMP)['filed_into']).toBe(`${NEW_DIR}/wiki/concepts/a.md`);

    const other = files[OTHER_PAGE] ?? '';
    expect(other).toContain(`[[${NEW}/a|Übersicht]]`);
    expect(other).toContain('[[unrelated/a]]');
    expect(other).toContain('[[x]]');
    expect(files[RAW_ONE]).toContain(`[[${MODULE}/a]]`); // raw/ is never rewritten

    // The chronicle moved along untouched and gained exactly one `lint` entry.
    const log = files[moved(LOG)] ?? '';
    expect(log.startsWith(logBefore.trimEnd())).toBe(true);
    expect(log.slice(logBefore.trimEnd().length)).toMatch(
      new RegExp(
        `^\\n\\n## \\[\\d{4}-\\d{2}-\\d{2}\\] lint\\n[\\s\\S]*rename \\(${MODULE} -> ${NEW}\\)`,
        'u',
      ),
    );
    expect(result.logged).toBe(moved(LOG));
    expect(result.written).toContain(moved(PAGE_A));
    expect(result.written).toContain(PROJECT);
  });

  it.each([PROJECT, PAGE_A])(
    'refuses with conflict and writes nothing when %s changed after the preview',
    async (path) => {
      const { store, deps, plan } = await setup();
      await store.writeText(path, `${store.allFiles()[path] ?? ''}\nEin fremder Satz.\n`);
      const before = store.allFiles();

      await expect(
        renameModule(writeDeps(deps), {
          slug: MODULE,
          title: NEW_TITLE,
          fingerprint: plan.fingerprint,
        }),
      ).rejects.toSatisfy(isConflict);

      expect(store.allFiles()).toEqual(before);
    },
  );

  it('refuses a new slug that already exists as a module, writing nothing', async () => {
    const { store, deps } = await setup();
    const plan = await renamePlan(deps, { slug: MODULE, title: 'Andere Notizen' });
    const before = store.allFiles();

    await expect(
      renameModule(writeDeps(deps), {
        slug: MODULE,
        title: 'Andere Notizen',
        fingerprint: plan.fingerprint,
      }),
    ).rejects.toSatisfy(isConflict);

    expect(store.allFiles()).toEqual(before);
  });

  it.each([1, 3, 11])(
    'rolls back to byte-identical and rethrows when content write %i fails',
    async (nth) => {
      const { store, deps, plan } = await setup();
      expect(plan.changes).toHaveLength(11); // `11` above is the last content write
      const before = vaultFiles(store);
      const boom = new Error('disk full');

      await expect(
        renameModule(writeDeps(deps, failingOnWrite(store, nth, boom)), {
          slug: MODULE,
          title: NEW_TITLE,
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
        if (armed && path === OTHER_PAGE) {
          armed = false;
          await store.writeText(OTHER_PAGE, foreign);
        }
        return store.writeText(path, content, options);
      },
    });

    await expect(
      renameModule(writeDeps(deps, racing), {
        slug: MODULE,
        title: NEW_TITLE,
        fingerprint: plan.fingerprint,
      }),
    ).rejects.toBeInstanceOf(VaultConflictError);

    expect(vaultFiles(store)).toEqual({ ...before, [OTHER_PAGE]: foreign });
  });

  it('does not move a folder that changed after the writes (the last look)', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);
    const intruder = `${OLD_DIR}/wiki/concepts/neu.md`;
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
      renameModule(writeDeps(deps, sneaky), {
        slug: MODULE,
        title: NEW_TITLE,
        fingerprint: plan.fingerprint,
      }),
    ).rejects.toSatisfy(isConflict);

    expect(vaultFiles(store)).toEqual({ ...before, [intruder]: 'Neu.\n' });
  });

  it('rolls back when the move itself fails', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);
    const boom = new Error('move refused');
    const failing = storeWith(store, {
      move: async () => {
        throw boom;
      },
    });

    await expect(
      renameModule(writeDeps(deps, failing), {
        slug: MODULE,
        title: NEW_TITLE,
        fingerprint: plan.fingerprint,
      }),
    ).rejects.toBe(boom);

    expect(vaultFiles(store)).toEqual(before);
  });

  it('moves the folder back before undoing when the journal cannot learn of the move', async () => {
    const { store, deps, plan } = await setup();
    const before = vaultFiles(store);
    const boom = new Error('journal write failed');
    let journalWrites = 0;
    const failing = storeWith(store, {
      writeText: async (path, content, options) => {
        if (path.endsWith('/gardener.json')) {
          journalWrites += 1;
          if (journalWrites === 2) throw boom; // the second write is the one adding `moved`
        }
        return store.writeText(path, content, options);
      },
    });

    await expect(
      renameModule(writeDeps(deps, failing), {
        slug: MODULE,
        title: NEW_TITLE,
        fingerprint: plan.fingerprint,
      }),
    ).rejects.toBe(boom);

    expect(vaultFiles(store)).toEqual(before);
  });

  it('renames the title only: nothing moves, only title lines change', async () => {
    const { store, deps } = await setup();
    const title = 'ProduktWissen';
    const plan = await renamePlan(deps, { slug: MODULE, title });
    const before = vaultFiles(store);
    let moves = 0;
    const counting = storeWith(store, {
      move: async (from, to, options) => {
        moves += 1;
        return store.move(from, to, options);
      },
    });

    const result = await renameModule(writeDeps(deps, counting), {
      slug: MODULE,
      title,
      fingerprint: plan.fingerprint,
    });

    expect(moves).toBe(0);
    expect(result.moved).toBe(false);
    const files = vaultFiles(store);
    expect(under(files, NEW_DIR)).toEqual([]);
    expect(frontmatterOf(store, MODULE_FILE)).toMatchObject({ title, slug: MODULE });
    expect((files[CATALOG] ?? '').split('\n')[0]).toBe(`# Katalog — ${title}`);
    expect(frontmatterOf(store, OVERVIEW)['title']).toBe(`${title} — Synthese`);
    for (const path of [PAGE_A, PAGE_B, PROJECT, DUMP, OTHER_PAGE, PROTOCOL_ONE]) {
      expect(files[path]).toBe(before[path]);
    }
    const journal = parseFixJournal(store.allFiles()[fixJournalPath(result.undoToken)] ?? null);
    expect(journal?.kind).toBe('module-rename');
    expect(journal?.moved).toBeUndefined();
  });
});

describe('undoFix after a rename', () => {
  async function renamed() {
    const context = await setup();
    const before = vaultFiles(context.store);
    const result = await renameModule(writeDeps(context.deps), {
      slug: MODULE,
      title: NEW_TITLE,
      fingerprint: context.plan.fingerprint,
    });
    return { ...context, before, result };
  }

  it('moves the folder back first and restores every rewritten file byte for byte', async () => {
    const { store, before, result } = await renamed();

    const undone = await undoFix(store, result.undoToken);

    const after = vaultFiles(store);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const path of Object.keys(before)) {
      if (path === LOG) continue; // the chronicle is append-only, checked below
      expect(after[path], path).toBe(before[path]);
    }
    expect((after[LOG] ?? '').startsWith((before[LOG] ?? '').trimEnd())).toBe(true);
    // In-folder steps were recorded at the old paths — they only restore after the move-back.
    expect(undone.restored).toEqual(
      expect.arrayContaining([OLD_DIR, PAGE_A, MODULE_FILE, PROJECT]),
    );
    expect(undone.kept).toEqual([]);
  });

  it('is a no-op the second time', async () => {
    const { store, result } = await renamed();
    await undoFix(store, result.undoToken);
    const once = store.allFiles();

    const second = await undoFix(store, result.undoToken);

    expect(store.allFiles()).toEqual(once);
    expect(second.restored).toEqual([]);
  });

  it('keeps files someone else edited after the rename', async () => {
    const { store, result } = await renamed();
    const projectEdit = `${store.allFiles()[PROJECT] ?? ''}\nNachtrag des Nutzers.\n`;
    const pageEdit = `${store.allFiles()[moved(PAGE_A)] ?? ''}\nNachtrag des Nutzers.\n`;
    await store.writeText(PROJECT, projectEdit);
    await store.writeText(moved(PAGE_A), pageEdit);

    const undone = await undoFix(store, result.undoToken);

    expect(undone.kept).toEqual(expect.arrayContaining([PROJECT, PAGE_A]));
    const files = store.allFiles();
    expect(files[PROJECT]).toBe(projectEdit);
    expect(files[PAGE_A]).toBe(pageEdit); // came back with the folder, edit intact
    expect(under(files, NEW_DIR)).toEqual([]);
  });

  it('refuses the whole undo, touching nothing, when the old folder is taken again', async () => {
    const { store, result } = await renamed();
    await store.writeText(`${OLD_DIR}/module.md`, 'Ein neues Modul am alten Ort.\n');
    const before = store.allFiles();

    await expect(undoFix(store, result.undoToken)).rejects.toSatisfy(
      (error: unknown) => error instanceof GardenerError && error.code === 'conflict',
    );

    expect(store.allFiles()).toEqual(before);
  });
});

describe('FixJournal with and without `moved`', () => {
  const steps = [{ path: 'a.md', before: 'x', hashAfter: 'h' }];

  it('parses a journal without `moved` exactly as before', () => {
    const journal = parseFixJournal(
      JSON.stringify({ version: 1, kind: 'discard', action: 'discard', steps }),
    );
    expect(journal).toEqual({ version: 1, kind: 'discard', action: 'discard', steps });
    expect(journal !== null && 'moved' in journal).toBe(false);
  });

  it('round-trips `moved` and drops a malformed one', () => {
    const moved = { from: 'modules/a', to: 'modules/b' };
    const base = { version: 1, kind: 'module-rename', action: 'module-rename', steps };
    expect(parseFixJournal(JSON.stringify({ ...base, moved }))?.moved).toEqual(moved);
    expect(parseFixJournal(JSON.stringify({ ...base, moved: { from: 1 } }))?.moved).toBeUndefined();
  });
});
