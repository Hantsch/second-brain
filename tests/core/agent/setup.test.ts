/* Installing and updating the agent setup writes into folders the user owns too
 * (`.claude/`, the vault root), so every test here checks what must stay untouched as
 * carefully as what gets written.
 * These tests pin the template list to SETUP_TEMPLATES; the help module that joins it
 * by default is covered in help-setup.test.ts. */

import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { applySetup } from '@core/agent/setup-apply';
import { parseMarker, renderSetupFile } from '@core/agent/setup-marker';
import { readSetupState } from '@core/agent/setup-status';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import type { SetupTemplate } from '@core/agent/setup-types';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { VaultStore } from '@core/vault/types';
import {
  AGENT_DIRS,
  AGENT_SETUP_MANIFEST,
  AGENT_SKILLS,
  type AgentSetupState,
} from '../../../src/shared/types/agent-setup';
import { createTempVault } from '../../helpers/vault';

const SETTINGS = '.claude/settings.json';
const JOBS_SKILL = `.claude/skills/${AGENT_SKILLS.jobs}/SKILL.md`;
const CURATE_SKILL = `.claude/skills/${AGENT_SKILLS.curate}/SKILL.md`;
const WIKI_HOOK = '.claude/hooks/gaston-wiki-check.ps1';

function template(path: string): SetupTemplate {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === path);
  if (found === undefined) throw new Error(`no template at ${path}`);
  return found;
}

/** The shipped templates with `path` raised to `version` and a changed body. */
function shippedWith(path: string, version: number): SetupTemplate[] {
  return SETUP_TEMPLATES.map((t) =>
    t.path === path ? { ...t, version, body: `${t.body}\nAdded in version ${version}.\n` } : t,
  );
}

function confirmEverything(state: AgentSetupState) {
  return {
    confirmed: [...state.plan.write, ...state.plan.optIn].map(({ path, expectedHash }) => ({
      path,
      expectedHash,
    })),
  };
}

async function install(store: VaultStore, templates = SETUP_TEMPLATES) {
  const state = await readSetupState(store, templates);
  return applySetup(store, confirmEverything(state), templates);
}

function statusOf(state: AgentSetupState, path: string) {
  return state.files.find((file) => file.path === path);
}

async function manifestEntries(store: VaultStore) {
  const text = await store.readText(AGENT_SETUP_MANIFEST);
  return (JSON.parse(text ?? '{}') as { files: { path: string; version: number; hash: string }[] })
    .files;
}

