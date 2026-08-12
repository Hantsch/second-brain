/* Dashboard, Erinnerungen und Sessions im Hauptprozess — an echten Dateien,
 * ohne Netz und ohne das echte `~/.claude` (gelesen wird
 * `tests/fixtures/claude/projects`).
 *
 * Der Prüfstein dieses Bereichs: **was ein Kanal meldet, muss passiert sein.**
 * Deshalb steht hier vor allem, was danach in der Datei steht:
 *   - `dashboard:setLayout` schreibt eine geprüfte Anordnung in die
 *     Vault-Einstellungen; erfundene Module überleben nicht.
 *   - `reminders:snooze` schreibt `.secondbrain/overview.json` und die Erinnerung
 *     verschwindet wirklich aus der Liste. Eine unbekannte Marke ist ein Fehler,
 *     kein stiller Erfolg.
 *   - `claude:link` schreibt den Sitzungspfad in `repos` des Projekts — und
 *     lässt jedes Nutzerfeld in Ruhe.
 *   - Die Sitzungen wirken auf `lastTouch`: ein Projekt, an dem im Terminal
 *     gearbeitet wurde, stagniert nicht.
 *   - Die Benachrichtigung meldet dieselbe Sache nicht zweimal am selben Tag.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { DashboardLayout } from '@shared/types';
import { CLAUDE_PROJECTS_DIR } from '../fixtures';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW, TODAY, freezeTime } from '../helpers/time';

/* Electron gibt es im Test nicht: keine Fenster, keine Verschlüsselung, keine
   echte Benachrichtigung. */
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

