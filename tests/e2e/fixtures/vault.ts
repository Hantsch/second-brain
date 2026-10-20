/* Assertions against the vault on disk, not the DOM. A spec should be able to
 * prove that a write actually landed in the file the app claims it wrote to —
 * the DOM only proves the app *says* it happened.
 *
 * Every method resolves its `relPath` against the temp vault root that
 * `app.ts` already seeds and tears down; this fixture adds no lifecycle of
 * its own, it only reads. Failure messages always name the path (and, where
 * useful, the vault root) so a red assertion is legible without opening the
 * spec file — the same principle test.step gives to flow/step naming.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseFrontmatter, type Frontmatter } from '../../../src/core/vault/frontmatter';
import { test as base } from './app';

export interface VaultFixture {
  /** Does a file exist at `relPath` under the vault root? */
  exists(relPath: string): boolean;
  /** Raw file content. Throws, naming the path, if the file is missing. */
  readNote(relPath: string): string;
  /** Parsed YAML frontmatter of a markdown file. Throws, naming the path, if missing. */
  frontmatter(relPath: string): Frontmatter;
  /** Entries directly under `.secondbrain/trash/`, or `[]` if the folder doesn't exist. */
  trashEntries(): string[];
  /** Raw bytes of a file, for byte-for-byte comparisons. Throws, naming the path, if missing. */
  snapshot(relPath: string): Buffer;
}

function createVaultFixture(vaultRoot: string): VaultFixture {
  const resolve = (relPath: string) => join(vaultRoot, relPath);

  const requireFile = (relPath: string): string => {
    const full = resolve(relPath);
    if (!existsSync(full)) {
      throw new Error(
        `Expected note at ${relPath} to exist (vault root: ${vaultRoot}), but no file was there.`,
      );
    }
    return full;
  };

  return {
    exists: (relPath) => existsSync(resolve(relPath)),

    readNote: (relPath) => readFileSync(requireFile(relPath), 'utf8'),

    frontmatter: (relPath) => {
      const full = requireFile(relPath);
      const parsed = parseFrontmatter(readFileSync(full, 'utf8'));
      if (!parsed.hadFrontmatter) {
        throw new Error(
          `Expected note at ${relPath} to have frontmatter (vault root: ${vaultRoot}), ` +
            `but none was found. ${parsed.warning ?? ''}`.trim(),
        );
      }
      return parsed.frontmatter;
    },

    trashEntries: () => {
      const trashDir = resolve('.secondbrain/trash');
      if (!existsSync(trashDir)) return [];
      return readdirSync(trashDir);
    },

    snapshot: (relPath) => readFileSync(requireFile(relPath)),
  };
}

export const test = base.extend<{ vault: VaultFixture }>({
  vault: async ({ vaultPath }, use) => {
    await use(createVaultFixture(vaultPath));
  },
});

export { expect } from '@playwright/test';
