/* Writing a condensation proposal (story 037 D8, generalised by story 044 D9).
   The proposal already carries the whole file and the hash it was built from;
   this is the one place that turns that into a vault write, hash-guarded — the
   same guard as `src/main/ipc/areas.ts` uses, no bespoke conflict logic.

   One writer for both levels: an area artifact and a project artifact differ
   only in the path derived from the proposal's identity, so the guard, the
   "must not exist" case and the lossless second write are asserted for both. */

import { describe, expect, it } from 'vitest';
import { writeCondensedArea, writeCondensedProject } from '@core/condense/write';
import type { CondenseAreaProposal } from '@core/condense/run';
import type { CondenseProjectProposal } from '@core/condense/run-project';
import {
  composeArtifact,
  composeCondensedArtifact,
  parseArtifact,
  parseCondensedArtifact,
  PROJECT_SECTIONS,
} from '@core/condense/artifact';
import { condensedAreaPath, condensedProjectPath } from '@core/condense/paths';
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

/* The project half of the same writer (story 044, D9): a different path, the
   identical guard. What must survive a second write is what the human owns —
   the directives section — plus every frontmatter key the app does not know. */

const PROJECT_SLUG = 'nyota';
const PROJECT_PATH = condensedProjectPath('work', PROJECT_SLUG);

const PROJECT_CONTENT = `---
type: condensed
title: Nyota Auth0 Migration
condensed_at: 2026-08-10T09:15:00+02:00
sources:
  - projects/work/nyota/project.md
  - agent:claude/c:/dev/hantsch/nyota
source_hashes:
  projects/work/nyota/project.md: abc123
obsidian_pin: true
---

## Stand

Das Rollenkonzept liegt bei Stefan.

Aus: projects/work/nyota/project.md

## Nächster Schritt

Rollen-Mapping dokumentieren.

Aus: projects/work/nyota/project.md

## Wartet auf

Stefan, seit dem 4. August.

Aus: projects/work/nyota/project.md

## Gelernt

Die Migration lief über Terraform.

Aus: agent:claude/c:/dev/hantsch/nyota

## Direktiven

- Nie den Kunden namentlich nennen.
`;

function projectProposal(
  overrides: Partial<CondenseProjectProposal> = {},
): CondenseProjectProposal {
  return {
    kind: 'proposal',
    scope: 'work',
    slug: PROJECT_SLUG,
    path: PROJECT_PATH,
    content: PROJECT_CONTENT,
    condensedAt: '2026-08-10T09:15:00+02:00',
    baseHash: null,
    sources: ['projects/work/nyota/project.md', 'agent:claude/c:/dev/hantsch/nyota'],
    sourceHashes: { 'projects/work/nyota/project.md': 'abc123' },
    truncated: null,
    ...overrides,
  };
}

describe('writeCondensedProject', () => {
  it('writes exactly one projects/<scope>/<slug>/condensed.md when none exists yet', async () => {
    const store = new MemoryVaultStore();

    const result = await writeCondensedProject(store, projectProposal());

    expect(result.path).toBe(PROJECT_PATH);
    expect(result.created).toBe(true);
    const files = await store.list({ dir: 'projects', ext: '.md' });
    expect(files).toEqual([PROJECT_PATH]);
    expect(await store.readText(PROJECT_PATH)).toBe(PROJECT_CONTENT);
  });

  it('refuses a second write with baseHash: null once the file exists (must-not-exist)', async () => {
    const store = new MemoryVaultStore();
    await writeCondensedProject(store, projectProposal());

    await expect(writeCondensedProject(store, projectProposal())).rejects.toThrow(
      VaultConflictError,
    );
    expect(await store.readText(PROJECT_PATH)).toBe(PROJECT_CONTENT);
  });

  it('throws VaultConflictError (code: conflict) on a stale expectedHash and leaves the file untouched', async () => {
    const store = new MemoryVaultStore();
    await writeCondensedProject(store, projectProposal());

    let caught: unknown;
    try {
      await writeCondensedProject(store, projectProposal({ baseHash: 'not-the-real-hash' }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(VaultConflictError);
    expect((caught as VaultConflictError).code).toBe('conflict');
    expect(await store.readText(PROJECT_PATH)).toBe(PROJECT_CONTENT);
  });

  it('a second, accepted write preserves the directives section and unknown frontmatter keys on disk', async () => {
    const store = new MemoryVaultStore();
    const first = await writeCondensedProject(store, projectProposal());

    // Simulate a second condenseProject() run: read the file on disk, parse it
    // with the project section set (D3), compose a new version — the same
    // machinery `run-project.ts` uses.
    const onDisk = await store.readText(PROJECT_PATH);
    expect(onDisk).toBe(PROJECT_CONTENT);
    const parsed = parseArtifact(onDisk ?? '', PROJECT_SECTIONS);
    expect(parsed.directives.content).toContain('Nie den Kunden namentlich nennen.');
    expect(parsed.extraFrontmatter['obsidian_pin']).toBe(true);
    expect(parsed.sections.learned.sources).toEqual(['agent:claude/c:/dev/hantsch/nyota']);

    const updated = {
      ...parsed,
      condensedAt: '2026-08-17T09:00:00+02:00',
      sections: {
        ...parsed.sections,
        'next-step': {
          text: 'Testmandanten anlegen.',
          sources: ['projects/work/nyota/project.md'],
        },
      },
    };
    const secondContent = composeArtifact(updated, PROJECT_SECTIONS, 'de');

    const second = await writeCondensedProject(
      store,
      projectProposal({
        content: secondContent,
        baseHash: sha256(PROJECT_CONTENT),
        condensedAt: updated.condensedAt,
      }),
    );

    expect(second.created).toBe(false);
    expect(second.hash).not.toBe(first.hash);

    const finalParsed = parseArtifact((await store.readText(PROJECT_PATH)) ?? '', PROJECT_SECTIONS);
    expect(finalParsed.directives.content).toContain('Nie den Kunden namentlich nennen.');
    expect(finalParsed.extraFrontmatter['obsidian_pin']).toBe(true);
    expect(finalParsed.sections['next-step'].text).toBe('Testmandanten anlegen.');
    // The agent citation survives a round trip as a source, unmangled.
    expect(finalParsed.sources).toContain('agent:claude/c:/dev/hantsch/nyota');

    // Still exactly one condensed artifact for this project.
    expect(await store.list({ dir: 'projects', ext: '.md' })).toEqual([PROJECT_PATH]);
  });

  it('keeps the two levels apart: an area write does not touch a project artifact', async () => {
    const store = new MemoryVaultStore();
    await writeCondensedProject(store, projectProposal());

    await writeCondensedArea(store, proposal());

    expect(await store.readText(PROJECT_PATH)).toBe(PROJECT_CONTENT);
    expect(await store.readText(PATH)).toBe(FIRST_CONTENT);
  });
});
