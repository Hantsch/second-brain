/**
 * A digestion writes several files — source page, entity pages, catalog,
 * chronicle, protocol. `WikiTransaction` makes those writes one unit: it hands
 * every call through to the real store and remembers what each file looked like
 * before, so a step that throws halfway can be taken back instead of leaving the
 * half-state the "Unverdichtet" badge would then lie about.
 *
 * Three cases have to stay apart, and only the third one is subtle:
 *
 * - **This run created the file.** The way back is `delete`, which moves it to
 *   `.secondbrain/trash/` and hands back an undo mark — nothing is lost for good.
 * - **This run changed a file that already existed.** The way back is its content
 *   from before, restored through the shared `restoreSteps`.
 * - **Somebody else changed the file after this run wrote it.** Then there is no
 *   way back at all: the file stays exactly as it is and its path comes back as
 *   `kept`. docs/VAULT-FORMAT.md — the app never rewrites a line it did not write
 *   itself, and a rollback is not an exception to that.
 *
 * One comparison decides all three: the hash the file carries now against the
 * hash this transaction wrote last. Same rule as `restoreSteps`, and it holds for
 * a created file too — moving a page the user has meanwhile edited into the trash
 * would be the same loss as overwriting it.
 *
 * Reads pass straight through, so the transaction satisfies `WikiStore` and can be
 * handed to everything the digestion already writes through. Deletes are **not**
 * recorded: the digestion only ever writes, and bringing a deleted file back needs
 * its trash mark, not a step.
 */

import type { VaultDoc, WriteResult } from '@shared/types';
import { sha256 } from '@core/vault/hash';
import { assertSafeVaultPath } from '@core/vault/paths';
import { restoreSteps, type RollbackStep } from '@core/vault/rollback';
import type { WikiStore, WikiTxStore, WikiWriteInput } from './types';

/** What one touched path needs for its way back. */
interface TxRecord {
  path: string;
  /** Content before this transaction's **first** write; `null` — there was no file. */
  before: string | null;
  /** Hash of what this transaction wrote **last**. */
  hashAfter: string;
}

export interface WikiRollbackResult {
  /** Paths this transaction created and that are gone again (in the trash). */
  deleted: string[];
  /** Paths back at the content they had before this transaction. */
  restored: string[];
  /** Paths left untouched because they changed after this transaction wrote them. */
  kept: string[];
}

export class WikiTransaction implements WikiStore {
  private readonly store: WikiTxStore;
  /** Touched paths in the order they were first written — the rollback walks it backwards. */
  private readonly records = new Map<string, TxRecord>();

  constructor(store: WikiTxStore) {
    this.store = store;
  }

  /* ── Reading passes through unchanged ─────────────────────────────────────── */

  async read(path: string): Promise<VaultDoc | null> {
    return this.store.read(path);
  }

  async readText(path: string): Promise<string | null> {
    return this.store.readText(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.store.exists(path);
  }

  /* ── Writing passes through and is recorded ───────────────────────────────── */

  async create(
    path: string,
    frontmatter: Record<string, unknown>,
    body: string,
  ): Promise<WriteResult> {
    return this.recorded(path, () => this.store.create(path, frontmatter, body));
  }

  async write(input: WikiWriteInput): Promise<WriteResult> {
    return this.recorded(input.path, () => this.store.write(input));
  }

  async writeText(
    path: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<WriteResult> {
    return this.recorded(path, () => this.store.writeText(path, content, options));
  }

  async append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string; frontmatterIfNew?: Record<string, unknown> },
  ): Promise<{ path: string; hash: string }> {
    return this.recorded(path, () => this.store.append(path, section, content, options));
  }

  /**
   * One write with a way back. The state from before is read **before** the write
   * and recorded only after it: when the store throws (a conflict, the file exists
   * already, a disk error), there is no step for a change that never happened.
   *
   * On a second write to the same path `before` stays as it is — otherwise this
   * run's own first write would become the state "from before" — and only
   * `hashAfter` moves on.
   */
  private async recorded<T extends { hash: string }>(
    path: string,
    write: () => Promise<T>,
  ): Promise<T> {
    const key = assertSafeVaultPath(path);
    const before = this.records.has(key) ? null : await this.store.readText(key);
    const result = await write();
    const record = this.records.get(key);
    if (record === undefined) this.records.set(key, { path: key, before, hashAfter: result.hash });
    else record.hashAfter = result.hash;
    return result;
  }

  /* ── The way back ─────────────────────────────────────────────────────────── */

  /**
   * Undo everything recorded, in reverse order to the writing. The record is empty
   * afterwards: a second call does nothing and claims nothing either.
   *
   * For a changed file the hash comparison sits in `restoreSteps` — called one step
   * at a time, so the single backwards loop stays here and deleted and restored
   * paths cannot overtake each other.
   */
  async rollback(): Promise<WikiRollbackResult> {
    const result: WikiRollbackResult = { deleted: [], restored: [], kept: [] };
    for (const record of [...this.records.values()].reverse()) {
      if (record.before === null) {
        await this.undoCreate(record, result);
        continue;
      }
      const step: RollbackStep = {
        path: record.path,
        before: record.before,
        hashAfter: record.hashAfter,
      };
      const restored = await restoreSteps(this.store, [step]);
      result.restored.push(...restored.restored);
      result.kept.push(...restored.kept);
    }
    this.records.clear();
    return result;
  }

  /**
   * A file that did not exist before this run disappears again — through `delete`,
   * so into the trash under a mark, never for good.
   *
   * Two cases do nothing: the file is already gone (nothing to undo), or its
   * content is no longer the one this run wrote. In the second case the user has
   * edited the new page themselves since; moving it to the trash would be the same
   * loss as overwriting it, so the path comes back as `kept`.
   */
  private async undoCreate(record: TxRecord, result: WikiRollbackResult): Promise<void> {
    const current = await this.store.readText(record.path);
    if (current === null) return;
    if (sha256(current) !== record.hashAfter) {
      result.kept.push(record.path);
      return;
    }
    await this.store.delete(record.path);
    result.deleted.push(record.path);
  }

  /** The run is through: the record is dropped, and `rollback()` does nothing after it. */
  commit(): void {
    this.records.clear();
  }
}
