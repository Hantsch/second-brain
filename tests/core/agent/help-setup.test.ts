/* The help module lives in modules/gaston-help/, a folder the user may also write to, so
 * every test checks what must stay untouched as carefully as what gets written. */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HELP_MODULE_FILE, HELP_TEMPLATES } from '@core/agent/help/setup';
import { HELP_MODULE_VERSION } from '@core/agent/help/version';
import { applySetup } from '@core/agent/setup-apply';
import { readHelpModuleState, readSetupState } from '@core/agent/setup-status';
import { MANAGED_TEMPLATES } from '@core/agent/managed-templates';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import type { SetupTemplate } from '@core/agent/setup-types';
import { sha256 } from '@core/vault/hash';
import { logHeader } from '@core/wiki/log-md';
import { AGENT_DIRS, AGENT_SETUP_MANIFEST } from '../../../src/shared/types/agent-setup';
import { createTempVault, type TempVault } from '../../helpers/vault';

const ROOT = 'modules/gaston-help';
const AGENTS = `${ROOT}/AGENTS.md`;
const INDEX = `${ROOT}/wiki/index.md`;
const LOG = `${ROOT}/wiki/log.md`;
const CONCEPTS = HELP_TEMPLATES.filter((t) => t.path.includes('/wiki/concepts/'));
const PAGE = CONCEPTS[0]?.path ?? '';
const SECOND_PAGE = CONCEPTS[1]?.path ?? '';

/** The managed templates with the help files in `paths` shipped at `version` with new text. */
function helpShippedAt(version: number, paths: readonly string[]): SetupTemplate[] {
  return MANAGED_TEMPLATES.map((t) =>
    paths.includes(t.path)
      ? {
          ...t,
          version,
          body: `${t.body.replace(/template_version: \d+/, `template_version: ${version}`)}\nAdded in version ${version}.\n`,
        }
      : t,
  );
}

async function setUp(store: TempVault['store'], templates: readonly SetupTemplate[]) {
  const state = await readSetupState(store, templates);
  const confirmed = [...state.plan.write, ...state.plan.optIn].map(({ path, expectedHash }) => ({
    path,
    expectedHash,
  }));
  return applySetup(store, { confirmed }, templates);
}

async function vaultFiles(vault: TempVault): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of vault.store.walk({ includeInternal: true })) paths.push(entry.path);
  return paths.sort();
}

/* Every test installs 22 files through atomic writes; with the whole suite running in parallel
   on Windows a single install has stalled for seconds on file-system contention — past the old
   5 s default, and past a 20 s override here under three parallel suites. The central timeout
   (vitest.config.ts) is the hang detector for it. */
