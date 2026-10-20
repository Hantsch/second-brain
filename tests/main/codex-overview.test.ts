/* Codex work counts as work — the overview channels in the main process, on
 * real files, through the real handlers, without the real `~/.claude` or
 * `~/.codex`.
 *
 * The risk this file pins: the touches map is one process-wide map that
 * `applyExternalTouches` replaces wholesale. Claude's and Codex's traces must
 * be merged before they are applied, or whichever CLI is applied second erases
 * the other's `lastTouch` and a project's `stale` flag flips with call order.
 *
 * Fixture layout:
 *   - `werkbank-cli` — a project created here whose file is 70 days old and
 *     that only a Codex session touches (via `repos`). No Claude fixture
 *     session points at it.
 *   - `kundenportal-relaunch` — touched only by the Claude fixture session.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { CLAUDE_PROJECTS_DIR } from '../fixtures';
import { syntheticSession } from '../core/codex/fixtures';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW, freezeTime } from '../helpers/time';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  Notification: class {
    static isSupported(): boolean {
      return false;
    }
  },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const CODEX_ONLY = 'werkbank-cli';
const CODEX_ONLY_REPO = '/home/user/code/werkbank-cli';
const CLAUDE_ONLY = 'kundenportal-relaunch';
const CLAUDE_ONLY_FILE = 'projects/work/kundenportal-relaunch/project.md';

/** Newest session of all fixtures — Claude's newest is 2026-08-10T09:15Z. */
const CODEX_ONLY_ACTIVITY = '2026-08-10T10:00:00.000Z';
/** Sits between the Claude fixture sessions (09:15Z and 08:43Z). */
const CODEX_UNLINKED_ACTIVITY = '2026-08-10T09:00:00.000Z';

const PROJECT_FILE = `---
type: project
title: Werkbank CLI
slug: ${CODEX_ONLY}
scope: work
status: active
priority: 2
started: 2026-05-01
next_step: Release notes schreiben
tags: []
modules: []
repos: ['${CODEX_ONLY_REPO}']
created: 2026-05-01
updated: 2026-06-01
lang: de
---

## Stand

Nur im Terminal mit Codex bearbeitet.
`;

function uuid(n: number): string {
  return `cccccccc-0000-1111-2222-${String(n).padStart(12, '0')}`;
}

