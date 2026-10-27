/* The agent's proposals as the vault shows them: listed with their reasoning and a diff, or
   marked invalid with a code — never a crash, never a proposal against a protected path. */

import { describe, expect, it } from 'vitest';
import { listProposals, readProposal, readProposalFull } from '@core/agent/proposals';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { AGENT_DIRS } from '@shared/types';

const HASH = 'a'.repeat(64);
const DIR = AGENT_DIRS.proposals;

function proposal(fields: Record<string, string | undefined>, content = 'New text\n'): string {
  const base: Record<string, string | undefined> = {
    gaston: 'proposal',
    version: '1',
    kind: 'edit',
    target: 'notes/plan.md',
    base_hash: HASH,
    run: 'run-1',
    reason: 'The plan is out of date',
    ...fields,
  };
  const lines = Object.entries(base)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join('\n')}\n---\n${content}`;
}

function vaultWith(files: Record<string, string>): MemoryVaultStore {
  return new MemoryVaultStore({
    files: {
      'notes/plan.md': 'Old text\n',
      'journal/2026-10-27.md': 'private\n',
      ...files,
    },
  });
}

describe('agent proposals', () => {
  it('a valid proposal lists with its target, reasoning and a diff against the current file', async () => {
    const store = vaultWith({
      [`${DIR}/b-plan.md`]: proposal({}),
      [`${DIR}/readme.txt`]: 'not a proposal',
    });

    const views = await listProposals(store);

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      id: 'b-plan',
      kind: 'edit',
      target: 'notes/plan.md',
      reason: 'The plan is out of date',
      run: 'run-1',
      valid: true,
      invalid: null,
    });
    const kinds = views[0]?.diff?.map((row) => [row.kind, row.text]);
    expect(kinds).toContainEqual(['removed', 'Old text']);
    expect(kinds).toContainEqual(['added', 'New text']);
  });

  it('a quoted reason holding a colon and a hash is read back exactly', async () => {
    const reason = 'Launch moved: now 14 November # final';
    const store = vaultWith({ [`${DIR}/quoted.md`]: proposal({ reason: JSON.stringify(reason) }) });

    expect(await readProposal(store, 'quoted')).toMatchObject({ valid: true, reason });
  });

  it('keeps the content after the closing frontmatter line verbatim and sorts by id', async () => {
    const content = '\n## Heading\n\n  indented\n';
    const store = vaultWith({
      [`${DIR}/z.md`]: proposal({}, content),
      [`${DIR}/a.md`]: proposal({}),
    });

    expect((await listProposals(store)).map((view) => view.id)).toEqual(['a', 'z']);
    const full = await readProposalFull(store, 'z');
    expect(full?.content).toBe(content);
    expect(full?.baseHash).toBe(HASH);
    expect(await readProposal(store, 'gone')).toBeNull();
  });

  it('a filing proposal diffs against an empty file and needs its target under inbox', async () => {
    const store = vaultWith({
      'inbox/idea.md': 'raw idea\n',
      'areas/health.md': '# Health\n',
      [`${DIR}/ok.md`]: proposal({
        kind: 'filing',
        target: 'inbox/idea.md',
        file_into: 'areas/health.md',
      }),
      [`${DIR}/no-into.md`]: proposal({ kind: 'filing', target: 'inbox/idea.md' }),
      [`${DIR}/wrong-dir.md`]: proposal({
        kind: 'filing',
        target: 'notes/plan.md',
        file_into: 'x.md',
      }),
    });

    expect(await readProposal(store, 'ok')).toMatchObject({
      valid: true,
      fileInto: 'areas/health.md',
      diff: [
        { kind: 'added', text: 'New text' },
        { kind: 'context', text: '' },
      ],
    });
    expect((await readProposal(store, 'no-into'))?.invalid).toEqual({
      code: 'missing-field',
      detail: 'file_into',
    });
    expect((await readProposal(store, 'wrong-dir'))?.invalid?.code).toBe('forbidden-target');
  });

  it('a proposal targeting journal, raw, internal folders or outside the vault is invalid with its reason', async () => {
    const targets: [string, string][] = [
      ['journal/2026-10-27.md', 'forbidden-target'],
      ['raw/source.md', 'forbidden-target'],
      ['.secondbrain/index/x.md', 'forbidden-target'],
      ['.claude/settings.md', 'forbidden-target'],
      ['CLAUDE.md', 'forbidden-target'],
      ['notes/.ingest.json', 'forbidden-target'],
      ['Journal/x.md', 'forbidden-target'],
      ['../outside.md', 'outside-vault'],
      ['notes/gone.md', 'target-missing'],
    ];
    const files: Record<string, string> = {
      'CLAUDE.md': 'rules\n',
      'raw/source.md': 'src\n',
      'notes/.ingest.json': '{}\n',
      'Journal/x.md': 'private\n',
    };
    targets.forEach(([target], index) => {
      files[`${DIR}/t${index}.md`] = proposal({ target });
    });
    const store = vaultWith(files);

    for (const [index, [target, code]] of targets.entries()) {
      const view = await readProposal(store, `t${index}`);
      expect(view, target).toMatchObject({ valid: false, invalid: { code }, diff: null });
    }
  });

  it('a proposal with missing fields or unreadable frontmatter is invalid with its reason', async () => {
    const store = vaultWith({
      [`${DIR}/no-reason.md`]: proposal({ reason: undefined }),
      [`${DIR}/empty-run.md`]: proposal({ run: '""' }),
      [`${DIR}/no-frontmatter.md`]: 'Just some text, no frontmatter.\n',
      [`${DIR}/broken.md`]: '---\nkind: [unclosed\n---\nbody\n',
      [`${DIR}/odd-kind.md`]: proposal({ kind: 'delete' }),
      [`${DIR}/short-hash.md`]: proposal({ base_hash: 'abc123' }),
    });

    const byId = Object.fromEntries((await listProposals(store)).map((view) => [view.id, view]));

    expect(byId['no-reason']).toMatchObject({
      valid: false,
      reason: null,
      target: 'notes/plan.md',
      invalid: { code: 'missing-field', detail: 'reason' },
      diff: null,
    });
    expect(byId['empty-run']?.invalid).toEqual({ code: 'missing-field', detail: 'run' });
    expect(byId['no-frontmatter']).toMatchObject({ valid: false, invalid: { code: 'unreadable' } });
    expect(byId['broken']?.invalid?.code).toBe('unreadable');
    expect(byId['odd-kind']?.invalid).toEqual({ code: 'unknown-kind', detail: 'delete' });
    expect(byId['short-hash']?.invalid?.code).toBe('bad-hash');
  });
});