describe('help module setup', () => {
  let vault: TempVault;
  beforeEach(async () => {
    vault = await createTempVault();
  });
  afterEach(async () => {
    await vault.cleanup();
  });

  it('install writes the help module with module.md, AGENTS.md and its pages', async () => {
    const state = await readSetupState(vault.store);
    expect(state.action).toBe('install');

    const { results } = await setUp(vault.store, MANAGED_TEMPLATES);

    expect(results.every((r) => r.outcome === 'written')).toBe(true);
    for (const t of SETUP_TEMPLATES) expect(await vault.exists(t.path), t.path).toBe(true);
    for (const t of HELP_TEMPLATES) expect(await vault.read(t.path), t.path).toBe(t.body);
    expect(await vault.exists(HELP_MODULE_FILE)).toBe(true);
    expect(await vault.exists(AGENTS)).toBe(true);
    expect(await vault.exists(INDEX)).toBe(true);
    expect(CONCEPTS.length).toBeGreaterThan(0);
    expect(await vault.exists('CLAUDE.md')).toBe(true);

    const manifest = (await vault.read(AGENT_SETUP_MANIFEST)) ?? '';
    for (const t of HELP_TEMPLATES) expect(manifest).toContain(`"path": "${t.path}"`);
    expect(manifest).not.toContain(LOG);

    const log = (await vault.read(LOG)) ?? '';
    expect(log.startsWith(logHeader('en').trimEnd())).toBe(true);
    expect(log).toContain(`ingest | Gaston help, version ${HELP_MODULE_VERSION}`);
    expect(log).toContain('wiki/index.md');
  });

  it('the help module reads as missing, outdated or current', async () => {
    expect((await readHelpModuleState(vault.store)).status).toBe('missing');

    await setUp(vault.store, MANAGED_TEMPLATES);
    expect(await readHelpModuleState(vault.store)).toEqual({
      status: 'current',
      installedVersion: HELP_MODULE_VERSION,
      shippedVersion: HELP_MODULE_VERSION,
    });

    // A newer Gaston ships a page in a higher version.
    const shipped = helpShippedAt(HELP_MODULE_VERSION + 1, [PAGE]);
    expect((await readHelpModuleState(vault.store, shipped)).status).toBe('outdated');

    // Without the manifest, the frontmatter marker alone still claims the pages.
    const manifest = (await vault.read(AGENT_SETUP_MANIFEST)) ?? '';
    await vault.store.delete(AGENT_SETUP_MANIFEST);
    expect((await readHelpModuleState(vault.store)).status).toBe('current');
    await vault.write(AGENT_SETUP_MANIFEST, manifest);

    // The user lowers a page's version by hand: modified, so outdated and confirm-only.
    const page = (await vault.read(PAGE)) ?? '';
    const lowered = page.replace(/template_version: \d+/, 'template_version: 0');
    expect(lowered).not.toBe(page);
    await vault.write(PAGE, lowered);
    expect((await readHelpModuleState(vault.store)).status).toBe('outdated');
    const state = await readSetupState(vault.store);
    expect(state.plan.optIn).toEqual([{ path: PAGE, expectedHash: sha256(lowered) }]);
    expect(state.plan.write).toEqual([]);
  });

  it('update rewrites only marked help files', async () => {
    // A later version adds SECOND_PAGE; until then the user wrote a page at that path,
    // mentioning the marker keys only in its body.
    await setUp(
      vault.store,
      MANAGED_TEMPLATES.filter((t) => t.path !== SECOND_PAGE),
    );
    const userPage = '# My notes\n\nmanaged_by: gaston\ntemplate_version: 1\n';
    await vault.write(SECOND_PAGE, userPage);
    const agentsBefore = await vault.read(AGENTS);
    const logBefore = (await vault.read(LOG)) ?? '';

    const shipped = helpShippedAt(HELP_MODULE_VERSION + 1, [PAGE]);
    const state = await readSetupState(vault.store, shipped);
    expect(state.files.find((f) => f.path === SECOND_PAGE)?.status).toBe('yours');
    expect(state.plan.write.map((w) => w.path)).toEqual([PAGE]);

    const { results } = await applySetup(
      vault.store,
      { confirmed: [...state.plan.write, { path: SECOND_PAGE, expectedHash: sha256(userPage) }] },
      shipped,
    );

    expect(results).toEqual([
      { path: PAGE, outcome: 'written' },
      { path: SECOND_PAGE, outcome: 'refused' },
    ]);
    expect(await vault.read(PAGE)).toContain(`template_version: ${HELP_MODULE_VERSION + 1}`);
    expect(await vault.read(SECOND_PAGE)).toBe(userPage);
    expect(await vault.read(AGENTS)).toBe(agentsBefore);
    const log = (await vault.read(LOG)) ?? '';
    expect(log.startsWith(logBefore.trimEnd())).toBe(true);
    expect(log).toContain(`Gaston help, version ${HELP_MODULE_VERSION + 1}`);
  });

  it('a page the user added stays byte-identical after update', async () => {
    await setUp(vault.store, MANAGED_TEMPLATES);
    const mine = `${ROOT}/wiki/concepts/my-shortcuts.md`;
    const content =
      '---\r\ntype: concept\r\ntitle: My shortcuts\r\n---\r\n\r\nCtrl+K opens search.\r\n';
    await vault.write(mine, content);

    const everyHelpPath = HELP_TEMPLATES.map((t) => t.path);
    const { results } = await setUp(
      vault.store,
      helpShippedAt(HELP_MODULE_VERSION + 1, everyHelpPath),
    );

    expect(results.filter((r) => r.outcome === 'written')).toHaveLength(HELP_TEMPLATES.length);
    expect(results.map((r) => r.path)).not.toContain(mine);
    expect(await vault.read(mine)).toBe(content);
  });

  it('an unmarked user module named gaston-help blocks install and nothing is written', async () => {
    const userModule =
      '---\ntype: note\ntitle: My Gaston help\nmodule: gaston-help\n---\n\nMine.\n';
    await vault.write(HELP_MODULE_FILE, userModule);
    const before = await vaultFiles(vault);

    expect((await readHelpModuleState(vault.store)).status).toBe('collision');
    const state = await readSetupState(vault.store);
    expect(state.plan.collision).toEqual({ module: 'gaston-help', path: HELP_MODULE_FILE });
    expect(state.plan.write).toEqual([]);
    expect(state.plan.optIn).toEqual([]);
    expect(state.plan.dirs).toEqual([]);

    // Even a request naming every managed path is refused.
    const forced = MANAGED_TEMPLATES.map((t) => ({ path: t.path, expectedHash: '' }));
    const { results } = await applySetup(vault.store, { confirmed: forced });
    expect(results.every((r) => r.outcome === 'refused')).toBe(true);

    expect(await vaultFiles(vault)).toEqual(before);
    expect(await vault.read(HELP_MODULE_FILE)).toBe(userModule);
    expect(await vault.exists('.claude')).toBe(false);
    expect(await vault.exists('CLAUDE.md')).toBe(false);
    expect(await vault.exists(AGENT_DIRS.jobs)).toBe(false);
    expect(await vault.exists(LOG)).toBe(false);
  });

  it('a modules/gaston-help folder without module.md reads as collision', async () => {
    const userPage = `${ROOT}/wiki/concepts/mine.md`;
    await vault.write(userPage, '# Mine\n');
    const before = await vaultFiles(vault);

    expect((await readHelpModuleState(vault.store)).status).toBe('collision');
    const state = await readSetupState(vault.store);
    expect(state.plan.collision).toEqual({ module: 'gaston-help', path: HELP_MODULE_FILE });
    expect(state.plan.write).toEqual([]);

    const forced = MANAGED_TEMPLATES.map((t) => ({ path: t.path, expectedHash: '' }));
    const { results } = await applySetup(vault.store, { confirmed: forced });
    expect(results.every((r) => r.outcome === 'refused')).toBe(true);
    expect(await vaultFiles(vault)).toEqual(before);
    expect(await vault.read(userPage)).toBe('# Mine\n');
  });

  it('a help module.md deleted after install reads as missing and install restores it', async () => {
    await setUp(vault.store, MANAGED_TEMPLATES);
    const mine = `${ROOT}/wiki/concepts/my-shortcuts.md`;
    const content = '---\ntype: concept\ntitle: My shortcuts\n---\n\nCtrl+K opens search.\n';
    await vault.write(mine, content);
    await vault.store.delete(HELP_MODULE_FILE);

    expect((await readHelpModuleState(vault.store)).status).toBe('missing');

    await setUp(vault.store, MANAGED_TEMPLATES);

    const moduleTemplate = HELP_TEMPLATES.find((t) => t.path === HELP_MODULE_FILE);
    expect(await vault.read(HELP_MODULE_FILE)).toBe(moduleTemplate?.body);
    expect((await readHelpModuleState(vault.store)).status).toBe('current');
    expect(await vault.read(mine)).toBe(content);
  });

  it('a user module named gaston-help created after an install reads as collision and update writes nothing', async () => {
    await setUp(vault.store, MANAGED_TEMPLATES);
    await rm(join(vault.root, ROOT), { recursive: true, force: true });
    const userModule =
      '---\ntype: note\ntitle: My Gaston help\nmodule: gaston-help\n---\n\nMine.\n';
    const userPage = '# Mine\n';
    const mine = `${ROOT}/wiki/concepts/mine.md`;
    await vault.write(HELP_MODULE_FILE, userModule);
    await vault.write(mine, userPage);
    const manifestBefore = await vault.read(AGENT_SETUP_MANIFEST);
    const before = await vaultFiles(vault);

    expect((await readHelpModuleState(vault.store)).status).toBe('collision');
    // A newer Gaston ships every help file anew: the update is due, but nothing is planned.
    const shipped = helpShippedAt(
      HELP_MODULE_VERSION + 1,
      HELP_TEMPLATES.map((t) => t.path),
    );
    const state = await readSetupState(vault.store, shipped);
    expect(state.help.status).toBe('collision');
    expect(state.plan.collision).toEqual({ module: 'gaston-help', path: HELP_MODULE_FILE });
    expect(state.plan.write).toEqual([]);
    expect(state.plan.optIn).toEqual([]);

    const forced = shipped.map((t) => ({ path: t.path, expectedHash: '' }));
    const { results } = await applySetup(vault.store, { confirmed: forced }, shipped);
    expect(results.every((r) => r.outcome === 'refused')).toBe(true);
    const hashed = await setUp(vault.store, shipped);
    expect(hashed.results).toEqual([]);

    expect(await vaultFiles(vault)).toEqual(before);
    expect(await vault.read(HELP_MODULE_FILE)).toBe(userModule);
    expect(await vault.read(mine)).toBe(userPage);
    expect(await vault.read(AGENT_SETUP_MANIFEST)).toBe(manifestBefore);
  });

  it('a gaston-help folder recreated with only user pages after an install reads as collision', async () => {
    await setUp(vault.store, MANAGED_TEMPLATES);
    await rm(join(vault.root, ROOT), { recursive: true, force: true });
    // The user's own page at a path Gaston recorded, without the marker.
    await vault.write(AGENTS, '# My agent notes\n');
    const before = await vaultFiles(vault);

    const state = await readSetupState(vault.store);
    expect(state.help.status).toBe('collision');
    expect(state.plan.write).toEqual([]);
    expect(state.plan.optIn).toEqual([]);
    const forced = MANAGED_TEMPLATES.map((t) => ({ path: t.path, expectedHash: '' }));
    const { results } = await applySetup(vault.store, { confirmed: forced });
    expect(results.every((r) => r.outcome === 'refused')).toBe(true);
    expect(await vaultFiles(vault)).toEqual(before);
    expect(await vault.read(AGENTS)).toBe('# My agent notes\n');
  });

  it('an edited module.md that keeps the marker is confirm-only, not a collision', async () => {
    await setUp(vault.store, MANAGED_TEMPLATES);
    const edited = `${(await vault.read(HELP_MODULE_FILE)) ?? ''}\nMy addition.\n`;
    await vault.write(HELP_MODULE_FILE, edited);

    const state = await readSetupState(vault.store);
    expect(state.plan.collision).toBeUndefined();
    expect(state.help.status).toBe('outdated');
    expect(state.plan.optIn).toEqual([{ path: HELP_MODULE_FILE, expectedHash: sha256(edited) }]);
    expect(state.plan.write).toEqual([]);
  });

  it('an unmarked user module named gaston-help blocks an update of the setup too', async () => {
    await setUp(vault.store, SETUP_TEMPLATES);
    const userModule = '# My module\n';
    await vault.write(HELP_MODULE_FILE, userModule);
    const settings = SETUP_TEMPLATES.find((t) => t.path.endsWith('settings.json'));
    if (settings === undefined) throw new Error('no settings template');
    const settingsBefore = await vault.read(settings.path);

    const shipped = MANAGED_TEMPLATES.map((t) =>
      t.path === settings.path ? { ...t, version: t.version + 1, body: `${t.body}\n` } : t,
    );
    const state = await readSetupState(vault.store, shipped);
    expect(state.action).toBe('update');
    expect(state.plan.collision?.path).toBe(HELP_MODULE_FILE);

    const { results } = await applySetup(
      vault.store,
      { confirmed: [{ path: settings.path, expectedHash: sha256(settingsBefore ?? '') }] },
      shipped,
    );
    expect(results).toEqual([{ path: settings.path, outcome: 'refused' }]);
    expect(await vault.read(settings.path)).toBe(settingsBefore);
    expect(await vault.read(HELP_MODULE_FILE)).toBe(userModule);
  });
});