/** One real Codex rollout file, filed under its day like the CLI does. */
async function writeCodexSession(
  root: string,
  id: string,
  cwd: string,
  lastActivity: string,
): Promise<void> {
  const [year, month, dayOfMonth] = lastActivity.slice(0, 10).split('-') as [
    string,
    string,
    string,
  ];
  const dir = join(root, year, month, dayOfMonth);
  await mkdir(dir, { recursive: true });
  const startedAt = new Date(Date.parse(lastActivity) - 5 * 60_000).toISOString();
  const stamp = startedAt.slice(0, 19).replace(/:/g, '-');
  await writeFile(
    join(dir, `rollout-${stamp}-${id}.jsonl`),
    syntheticSession({ sessionId: id, cwd, startedAt, lastActivity }),
    'utf8',
  );
}

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { resetExternalTouches } = await import('../../src/main/claude-touches');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions, forgetCodexSessions } = await import('../../src/main/ipc/overview-deps');
  const { dashboardHandlers } = await import('../../src/main/ipc/dashboard');
  const { reminderHandlers } = await import('../../src/main/ipc/reminders');
  const { claudeHandlers } = await import('../../src/main/ipc/claude');
  const { projectHandlers } = await import('../../src/main/ipc/projects');

  /* Session caches and the touches map live on the module, not the services. */
  forgetSessions();
  forgetCodexSessions();
  forgetOverviewState();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) =>
    IndexService.open(new FsVaultStore(root), {
      now: () => new Date(NOW),
      externalTouches: resetExternalTouches(),
    }),
  );

  const handlers: Handlers = {
    ...dashboardHandlers(services),
    ...reminderHandlers(services),
    ...claudeHandlers(services),
    ...projectHandlers(services),
  };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`no handler for ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { settings, services, call };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Codex sessions in the overview', () => {
  let vault: TempVault;
  let userDataDir: string;
  let codexBase: string;
  let codexRoot: string;
  let harness: Harness;

  async function project(slug: string) {
    return (await harness.call('projects:list', {})).find((p) => p.slug === slug);
  }

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    await mkdir(join(vault.root, 'projects', 'work', CODEX_ONLY), { recursive: true });
    await writeFile(
      join(vault.root, 'projects', 'work', CODEX_ONLY, 'project.md'),
      PROJECT_FILE,
      'utf8',
    );
    /* The file's own age counts as a touch — 70 days back, it is stale by itself. */
    await vault.touch(`projects/work/${CODEX_ONLY}/project.md`, -70);

    codexBase = await mkdtemp(join(tmpdir(), 'sb-codex-overview-'));
    codexRoot = join(codexBase, 'sessions');
    await writeCodexSession(codexRoot, uuid(1), CODEX_ONLY_REPO, CODEX_ONLY_ACTIVITY);
    await writeCodexSession(
      codexRoot,
      uuid(2),
      '/home/user/scratch/unrelated-tool',
      CODEX_UNLINKED_ACTIVITY,
    );

    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-codex-overview-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    await harness.settings.patchVault({
      overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR, codexSessionsDir: codexRoot },
    });
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(codexBase, { recursive: true, force: true });
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('the Codex-only project is stale when Codex reading is off (fixture control)', async () => {
    await harness.settings.patchVault({ overview: { useCodexSessions: false } });
    const data = await harness.call('dashboard:data', undefined);

    expect(data.staleProjects).toContain(CODEX_ONLY);
  });

  it('a project whose only recent work is a Codex session is not stale', async () => {
    const data = await harness.call('dashboard:data', undefined);
    const touched = await project(CODEX_ONLY);

    expect(data.staleProjects).not.toContain(CODEX_ONLY);
    expect(touched?.lastTouchSource).toBe('codex-session');
    expect(touched?.lastTouch).toBe(CODEX_ONLY_ACTIVITY);
    expect(touched?.stale).toBe(false);
  });

  it('a Codex-only project raises no stale-project reminder', async () => {
    const reminders = await harness.call('reminders:list', undefined);

    expect(reminders.some((r) => r.source === 'stale-project' && r.project === CODEX_ONLY)).toBe(
      false,
    );
  });

  it('a Codex session appears in recent work', async () => {
    const data = await harness.call('dashboard:data', undefined);

    expect(data.recentWork.some((item) => item.kind === 'codex-session')).toBe(true);
  });

  it('dashboard sessions include both kinds, newest first', async () => {
    const { sessions } = await harness.call('dashboard:data', undefined);

    /* Interleaved by time, not "all Claude, then all Codex". */
    expect(sessions.slice(0, 4).map((s) => [s.agent, s.lastActivity.slice(0, 16)])).toEqual([
      ['codex', '2026-08-10T10:00'],
      ['claude', '2026-08-10T09:15'],
      ['codex', '2026-08-10T09:00'],
      ['claude', '2026-08-10T08:43'],
    ]);
    const stamps = sessions.map((s) => Date.parse(s.lastActivity));
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
    const codex = sessions.find((s) => s.agent === 'codex' && s.vaultProject === CODEX_ONLY);
    expect(codex?.projectKey.length).toBeGreaterThan(0);
  });

  it('Claude and Codex touches on different projects both survive a dashboard call followed by claude:sessions', async () => {
    /* Without the Claude session, the Claude-only project would be stale too. */
    await vault.touch(CLAUDE_ONLY_FILE, -21);

    await harness.call('dashboard:data', undefined);
    await harness.call('claude:sessions', {});
    /* And the other way round, with fresh caches: the session browser first. */
    const { forgetSessions, forgetCodexSessions } =
      await import('../../src/main/ipc/overview-deps');
    forgetSessions();
    forgetCodexSessions();
    await harness.call('claude:sessions', {});
    const data = await harness.call('dashboard:data', undefined);

    const claudeTouched = await project(CLAUDE_ONLY);
    const codexTouched = await project(CODEX_ONLY);
    expect(claudeTouched?.lastTouchSource).toBe('claude-session');
    expect(claudeTouched?.lastTouch.slice(0, 16)).toBe('2026-08-10T08:43');
    expect(claudeTouched?.stale).toBe(false);
    expect(codexTouched?.lastTouchSource).toBe('codex-session');
    expect(codexTouched?.lastTouch).toBe(CODEX_ONLY_ACTIVITY);
    expect(codexTouched?.stale).toBe(false);
    expect(data.staleProjects).not.toContain(CLAUDE_ONLY);
    expect(data.staleProjects).not.toContain(CODEX_ONLY);
  });

  it('a Codex session beyond the display limit still counts as last touch', async () => {
    /* 22 newer, unlinked Codex sessions push the only session that touches
       the Codex-only project out of the dashboard's 20-session slice. */
    for (let n = 0; n < 22; n += 1) {
      const at = new Date(Date.parse('2026-08-10T11:00:00.000Z') + n * 60_000).toISOString();
      await writeCodexSession(codexRoot, uuid(100 + n), `/home/user/scratch/tmp-${n}`, at);
    }

    const data = await harness.call('dashboard:data', undefined);
    const touched = await project(CODEX_ONLY);

    expect(data.sessions).toHaveLength(20);
    expect(data.sessions.some((s) => s.vaultProject === CODEX_ONLY)).toBe(false);
    expect(data.staleProjects).not.toContain(CODEX_ONLY);
    expect(touched?.lastTouchSource).toBe('codex-session');
    expect(touched?.lastTouch).toBe(CODEX_ONLY_ACTIVITY);
  });
});
