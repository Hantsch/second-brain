/* Der Überblick von einer Seite zur anderen — an echten Dateien, durch die
 * echten Handler, ohne Netz und ohne das echte `~/.claude`.
 *
 * Die anderen Main-Tests prüfen je einen Bereich. Dieser hier prüft die Naht
 * zwischen ihnen, weil genau dort die Behauptungen entstehen, die niemand
 * einzeln sieht: ein Todo, das die Projekt-Handler anlegen, muss als Erinnerung
 * mit der richtigen Dringlichkeit auftauchen; ein aufgelöstes Warte-auf muss aus
 * dem Dashboard verschwinden; eine Sitzung aus `~/.claude` muss ein Projekt vom
 * Stagnieren befreien.
 *
 * Der Weg, in dieser Reihenfolge:
 *   Projekt anlegen → Todo anlegen → abhaken (`@done:` steht in der Datei)
 *   → Frist setzen → Erinnerung mit richtiger Dringlichkeit
 *   → Warte-auf auflösen → `dashboard:data` ist in sich stimmig
 *   → Anordnung ändern und mit frisch geladenen Diensten wiederkommen.
 *
 * Und der Teil, der von außen kommt: die Fixture-Sitzungen werden gelesen, über
 * `repos` einem Projekt zugeordnet und stehen danach in `recentWork` und in
 * `lastTouch`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { CLAUDE_PROJECTS_DIR } from '../fixtures';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW, TODAY, day, freezeTime } from '../helpers/time';

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

/* Das Arbeitsverzeichnis der Fixture-Sitzung, die zum Arbeitsprojekt gehört —
   in Vergleichsform (`pathKey`): Schrägstriche, alles klein. */
const SESSION_CWD = 'c:/development/demo/kundenportal-web';

/* Dieselbe Sitzung in der Form, die in die Datei geht: Schrägstriche, **großer**
   Laufwerksbuchstabe (docs/VAULT-FORMAT.md, `vaultPath`). Die Anzeigeform schreibt
   ihn klein; landete sie so in `repos`, stünde derselbe Ordner in zwei
   Schreibweisen in der Datei und jeder literale Vergleich hielte sie für zwei. */
const SESSION_REPO = 'C:/development/demo/kundenportal-web';

const WORK = 'projects/work/kundenportal-relaunch/project.md';
const PRIVATE = 'projects/private/hochbeet-bauen/project.md';
const IDLE = 'projects/work/altlast-migration/project.md';

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

