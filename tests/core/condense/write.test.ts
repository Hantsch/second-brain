/* Writing a `CondenseAreaProposal` (story 037, D8). The proposal already carries
   the whole file and the hash it was built from; this is the one place that
   turns that into a vault write, hash-guarded — the same guard as
   `src/main/ipc/areas.ts` uses, no bespoke conflict logic. */

import { describe, expect, it } from 'vitest';
import { writeCondensedArea } from '@core/condense/write';
import type { CondenseAreaProposal } from '@core/condense/run';
import { composeCondensedArtifact, parseCondensedArtifact } from '@core/condense/artifact';
import { condensedAreaPath } from '@core/condense/paths';
import { MemoryVaultStore, VaultConflictError } from '@core/vault';
import { sha256 } from '@core/vault/hash';

const SLUG = 'gesundheit';
const PATH = condensedAreaPath(SLUG);

const FIRST_CONTENT = `---
type: condensed
title: Gesundheit — verdichtet
condensed_at: 2026-08-10T09:15:00+02:00
sources:
  - areas/gesundheit.md
review_cycle: 30
---

## Stand

Schlaf ist stabil.

Aus: areas/gesundheit.md

## Muster

Ohne Sport kippt der Schlaf.

Aus: areas/gesundheit.md

## Offen

Ob der Rücken ein Arzttermin ist.

Aus: areas/gesundheit.md

## Direktiven

- Nie meine Blutwerte zusammenfassen.
`;

function proposal(overrides: Partial<CondenseAreaProposal> = {}): CondenseAreaProposal {
  return {
    kind: 'proposal',
    slug: SLUG,
    path: PATH,
    content: FIRST_CONTENT,
    condensedAt: '2026-08-10T09:15:00+02:00',
    baseHash: null,
    sources: ['areas/gesundheit.md'],
    truncated: null,
    ...overrides,
  };
}

describe('writeCondensedArea', () => {
  it('writes exactly one areas/<slug>.condensed.md when none exists yet', async () => {
    const store = new MemoryVaultStore();

    const result = await writeCondensedArea(store, proposal());

    expect(result.path).toBe(PATH);
    expect(result.created).toBe(true);
    const files = await store.list({ dir: 'areas', ext: '.md' });
    expect(files).toEqual([PATH]);
    expect(await store.readText(PATH)).toBe(FIRST_CONTENT);
  });

  it('refuses a second write with baseHash: null once the file exists (must-not-exist)', async () => {
    const store = new MemoryVaultStore();
    await writeCondensedArea(store, proposal());

    await expect(writeCondensedArea(store, proposal())).rejects.toThrow(VaultConflictError);
    // Untouched: still exactly the first write's content.
    expect(await store.readText(PATH)).toBe(FIRST_CONTENT);
  });

  it('throws VaultConflictError (code: conflict) on a stale expectedHash and leaves the file untouched', async () => {
    const store = new MemoryVaultStore();
    await writeCondensedArea(store, proposal());

    const stale = 'not-the-real-hash';
    let caught: unknown;
    try {
      await writeCondensedArea(store, proposal({ baseHash: stale }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(VaultConflictError);
    expect((caught as VaultConflictError).code).toBe('conflict');
    expect(await store.readText(PATH)).toBe(FIRST_CONTENT);
  });

  it('leaves an existing trash copy (from an unrelated delete) untouched by a conflicting write', async () => {
    const store = new MemoryVaultStore({ files: { 'areas/other.md': '---\ntype: area\n---\n' } });
    const { undoToken } = await store.delete('areas/other.md');
    await writeCondensedArea(store, proposal());

    await expect(writeCondensedArea(store, proposal({ baseHash: 'stale' }))).rejects.toThrow(
      VaultConflictError,
    );

    // The trash copy from the earlier, unrelated delete is still there — a
    // conflicting write on a different file must not disturb it.
    const trashed = await store.list({ includeInternal: true });
    expect(trashed.some((path) => path.includes(undoToken))).toBe(true);
  });

  it('a second, accepted write preserves the directives section and unknown frontmatter keys on disk', async () => {
    const store = new MemoryVaultStore();
    const first = await writeCondensedArea(store, proposal());

    // Simulate a second condenseArea() run: it reads the file on disk, parses
    // it (D3), and composes a new version — same machinery `run.ts` uses.
    const onDisk = await store.readText(PATH);
    expect(onDisk).not.toBeNull();
    const parsed = parseCondensedArtifact(onDisk ?? '');
    expect(parsed.directives.content).toContain('Nie meine Blutwerte zusammenfassen.');
    expect(parsed.extraFrontmatter['review_cycle']).toBe(30);

    const updated = {
      ...parsed,
      condensedAt: '2026-08-17T09:00:00+02:00',
      sections: {
        ...parsed.sections,
        state: { text: 'Schlaf ist weiterhin stabil.', sources: ['areas/gesundheit.md'] },
      },
    };
    const secondContent = composeCondensedArtifact(updated, 'de');

    const second = await writeCondensedArea(
      store,
      proposal({
        content: secondContent,
        baseHash: sha256(FIRST_CONTENT),
        condensedAt: updated.condensedAt,
      }),
    );

    expect(second.created).toBe(false);
    expect(second.hash).not.toBe(first.hash);

    const finalText = await store.readText(PATH);
    const finalParsed = parseCondensedArtifact(finalText ?? '');
    expect(finalParsed.directives.content).toContain('Nie meine Blutwerte zusammenfassen.');
    expect(finalParsed.extraFrontmatter['review_cycle']).toBe(30);
    expect(finalParsed.sections.state.text).toBe('Schlaf ist weiterhin stabil.');

    // Still exactly one condensed artifact for this slug.
    const files = await store.list({ dir: 'areas', ext: '.md' });
    expect(files).toEqual([PATH]);
  });
});