describe('agent setup', () => {
  it('a vault without a setup reports every managed file missing and plans an install', async () => {
    const state = await readSetupState(new MemoryVaultStore(), SETUP_TEMPLATES);

    expect(state.action).toBe('install');
    for (const t of SETUP_TEMPLATES) {
      expect(statusOf(state, t.path)).toEqual({
        path: t.path,
        status: 'missing',
        installedVersion: null,
        shippedVersion: t.version,
      });
    }
    expect(state.plan.write).toEqual(
      SETUP_TEMPLATES.map((t) => ({ path: t.path, expectedHash: '', reason: 'missing' })),
    );
    expect(state.plan.optIn).toEqual([]);
    expect(state.plan.dirs).toEqual(Object.values(AGENT_DIRS));
  });

  it('install writes every managed file with its marker and records its version in the manifest', async () => {
    const store = new MemoryVaultStore();
    const { results } = await install(store);

    expect(results.map((r) => r.outcome)).toEqual(SETUP_TEMPLATES.map(() => 'written'));
    const entries = await manifestEntries(store);
    for (const t of SETUP_TEMPLATES) {
      const content = (await store.readText(t.path)) ?? '';
      if (t.format !== 'json') {
        expect(content).toContain(`gaston:managed id=${t.id} version=${t.version}`);
      }
      expect(entries).toContainEqual({
        path: t.path,
        template: t.id,
        version: t.version,
        hash: sha256(content),
      });
    }
    expect((await store.readText(JOBS_SKILL))?.split('\n')[0]).toBe('---');
    for (const dir of Object.values(AGENT_DIRS)) expect(await store.exists(dir)).toBe(true);

    const after = await readSetupState(store, SETUP_TEMPLATES);
    expect(after.action).toBe('none');
    expect(after.files.every((file) => file.status === 'current')).toBe(true);
    expect(after.plan.dirs).toEqual([]);
  });

  it('update rewrites only managed files that are outdated or missing', async () => {
    const store = new MemoryVaultStore();
    await install(store);
    await store.delete(WIKI_HOOK);
    const before = store.allFiles();
    const shipped = shippedWith(JOBS_SKILL, 2);

    const state = await readSetupState(store, shipped);
    expect(state.action).toBe('update');
    expect(state.plan.write.map((w) => [w.path, w.reason])).toEqual([
      [WIKI_HOOK, 'missing'],
      [JOBS_SKILL, 'outdated'],
    ]);
    expect(statusOf(state, JOBS_SKILL)).toMatchObject({ installedVersion: 1, shippedVersion: 2 });

    await applySetup(store, confirmEverything(state), shipped);

    expect(await store.readText(JOBS_SKILL)).toContain('Added in version 2.');
    expect(await store.exists(WIKI_HOOK)).toBe(true);
    for (const t of SETUP_TEMPLATES.filter((t) => t.path !== JOBS_SKILL && t.path !== WIKI_HOOK)) {
      expect(await store.readText(t.path)).toBe(before[t.path]);
    }
    const after = await readSetupState(store, shipped);
    expect(after.action).toBe('none');
    expect(statusOf(after, JOBS_SKILL)).toMatchObject({ status: 'current', installedVersion: 2 });
  });

  it("a file without the marker is the user's and stays byte-identical through install and update", async () => {
    const own = {
      [SETTINGS]: '{ "permissions": { "allow": ["Bash(make:*)"] } }\n',
      [JOBS_SKILL]:
        '---\nname: my-jobs\n---\n\nMy own skill. It mentions <!-- gaston:managed id=skill-gaston-jobs version=1 --> in passing.\n',
      'CLAUDE.md': '# My vault\n\nMy own instructions.\n',
      '.claude/skills/mine/SKILL.md': '---\nname: mine\n---\n',
    };
    const store = new MemoryVaultStore({ files: own });

    const state = await readSetupState(store, SETUP_TEMPLATES);
    for (const path of Object.keys(own)) {
      expect(statusOf(state, path)).toMatchObject({ status: 'yours', installedVersion: null });
    }
    expect(statusOf(state, '.claude/skills/mine/SKILL.md')?.shippedVersion).toBeNull();
    const planned = [...state.plan.write, ...state.plan.optIn].map((entry) => entry.path);
    for (const path of Object.keys(own)) expect(planned).not.toContain(path);

    const everyPath = Object.entries(own).map(([path, content]) => ({
      path,
      expectedHash: sha256(content),
    }));
    const first = await applySetup(
      store,
      { confirmed: [...confirmEverything(state).confirmed, ...everyPath] },
      SETUP_TEMPLATES,
    );
    const second = await applySetup(store, { confirmed: everyPath }, shippedWith(SETTINGS, 2));

    for (const result of [...first.results, ...second.results]) {
      if (result.path in own) expect(result.outcome).toBe('refused');
    }
    for (const [path, content] of Object.entries(own))
      expect(await store.readText(path)).toBe(content);
    const recorded = (await manifestEntries(store)).map((entry) => entry.path);
    for (const path of Object.keys(own)) expect(recorded).not.toContain(path);
  });

  it('an edited managed file is overwritten only when confirmed and leaves an undo copy', async () => {
    const store = new MemoryVaultStore();
    await install(store);
    const edited = `${await store.readText(CURATE_SKILL)}\nMy note.\n`;
    await store.writeText(CURATE_SKILL, edited);

    const state = await readSetupState(store, SETUP_TEMPLATES);
    expect(state.action).toBe('update');
    expect(state.plan.optIn).toEqual([{ path: CURATE_SKILL, expectedHash: sha256(edited) }]);

    const declined = await applySetup(store, { confirmed: state.plan.write }, SETUP_TEMPLATES);
    expect(declined.results).toEqual([]);
    expect(await store.readText(CURATE_SKILL)).toBe(edited);

    const accepted = await applySetup(store, { confirmed: state.plan.optIn }, SETUP_TEMPLATES);
    expect(accepted.results).toEqual([{ path: CURATE_SKILL, outcome: 'written' }]);
    expect(await store.readText(CURATE_SKILL)).not.toContain('My note.');
    const undoCopies = Object.entries(store.allFiles()).filter(
      ([path]) => path.startsWith('.secondbrain/trash/') && path.endsWith(CURATE_SKILL),
    );
    expect(undoCopies.map(([, content]) => content)).toEqual([edited]);
  });

  it('declining an edited managed file leaves it untouched', async () => {
    const store = new MemoryVaultStore();
    await install(store);
    const edited = `${await store.readText(CURATE_SKILL)}
My note.
`;
    await store.writeText(CURATE_SKILL, edited);
    await store.delete(WIKI_HOOK);
    const state = await readSetupState(store, SETUP_TEMPLATES);
    expect(state.plan.write.map((w) => w.path)).toEqual([WIKI_HOOK]);
    expect(state.plan.optIn.map((o) => o.path)).toEqual([CURATE_SKILL]);

    // The dialog confirms the plan's write list; the opt-in entry stays unticked.
    const { results } = await applySetup(store, { confirmed: state.plan.write }, SETUP_TEMPLATES);

    expect(results).toEqual([{ path: WIKI_HOOK, outcome: 'written' }]);
    expect(await store.readText(CURATE_SKILL)).toBe(edited);
    const undoCopies = Object.keys(store.allFiles()).filter(
      (path) => path.startsWith('.secondbrain/trash/') && path.endsWith(CURATE_SKILL),
    );
    expect(undoCopies).toEqual([]);
  });

  it('a file changed after the plan is a conflict and is not overwritten', async () => {
    const store = new MemoryVaultStore();
    await install(store);
    await store.delete(WIKI_HOOK);
    const shipped = shippedWith(JOBS_SKILL, 2);
    const state = await readSetupState(store, shipped);

    const changed = `${await store.readText(JOBS_SKILL)}\nEdited while the dialog was open.\n`;
    await store.writeText(JOBS_SKILL, changed);
    const { results } = await applySetup(store, confirmEverything(state), shipped);

    expect(results).toEqual([
      { path: WIKI_HOOK, outcome: 'written' },
      { path: JOBS_SKILL, outcome: 'conflict' },
    ]);
    expect(await store.readText(JOBS_SKILL)).toBe(changed);
    const entry = (await manifestEntries(store)).find((e) => e.path === JOBS_SKILL);
    expect(entry?.version).toBe(1);
  });

  it('a file from a newer Gaston is never downgraded', async () => {
    const store = new MemoryVaultStore();
    const newer = shippedWith(CURATE_SKILL, 3);
    await install(store, newer);
    const written = await store.readText(CURATE_SKILL);

    const viaManifest = await readSetupState(store, SETUP_TEMPLATES);
    expect(statusOf(viaManifest, CURATE_SKILL)).toEqual({
      path: CURATE_SKILL,
      status: 'newer',
      installedVersion: 3,
      shippedVersion: template(CURATE_SKILL).version,
    });
    expect(viaManifest.action).toBe('none');

    await store.delete(AGENT_SETUP_MANIFEST);
    const viaMarker = await readSetupState(store, SETUP_TEMPLATES);
    expect(statusOf(viaMarker, CURATE_SKILL)?.status).toBe('newer');

    const { results } = await applySetup(
      store,
      { confirmed: [{ path: CURATE_SKILL, expectedHash: sha256(written ?? '') }] },
      SETUP_TEMPLATES,
    );
    expect(results).toEqual([{ path: CURATE_SKILL, outcome: 'refused' }]);
    expect(await store.readText(CURATE_SKILL)).toBe(written);
  });

  it('installed setup files contain no absolute machine path', async () => {
    const vault = await createTempVault();
    try {
      await install(vault.store);
      const forbidden = [
        vault.root,
        vault.root.replaceAll('\\', '/'),
        homedir(),
        homedir().replaceAll('\\', '/'),
      ];
      for (const path of [...SETUP_TEMPLATES.map((t) => t.path), AGENT_SETUP_MANIFEST]) {
        const content = await vault.read(path);
        expect(content, path).not.toBeNull();
        for (const needle of forbidden) expect(content, path).not.toContain(needle);
        expect(content, path).not.toMatch(/^[A-Za-z]:[\\/]/m);
        expect(content, path).not.toMatch(/\/Users\/|\/home\//);
      }
    } finally {
      await vault.cleanup();
    }
  });

  it('the marker of a script sits after a shebang when there is one and parses back', () => {
    const script = SETUP_TEMPLATES.find((t) => t.format === 'script');
    expect(script).toBeDefined();
    if (script === undefined) return;
    const shebang = { ...script, body: `#!/usr/bin/env bash\n${script.body}` };

    const lines = renderSetupFile(shebang).split('\n');

    expect(lines[0]?.startsWith('#!')).toBe(true);
    expect(lines[1]).toBe(`# gaston:managed id=${script.id} version=${script.version}`);
    expect(parseMarker(lines.join('\n'))).toEqual({ id: script.id, version: script.version });
  });

  it('the marker of a script without a shebang is its first line and parses back', () => {
    const script = SETUP_TEMPLATES.find((t) => t.format === 'script');
    expect(script).toBeDefined();
    if (script === undefined) return;
    expect(script.body.startsWith('#!')).toBe(false);

    const rendered = renderSetupFile(script);

    expect(rendered.split('\n')[0]).toBe(
      `# gaston:managed id=${script.id} version=${script.version}`,
    );
    expect(parseMarker(rendered)).toEqual({ id: script.id, version: script.version });
  });

  it('the marker of a markdown file is its first line and parses back', () => {
    const markdown = template('CLAUDE.md');
    expect(markdown.format).toBe('markdown');

    const rendered = renderSetupFile(markdown);

    expect(rendered.split('\n')[0]).toBe(
      `<!-- gaston:managed id=${markdown.id} version=${markdown.version} -->`,
    );
    expect(parseMarker(rendered)).toEqual({ id: markdown.id, version: markdown.version });
  });

  it('the marker of a skill sits after its frontmatter, which still parses', () => {
    const skill = template(JOBS_SKILL);
    expect(skill.format).toBe('markdown-frontmatter');

    const rendered = renderSetupFile(skill);
    const lines = rendered.split('\n');
    const close = lines.indexOf('---', 1);

    expect(lines[0]).toBe('---');
    expect(lines[close + 1]).toBe(
      `<!-- gaston:managed id=${skill.id} version=${skill.version} -->`,
    );
    expect(parseMarker(rendered)).toEqual({ id: skill.id, version: skill.version });
    const { frontmatter, hadFrontmatter } = parse(rendered);
    expect(hadFrontmatter).toBe(true);
    expect(frontmatter.name).toBe(AGENT_SKILLS.jobs);
  });
});