const WORK = 'projects/work/kundenportal-relaunch/project.md';

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { resetExternalTouches } = await import('../../src/main/claude-touches');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions } = await import('../../src/main/ipc/overview-deps');
  const { dashboardHandlers } = await import('../../src/main/ipc/dashboard');
  const { reminderHandlers } = await import('../../src/main/ipc/reminders');
  const { claudeHandlers } = await import('../../src/main/ipc/claude');
  const { projectHandlers } = await import('../../src/main/ipc/projects');

  /* Zustand aus einem früheren Test darf nicht überleben: Sitzungspuffer,
     Spurenkarte und der geladene Ruhezustand hängen am Modul. */
  forgetSessions();
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
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Dashboard-, Erinnerungs- und Session-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    /* Fristen, Serien und Stagnation hängen am Kalendertag. */
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-dashboard-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* Die Sitzungen kommen aus den Fixtures, nie aus dem echten ~/.claude. */
    await harness.settings.patchVault({ overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR } });
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  // ── Inhalte ────────────────────────────────────────────────────────────────

  it('liefert das Dashboard in einem Rutsch, Todos nach Bereich getrennt', async () => {
    const data = await harness.call('dashboard:data', undefined);

    expect(data.todos.work.every((todo) => todo.scope === 'work')).toBe(true);
    expect(data.todos.private.every((todo) => todo.scope === 'private')).toBe(true);
    expect(data.todos.work.map((todo) => todo.text)).toContain(
      'Abnahmeprotokoll mit Miriam durchgehen',
    );
    /* Warte-auf trägt immer seinen Projektbezug. */
    expect(data.waitingOn[0]).toMatchObject({
      who: 'Jonas',
      project: 'kundenportal-relaunch',
      path: WORK,
    });
    expect(data.reminders.length).toBeGreaterThan(0);
    expect(data.journal.lastEntry).not.toBeNull();
  });

  it('behauptet keinen Pflegewert, solange kein Pflegelauf existiert', async () => {
    const data = await harness.call('dashboard:data', undefined);

    expect(data.healthKnown).toBe(false);
    expect(data.health).toBe(0);
    expect(data.findingCount).toBe(0);
  });

  it('gibt „zuletzt gearbeitet" auf Deutsch aus und auf Englisch, wenn die Oberfläche es ist', async () => {
    const german = await harness.call('dashboard:data', undefined);
    expect(german.recentWork.some((item) => /geändert|Session/.test(item.detail))).toBe(true);

    await harness.settings.patchVault({ languages: { ui: 'en' } });
    const english = await harness.call('dashboard:data', undefined);
    expect(english.recentWork.some((item) => /changed|Session/.test(item.detail))).toBe(true);
    expect(english.recentWork.some((item) => /geändert/.test(item.detail))).toBe(false);
  });

  // ── Anordnung ──────────────────────────────────────────────────────────────

  it('lädt eine Anordnung, in der jedes Modul genau einmal vorkommt', async () => {
    const layout = await harness.call('dashboard:layout', undefined);

    const ids = layout.tiles.map((tile) => tile.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(13);
  });

  it('speichert eine Anordnung im Vault und wirft Erfundenes heraus', async () => {
    const wanted = {
      tiles: [
        { id: 'inbox', size: 'xl' },
        { id: 'inbox', size: 'sm' },
        { id: 'erfunden', size: 'md' },
        { id: 'gardener', size: 'sm', hidden: true },
      ],
      updated: '2020-01-01T00:00:00.000Z',
    } as unknown as DashboardLayout;

    const saved = await harness.call('dashboard:setLayout', { layout: wanted });

    expect(saved.tiles[0]).toEqual({ id: 'inbox', size: 'xl' });
    expect(saved.tiles.map((tile) => tile.id)).not.toContain('erfunden');
    expect(saved.tiles.filter((tile) => tile.id === 'inbox')).toHaveLength(1);
    /* Was nicht in der Anfrage stand, ist da — ausgeblendet, nicht verloren. */
    expect(saved.tiles.find((tile) => tile.id === 'recent-work')?.hidden).toBe(true);

    const file = JSON.parse((await vault.read('.secondbrain/settings.json')) ?? '{}') as {
      dashboard: DashboardLayout;
    };
    expect(file.dashboard.tiles[0]).toEqual({ id: 'inbox', size: 'xl' });
    expect(await harness.call('dashboard:layout', undefined)).toMatchObject({
      tiles: file.dashboard.tiles,
    });
  });

  // ── Erinnerungen ───────────────────────────────────────────────────────────

  it('mahnt überfällige Fristen und stellt eine davon ruhig — in der Datei', async () => {
    const before = await harness.call('reminders:list', undefined);
    const overdue = before.find((reminder) => reminder.urgency === 'overdue');
    expect(overdue).toBeDefined();

    await harness.call('reminders:snooze', { id: overdue!.id, days: 3 });

    const after = await harness.call('reminders:list', undefined);
    expect(after.some((reminder) => reminder.id === overdue!.id)).toBe(false);
    const state = JSON.parse((await vault.read('.secondbrain/overview.json')) ?? '{}') as {
      snoozes: Record<string, string>;
    };
    expect(state.snoozes[overdue!.id]).toBe('2026-08-13');
  });

  it('lehnt es ab, eine Erinnerung ruhig zu stellen, die es nicht gibt', async () => {
    await expect(
      harness.call('reminders:snooze', { id: 'gibt-es-nicht', days: 3 }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(harness.call('reminders:snooze', { id: 'egal', days: 0 })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(await vault.exists('.secondbrain/overview.json')).toBe(false);
  });

  // ── Sessions ───────────────────────────────────────────────────────────────

  it('liest die Sitzungen und ordnet sie über `repos` zu', async () => {
    const sessions = await harness.call('claude:sessions', {});

    expect(sessions.length).toBeGreaterThan(0);
    const linked = sessions.find((session) => session.vaultProject === 'kundenportal-relaunch');
    expect(linked?.gitBranch).toBe('feature/angebotsliste');
    expect(linked?.firstPrompt.length).toBeGreaterThan(0);
    /* Eine Sitzung ohne passendes Projekt bleibt ohne Zuordnung, statt geraten. */
    expect(sessions.some((session) => session.vaultProject === null)).toBe(true);
  });

  it('liest nichts, wenn das Mitlesen abgeschaltet ist', async () => {
    await harness.settings.patchVault({ overview: { useClaudeSessions: false } });

    expect(await harness.call('claude:sessions', {})).toEqual([]);
    const data = await harness.call('dashboard:data', undefined);
    expect(data.sessions).toEqual([]);
    await expect(
      harness.call('claude:link', { sessionId: 'session-kundenportal', project: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('lässt die Sitzungen auf `lastTouch` wirken', async () => {
    /* Die Projektdatei liegt drei Wochen zurück — ohne die Sitzung wäre das
       Projekt stagnierend. Im Terminal wurde aber heute daran gearbeitet. */
    await vault.touch(WORK, -21);
    const data = await harness.call('dashboard:data', undefined);
    const projects = await harness.call('projects:list', {});
    const touched = projects.find((project) => project.slug === 'kundenportal-relaunch');

    expect(data.sessions.some((session) => session.vaultProject === 'kundenportal-relaunch')).toBe(
      true,
    );
    expect(touched?.lastTouchSource).toBe('claude-session');
    expect(touched?.stale).toBe(false);
  });

  it('schreibt bei `claude:link` den Pfad in `repos` und lässt Nutzerfelder stehen', async () => {
    const unlinked = (await harness.call('claude:sessions', {})).find(
      (session) => session.vaultProject === null,
    );
    expect(unlinked).toBeDefined();

    await harness.call('claude:link', {
      sessionId: unlinked!.id,
      project: 'hochbeet-bauen',
    });

    /* Die Schreibform der Datei: Schrägstriche, großer Laufwerksbuchstabe
       (docs/VAULT-FORMAT.md). Hier von Hand gebildet, damit der Test die Form
       behauptet und nicht bloß wiederholt, was der Kern gerade tut. */
    const written = unlinked!.cwd
      .replace(/\\/g, '/')
      .replace(/^([a-z]):/, (_all, drive: string) => `${drive.toUpperCase()}:`);
    const raw = (await vault.read('projects/private/hochbeet-bauen/project.md')) ?? '';
    expect(raw).toContain(written);
    /* Dieselbe Zuordnung zweimal ergibt keinen zweiten Eintrag. */
    await harness.call('claude:link', { sessionId: unlinked!.id, project: 'hochbeet-bauen' });
    const again = (await vault.read('projects/private/hochbeet-bauen/project.md')) ?? '';
    expect(again.split(written).length - 1).toBe(1);

    const relinked = await harness.call('claude:sessions', {});
    expect(relinked.find((session) => session.id === unlinked!.id)?.vaultProject).toBe(
      'hochbeet-bauen',
    );
  });

  it('sagt bei einer Sitzung oder einem Projekt, das es nicht gibt, dass es keins gibt', async () => {
    await expect(
      harness.call('claude:link', { sessionId: 'gibt-es-nicht', project: 'hochbeet-bauen' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      harness.call('claude:link', { sessionId: 'session-kundenportal', project: 'gibt-es-nicht' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  // ── Benachrichtigung ───────────────────────────────────────────────────────

  it('meldet fällige Erinnerungen einmal und dieselben nicht zweimal am Tag', async () => {
    const { ReminderNotifier } = await import('../../src/main/reminder-notify');
    const shown: { title: string; body: string }[] = [];
    const notifier = new ReminderNotifier(harness.services, {
      notifier: { show: (input) => void shown.push({ title: input.title, body: input.body }) },
      now: () => new Date(NOW),
    });

    expect(await notifier.check()).toBe('sent');
    expect(shown).toHaveLength(1);
    expect(shown[0]!.title).toMatch(/überfällig|fällig/);
    expect(shown[0]!.body.length).toBeGreaterThan(0);

    /* Zweiter Lauf am selben Tag: nichts Neues, also keine zweite Meldung. */
    expect(await notifier.check()).toBe('already-announced');
    expect(shown).toHaveLength(1);

    const state = JSON.parse((await vault.read('.secondbrain/overview.json')) ?? '{}') as {
      announced: Record<string, string>;
    };
    expect(Object.values(state.announced)).toContain(TODAY);
  });

  it('meldet nichts, wenn der Nutzer Benachrichtigungen abgeschaltet hat', async () => {
    const { ReminderNotifier } = await import('../../src/main/reminder-notify');
    await harness.settings.patchVault({ overview: { notifications: false } });
    const shown: string[] = [];
    const notifier = new ReminderNotifier(harness.services, {
      notifier: { show: (input) => void shown.push(input.title) },
      now: () => new Date(NOW),
    });

    expect(await notifier.check()).toBe('off');
    expect(shown).toEqual([]);
    expect(await vault.exists('.secondbrain/overview.json')).toBe(false);
  });

  it('meldet nichts, wenn nichts fällig ist', async () => {
    const { ReminderNotifier } = await import('../../src/main/reminder-notify');
    const shown: string[] = [];
    const notifier = new ReminderNotifier(harness.services, {
      notifier: { show: (input) => void shown.push(input.title) },
      /* Weit vor allen Fristen des Fixture-Vaults. */
      now: () => new Date('2026-01-05T09:00:00+01:00'),
    });

    expect(await notifier.check()).toBe('nothing-due');
    expect(shown).toEqual([]);
  });
});