/** Dieselbe Verdrahtung wie `src/main/index.ts`, nur ohne Fenster und Watcher. */
async function createHarness(userDataDir: string, vaultRoot: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { resetExternalTouches } = await import('../../src/main/claude-touches');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions } = await import('../../src/main/ipc/overview-deps');
  const { buildHandlers } = await import('../../src/main/ipc/register-all');

  /* Modulzustand aus einem früheren Test darf nicht überleben. */
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

  /* Alle Bereiche zusammen — die Naht ist der Gegenstand dieses Tests. */
  const handlers: Handlers = buildHandlers(services);
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  await services.openVault(vaultRoot);
  /* Die Sitzungen kommen aus den Fixtures, nie aus dem echten ~/.claude. */
  await settings.patchVault({
    overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR, useCodexSessions: false },
  });
  return { services, settings, call };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Überblick über die Bereichsgrenzen', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    /* Fristen, `@done:` und Stagnation hängen am Kalendertag. */
    freezeTime();
    /* Leerer Vault: alles, was hier steht, hat ein Handler geschrieben. */
    vault = await createTempVault();
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-flow-'));
    harness = await createHarness(userDataDir, vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('führt Projekt, Todo, Frist, Warte-auf und Dashboard zu einem stimmigen Bild', async () => {
    // ── Projekt anlegen ──────────────────────────────────────────────────────
    const project = await harness.call('projects:create', {
      title: 'Kundenportal Relaunch',
      scope: 'work',
      status: 'active',
      body: 'Die Angebotsliste ist zu langsam.',
    });
    expect(project.slug).toBe('kundenportal-relaunch');
    expect(project.path).toBe(WORK);
    expect(await vault.exists(WORK)).toBe(true);

    await harness.call('projects:create', { title: 'Hochbeet bauen', scope: 'private' });

    // ── Todo anlegen und abhaken ─────────────────────────────────────────────
    const done = await harness.call('todos:create', {
      text: 'Terraform-State migrieren',
      scope: 'work',
      project: project.slug,
    });
    expect(done.path).toBe(WORK);
    expect(((await vault.read(WORK)) ?? '').includes('- [ ] Terraform-State migrieren')).toBe(true);

    const toggled = await harness.call('todos:toggle', { id: done.id });
    expect(toggled.state).toBe('done');
    /* Der Prüfstein: die Bestätigung sagt „abgehakt", also steht es in der Datei. */
    const afterToggle = (await vault.read(WORK)) ?? '';
    expect(afterToggle).toContain(`- [x] Terraform-State migrieren !! @done:${TODAY}`);

    // ── Frist setzen → Erinnerung mit der richtigen Dringlichkeit ────────────
    const open = await harness.call('todos:create', {
      text: 'Rollen-Mapping dokumentieren',
      scope: 'work',
      project: project.slug,
    });
    expect(open.due).toBeNull();
    /* Vor der Frist mahnt nichts — eine Erinnerung ohne Datum wäre erfunden. */
    expect(
      (await harness.call('reminders:list', undefined)).filter(
        (reminder) => reminder.source === 'todo-due',
      ),
    ).toEqual([]);

    const dated = await harness.call('todos:update', { id: open.id, due: day(2) });
    expect(dated.due).toBe(day(2));
    expect((await vault.read(WORK)) ?? '').toContain(
      `- [ ] Rollen-Mapping dokumentieren !! @due:${day(2)}`,
    );

    /* Zwei Tage Vorlauf sind „bald", eine Frist von gestern ist „überfällig". */
    await harness.call('todos:create', {
      text: 'Testmandant aufsetzen',
      scope: 'work',
      project: project.slug,
      due: day(-1),
    });
    await harness.call('todos:create', {
      text: 'Erde bestellen',
      scope: 'private',
      project: 'hochbeet-bauen',
      due: TODAY,
    });

    const byTitle = new Map(
      (await harness.call('reminders:list', undefined)).map((reminder) => [
        reminder.title,
        reminder,
      ]),
    );
    expect(byTitle.get('Testmandant aufsetzen')?.urgency).toBe('overdue');
    expect(byTitle.get('Erde bestellen')?.urgency).toBe('today');
    expect(byTitle.get('Rollen-Mapping dokumentieren')?.urgency).toBe('soon');
    /* Das abgehakte Todo mahnt nicht mehr. */
    expect(byTitle.has('Terraform-State migrieren')).toBe(false);
    expect(byTitle.get('Erde bestellen')?.scope).toBe('private');

    // ── Warte-auf: erst überfällig, dann aufgelöst ───────────────────────────
    await harness.call('projects:patch', {
      slug: project.slug,
      patch: {
        deadline: day(5),
        waiting_on: [
          { who: 'Jonas', what: 'Freigabe des Rollenkonzepts', since: day(-9), due: day(-2) },
          { who: 'Miriam', what: 'Zugang zum Testmandanten', since: day(-1) },
        ],
      },
    });

    const waiting = (await harness.call('reminders:list', undefined)).filter(
      (reminder) => reminder.source === 'waiting-overdue',
    );
    /* Nur Jonas ist wirklich vorbei; Miriam wartet seit gestern und mahnt nicht. */
    expect(waiting.map((reminder) => reminder.who)).toEqual(['Jonas']);
    expect(waiting[0]?.urgency).toBe('overdue');
    expect(
      (await harness.call('reminders:list', undefined)).find(
        (reminder) => reminder.source === 'project-deadline',
      )?.urgency,
    ).toBe('upcoming');

    const resolved = await harness.call('projects:resolveWaiting', {
      slug: project.slug,
      index: 0,
    });
    expect(resolved.waitingOn.map((entry) => [entry.who, entry.resolved === true])).toEqual([
      ['Jonas', true],
      ['Miriam', false],
    ]);
    expect(
      (await harness.call('reminders:list', undefined)).some(
        (reminder) => reminder.source === 'waiting-overdue',
      ),
    ).toBe(false);

    // ── Ein stagnierendes Projekt, von außen gealtert ────────────────────────
    await harness.call('projects:create', { title: 'Altlast Migration', scope: 'work' });
    await harness.call('projects:patch', {
      slug: 'altlast-migration',
      patch: { status: 'active' },
    });
    await vault.touch(IDLE, -40);
    await harness.call('index:rebuild', undefined);

    // ── Das Dashboard in einem Rutsch ────────────────────────────────────────
    const data = await harness.call('dashboard:data', undefined);

    expect(data.todos.work.map((todo) => todo.text)).toEqual([
      'Testmandant aufsetzen',
      'Rollen-Mapping dokumentieren',
    ]);
    expect(data.todos.private.map((todo) => todo.text)).toEqual(['Erde bestellen']);
    expect(data.waitingOn.map((entry) => entry.who)).toEqual(['Miriam']);
    expect(data.waitingOn[0]?.project).toBe(project.slug);
    expect(data.waitingOn[0]?.path).toBe(WORK);
    expect(data.staleProjects).toEqual(['altlast-migration']);
    expect(data.reminders.some((reminder) => reminder.source === 'stale-project')).toBe(true);
    /* Ohne Pflegelauf keine Zahl: `healthKnown` sagt es, statt eine 100 zu behaupten. */
    expect(data.healthKnown).toBe(false);
    expect(data.health).toBe(0);
    /* Die Liste der Erinnerungen ist dieselbe wie im eigenen Kanal. */
    expect(data.reminders.map((reminder) => reminder.id)).toEqual(
      (await harness.call('reminders:list', undefined)).map((reminder) => reminder.id),
    );
    /* Das Privatprojekt hat ein offenes Todo und stagniert nicht. */
    expect(await vault.exists(PRIVATE)).toBe(true);
  });

  it('liest die Sitzungen, ordnet sie über repos zu und zählt sie als Spur', async () => {
    await harness.call('projects:create', { title: 'Kundenportal Relaunch', scope: 'work' });

    const sessions = await harness.call('claude:sessions', { limit: 10 });
    const session = sessions.find(
      (entry) => entry.cwd.replace(/\\/g, '/').toLowerCase() === SESSION_CWD,
    );
    expect(session, 'die Fixture-Sitzung des Kundenportals').toBeDefined();
    /* Vor dem Verknüpfen gehört sie zu keinem Projekt — das ist die Wahrheit. */
    expect(session?.vaultProject).toBeNull();
    expect(session?.firstPrompt).toContain('Angebotsliste');

    await harness.call('claude:link', {
      sessionId: session?.id ?? '',
      project: 'kundenportal-relaunch',
    });

    /* Die Zuordnung steht in der Datei, wo der Nutzer sie lesen kann. */
    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).toContain('repos:');
    expect(raw).toContain(SESSION_REPO);
    /* Und nicht in der Anzeigeform mit kleinem Laufwerksbuchstaben. */
    expect(raw).not.toContain(SESSION_CWD);

    /* Die Datei wird alt gemacht — `claude:link` hat sie eben selbst geschrieben,
       also wäre sie sonst die jüngere Spur und der Test bewiese nichts. Ohne die
       Sitzung stagniert das Projekt jetzt. */
    await vault.touch(WORK, -21);
    await harness.call('index:rebuild', undefined);
    const before = await harness.call('projects:get', { slug: 'kundenportal-relaunch' });
    expect(before?.project.stale).toBe(true);
    expect(before?.project.lastTouchSource).toBe('file');

    const data = await harness.call('dashboard:data', undefined);
    const linked = data.sessions.find((entry) => entry.id === session?.id);
    expect(linked?.vaultProject).toBe('kundenportal-relaunch');

    /* Die Sitzung steht in „zuletzt gearbeitet" — mit Pfad `null`, weil die
       Verlaufsdatei außerhalb des Vaults liegt. */
    const traces = data.recentWork.filter((item) => item.kind === 'claude-session');
    const trace = traces.find((item) => item.project === 'kundenportal-relaunch');
    expect(trace, 'die verknüpfte Sitzung in „zuletzt gearbeitet"').toBeDefined();
    expect(trace?.path).toBeNull();
    expect(trace?.scope).toBe('work');
    /* Die übrigen Fixture-Sitzungen gehören zu keinem Projekt und behaupten es
       auch nicht. */
    expect(traces.filter((item) => item.project === null).length).toBeGreaterThan(0);

    /* Und sie zählt als Spur: das Projekt stagniert nicht mehr. */
    const after = await harness.call('projects:get', { slug: 'kundenportal-relaunch' });
    expect(after?.project.lastTouchSource).toBe('claude-session');
    expect(after?.project.stale).toBe(false);
    expect(data.staleProjects).not.toContain('kundenportal-relaunch');

    /* Zweimal verknüpfen schreibt nicht zweimal. */
    const once = await vault.read(WORK);
    await harness.call('claude:link', {
      sessionId: session?.id ?? '',
      project: 'kundenportal-relaunch',
    });
    expect(await vault.read(WORK)).toBe(once);
  });

  it('behält die geänderte Anordnung über einen Neustart der Dienste', async () => {
    const start = await harness.call('dashboard:layout', undefined);
    const first = start.tiles[0]?.id;
    const second = start.tiles[1]?.id;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const moved = {
      tiles: [
        { id: second!, size: 'lg' as const },
        { id: first!, size: 'sm' as const },
        ...start.tiles.slice(2),
      ],
      updated: start.updated,
    };
    const saved = await harness.call('dashboard:setLayout', { layout: moved });
    expect(saved.tiles.slice(0, 2).map((tile) => [tile.id, tile.size])).toEqual([
      [second, 'lg'],
      [first, 'sm'],
    ]);
    /* Kein Modul geht verloren, keines kommt doppelt. */
    expect(new Set(saved.tiles.map((tile) => tile.id)).size).toBe(start.tiles.length);

    /* Neu laden heißt: frische Dienste auf demselben Vault. Die Anordnung liegt
       in `.secondbrain/settings.json` und reist mit ihm. */
    await harness.services.closeVault();
    const reloadDir = await mkdtemp(join(tmpdir(), 'sb-userdata-flow2-'));
    const again = await createHarness(reloadDir, vault.root);
    try {
      const back = await again.call('dashboard:layout', undefined);
      expect(back.tiles.slice(0, 2).map((tile) => [tile.id, tile.size])).toEqual([
        [second, 'lg'],
        [first, 'sm'],
      ]);
    } finally {
      await again.services.closeVault();
      await rm(reloadDir, { recursive: true, force: true });
    }
  });
});
