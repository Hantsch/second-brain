/* Die drei Agenten-Kanäle im Main-Prozess (Story 001, D10) — an echten
 * Dateien, durch die echten Handler, ohne das echte `~/.claude` oder
 * `~/.codex`.
 *
 * Geprüft wird:
 *   - `agents:projects` gruppiert Sitzungen nach Arbeitsverzeichnis, getrennt
 *     nach CLI, und ordnet über `repos` einem Vault-Projekt zu — für Claude
 *     (über `overview-deps.ts`s `claudeSessions()`) wie für Codex (über die
 *     eigene, hier gebaute Zuordnung auf derselben `linkSessions`-Logik).
 *   - Abgeschaltetes Mitlesen heißt eine leere Liste, nie ein Fehler
 *     (Guardrail 1) — für beide CLIs.
 *   - Ein **eingestelltes** Verzeichnis, das es nicht gibt, ist dagegen ein
 *     Fehler mit dem Pfad darin: das kann nur der Nutzer richten, und eine
 *     leere Liste würde behaupten, die CLI sei nie gelaufen (AC10). Ein
 *     **leerer** Eintrag fällt weiterhin auf den Standardort zurück — fehlt
 *     der, heißt das „nie gelaufen" und bleibt eine leere Liste (AC11).
 *   - `agents:sessions` filtert nach `projectKey` und sortiert neueste zuerst.
 *   - `agents:link` schreibt das Arbeitsverzeichnis eines Agenten-Projekts in
 *     `repos` des Vault-Projekts — für beide CLIs, ohne Doppeleintrag.
 *   - `agents:transcript` liefert eine Seite für eine bekannte Sitzung und
 *     sagt ehrlich „gibt es nicht" für eine unbekannte — für beide CLIs.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { CLAUDE_PROJECTS_DIR } from '../../fixtures';
import { syntheticSession } from '../../core/codex/fixtures';
import { createTempVault } from '../../helpers/vault';
import type { TempVault } from '../../helpers/vault';

/* Electron gibt es im Test nicht: keine Fenster, keine Verschlüsselung. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

/* Dasselbe Arbeitsverzeichnis wie die Claude-Fixture-Sitzung
 * `session-kundenportal` — in `repos` des Fixture-Projekts
 * `kundenportal-relaunch` (tests/fixtures/vault). Eine Codex-Sitzung mit
 * demselben `cwd` beweist, dass die Zuordnung über `repos` für beide CLIs
 * greift, nicht nur für Claude. */
const KUNDENPORTAL_REPO = 'C:/development/demo/kundenportal-web';
const CODEX_LINKED_SESSION = 'aaaaaaaa-0000-1111-2222-333333333333';
const CODEX_UNLINKED_SESSION = 'bbbbbbbb-0000-1111-2222-333333333333';

interface CodexFixture {
  /** Wurzel der `YYYY/MM/DD`-Sitzungen — was `overview.codexSessionsDir` erwartet. */
  root: string;
  cleanup: () => Promise<void>;
}

/** Zwei echte Codex-Verlaufsdateien auf der Platte — eine verknüpfbar, eine nicht. */
async function createCodexFixture(): Promise<CodexFixture> {
  const base = await mkdtemp(join(tmpdir(), 'sb-codex-'));
  const root = join(base, 'sessions');
  const dayDir = join(root, '2026', '08', '12');
  await mkdir(dayDir, { recursive: true });

  await writeFile(
    join(dayDir, `rollout-2026-08-12T09-00-00-${CODEX_LINKED_SESSION}.jsonl`),
    syntheticSession({
      sessionId: CODEX_LINKED_SESSION,
      cwd: KUNDENPORTAL_REPO,
      branch: 'feature/codex-review',
      startedAt: '2026-08-12T09:00:00.000Z',
      lastActivity: '2026-08-12T09:05:00.000Z',
      prompt: 'Review the offer list query.',
      reply: 'Found the slow join, added an index.',
    }),
    'utf8',
  );
  await writeFile(
    join(dayDir, `rollout-2026-08-12T10-00-00-${CODEX_UNLINKED_SESSION}.jsonl`),
    syntheticSession({
      sessionId: CODEX_UNLINKED_SESSION,
      cwd: '/home/user/projects/widget-app',
      startedAt: '2026-08-12T10:00:00.000Z',
      lastActivity: '2026-08-12T10:10:00.000Z',
      prompt: 'Add tax calc.',
      reply: 'Done.',
    }),
    'utf8',
  );

  return { root, cleanup: () => rm(base, { recursive: true, force: true }) };
}

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../../src/main/secrets');
  const { createServices } = await import('../../../src/main/services');
  const { SettingsService } = await import('../../../src/main/settings');
  const { resetExternalTouches } = await import('../../../src/main/claude-touches');
  const { forgetSessions } = await import('../../../src/main/ipc/overview-deps');
  const { agentHandlers, forgetCodexSessions } = await import('../../../src/main/ipc/agents');

  /* Zustand aus einem früheren Test darf nicht überleben: Sitzungspuffer
     hängen am Modul, nicht an den Diensten. */
  forgetSessions();
  forgetCodexSessions();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) =>
    IndexService.open(new FsVaultStore(root), { externalTouches: resetExternalTouches() }),
  );

  const handlers: Handlers = agentHandlers(services);
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

describe('Agenten-Sitzungskanäle im Main (D10)', () => {
  let vault: TempVault;
  let userDataDir: string;
  let codex: CodexFixture;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    codex = await createCodexFixture();
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-agents-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* Die Sitzungen kommen aus den Fixtures, nie aus dem echten ~/.claude
       oder ~/.codex. */
    await harness.settings.patchVault({
      overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR, codexSessionsDir: codex.root },
    });
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await codex.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  // ── agents:projects — Claude ─────────────────────────────────────────────

  it('gruppiert Claude-Sitzungen nach Arbeitsverzeichnis und ordnet über repos zu', async () => {
    const projects = await harness.call('agents:projects', { agent: 'claude' });

    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((project) => project.agent === 'claude')).toBe(true);
    const linked = projects.find((project) => project.vaultProject === 'kundenportal-relaunch');
    expect(linked?.sessionCount).toBe(1);
    /* Die beiden Fixture-Sitzungen `aa11bb22…`/`bb22cc33…` liegen im selben
       Arbeitsverzeichnis (dieses Repo) und zählen deshalb als ein Projekt. */
    const unlinked = projects.find((project) => project.vaultProject === null);
    expect(unlinked?.sessionCount).toBe(2);
  });

  it('liefert für Claude eine leere Liste, wenn das Mitlesen abgeschaltet ist', async () => {
    await harness.settings.patchVault({ overview: { useClaudeSessions: false } });
    expect(await harness.call('agents:projects', { agent: 'claude' })).toEqual([]);
  });

  // ── agents:projects — Codex ──────────────────────────────────────────────

  it('gruppiert Codex-Sitzungen nach Arbeitsverzeichnis und ordnet über repos zu', async () => {
    const projects = await harness.call('agents:projects', { agent: 'codex' });

    expect(projects).toHaveLength(2);
    expect(projects.every((project) => project.agent === 'codex')).toBe(true);
    const linked = projects.find((project) => project.vaultProject === 'kundenportal-relaunch');
    expect(linked?.sessionCount).toBe(1);
    const unlinked = projects.find((project) => project.vaultProject === null);
    expect(unlinked?.sessionCount).toBe(1);
  });

  it('liefert für Codex eine leere Liste, wenn das Mitlesen abgeschaltet ist', async () => {
    await harness.settings.patchVault({ overview: { useCodexSessions: false } });
    expect(await harness.call('agents:projects', { agent: 'codex' })).toEqual([]);
  });

  // ── agents:projects — eingestelltes Verzeichnis fehlt (AC10) ─────────────

  it('sagt mit dem Pfad, dass es das eingestellte Codex-Verzeichnis nicht gibt', async () => {
    const wrong = join(codex.root, 'gibt-es-nicht');
    await harness.settings.patchVault({ overview: { codexSessionsDir: wrong } });

    await expect(harness.call('agents:projects', { agent: 'codex' })).rejects.toMatchObject({
      code: 'not-found',
      detail: { missingDir: wrong },
    });
    /* Derselbe ehrliche Zustand auf dem Sitzungskanal — nicht eine leere Liste,
       die behauptet, das Projekt habe keine Sitzungen. */
    await expect(
      harness.call('agents:sessions', { agent: 'codex', projectKey: 'egal' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('sagt dasselbe für ein eingestelltes Claude-Verzeichnis, das es nicht gibt', async () => {
    const wrong = join(CLAUDE_PROJECTS_DIR, 'gibt-es-nicht');
    await harness.settings.patchVault({ overview: { claudeProjectsDir: wrong } });

    await expect(harness.call('agents:projects', { agent: 'claude' })).rejects.toMatchObject({
      code: 'not-found',
      detail: { missingDir: wrong },
    });
  });

  it('schweigt über den Pfad, wenn das Mitlesen ohnehin abgeschaltet ist', async () => {
    await harness.settings.patchVault({
      overview: { useCodexSessions: false, codexSessionsDir: join(codex.root, 'gibt-es-nicht') },
    });
    /* „Aus" ist die Aussage, die der Screen zeigen soll — nicht ein Pfadfehler
       zu einem Verzeichnis, das niemand liest. */
    expect(await harness.call('agents:projects', { agent: 'codex' })).toEqual([]);
  });

  it('bleibt beim leeren Eintrag eine leere Liste, auch wenn der Standardort fehlt', async () => {
    /* Ohne Eintrag gilt `~/.codex/sessions` bzw. `~/.claude/projects`. Damit der
       Test niemals das echte Heimatverzeichnis des Nutzers liest (QA-Regel),
       zeigt `homedir()` hier auf einen leeren Ordner: der Standardort gibt es
       damit garantiert nicht — und genau das heißt „die CLI ist hier nie
       gelaufen", kein Fehler (AC11). */
    const home = await mkdtemp(join(tmpdir(), 'sb-home-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    try {
      await harness.settings.patchVault({
        overview: { claudeProjectsDir: '', codexSessionsDir: '' },
      });
      expect(await harness.call('agents:projects', { agent: 'codex' })).toEqual([]);
      expect(await harness.call('agents:projects', { agent: 'claude' })).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      await rm(home, { recursive: true, force: true });
    }
  });

  // ── agents:sessions ───────────────────────────────────────────────────────

  it('filtert Claude-Sitzungen nach projectKey und sortiert neueste zuerst', async () => {
    const projects = await harness.call('agents:projects', { agent: 'claude' });
    const unlinked = projects.find((project) => project.vaultProject === null);
    expect(unlinked).toBeDefined();

    const sessions = await harness.call('agents:sessions', {
      agent: 'claude',
      projectKey: unlinked!.key,
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.agent === 'claude')).toBe(true);
    expect(sessions.every((session) => session.projectKey === unlinked!.key)).toBe(true);
    expect(new Date(sessions[0]!.lastActivity).getTime()).toBeGreaterThanOrEqual(
      new Date(sessions[1]!.lastActivity).getTime(),
    );
  });

  it('filtert Codex-Sitzungen nach projectKey', async () => {
    const projects = await harness.call('agents:projects', { agent: 'codex' });
    const linked = projects.find((project) => project.vaultProject === 'kundenportal-relaunch');
    expect(linked).toBeDefined();

    const sessions = await harness.call('agents:sessions', {
      agent: 'codex',
      projectKey: linked!.key,
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(CODEX_LINKED_SESSION);
    /* Codex kennt keine Subagenten — nie erraten, immer `null`. */
    expect(sessions[0]?.subagents).toBeNull();
    expect(sessions[0]?.vaultProject).toBe('kundenportal-relaunch');
  });

  it('liefert für einen unbekannten projectKey eine leere Liste', async () => {
    expect(
      await harness.call('agents:sessions', { agent: 'codex', projectKey: 'gibt-es-nicht' }),
    ).toEqual([]);
  });

  // ── agents:link ───────────────────────────────────────────────────────────

  /** Der Schlüssel des noch keinem Vault-Projekt zugeordneten Projekts. */
  async function unlinkedKey(agent: 'claude' | 'codex'): Promise<string> {
    const projects = await harness.call('agents:projects', { agent });
    const unlinked = projects.find((project) => project.vaultProject === null);
    expect(unlinked).toBeDefined();
    return unlinked!.key;
  }

  const HOCHBEET = 'projects/private/hochbeet-bauen/project.md';

  it('schreibt das Arbeitsverzeichnis eines Claude-Projekts in `repos`', async () => {
    const key = await unlinkedKey('claude');

    await harness.call('agents:link', {
      agent: 'claude',
      projectKey: key,
      project: 'hochbeet-bauen',
    });

    /* Der Pfad steht in der Datei. Die Schreibform selbst (Schrägstriche,
       großer Laufwerksbuchstabe, docs/VAULT-FORMAT.md) prüft
       tests/main/dashboard-ipc.test.ts am gemeinsamen Schreibweg; hier zählt,
       dass es überhaupt derselbe Ordner ist — `key` ist die Vergleichsform. */
    expect(((await vault.read(HOCHBEET)) ?? '').replace(/\\/g, '/').toLowerCase()).toContain(key);

    /* Und die Zuordnung wirkt: das Projekt kennt jetzt sein Vault-Projekt. */
    const again = await harness.call('agents:projects', { agent: 'claude' });
    expect(again.find((project) => project.key === key)?.vaultProject).toBe('hochbeet-bauen');
  });

  it('schreibt auch für ein Codex-Projekt — derselbe Weg, andere CLI', async () => {
    const key = await unlinkedKey('codex');

    await harness.call('agents:link', {
      agent: 'codex',
      projectKey: key,
      project: 'hochbeet-bauen',
    });

    expect((await vault.read(HOCHBEET)) ?? '').toContain('/home/user/projects/widget-app');
    const again = await harness.call('agents:projects', { agent: 'codex' });
    expect(again.find((project) => project.key === key)?.vaultProject).toBe('hochbeet-bauen');
  });

  it('trägt denselben Pfad nicht zweimal ein', async () => {
    const key = await unlinkedKey('codex');
    const request = {
      agent: 'codex' as const,
      projectKey: key,
      project: 'hochbeet-bauen',
    };

    await harness.call('agents:link', request);
    await harness.call('agents:link', request);

    const raw = (await vault.read(HOCHBEET)) ?? '';
    expect(raw.split('/home/user/projects/widget-app').length - 1).toBe(1);
  });

  it('sagt ehrlich, wenn es das Agenten-Projekt oder das Vault-Projekt nicht gibt', async () => {
    await expect(
      harness.call('agents:link', {
        agent: 'codex',
        projectKey: 'c:/gibt-es-nicht',
        project: 'hochbeet-bauen',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });

    await expect(
      harness.call('agents:link', {
        agent: 'codex',
        projectKey: await unlinkedKey('codex'),
        project: 'gibt-es-nicht',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('schreibt nichts, wenn das Mitlesen dieser CLI abgeschaltet ist', async () => {
    const key = await unlinkedKey('codex');
    await harness.settings.patchVault({ overview: { useCodexSessions: false } });

    await expect(
      harness.call('agents:link', {
        agent: 'codex',
        projectKey: key,
        project: 'hochbeet-bauen',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect((await vault.read(HOCHBEET)) ?? '').toContain('repos: []');
  });

  // ── agents:transcript ─────────────────────────────────────────────────────

  it('liefert eine Verlaufsseite für eine bekannte Claude-Sitzung', async () => {
    const page = await harness.call('agents:transcript', {
      agent: 'claude',
      sessionId: 'session-kundenportal',
      projectKey: 'für Claude ohne Bedeutung',
    });

    expect(page.entries.length).toBeGreaterThan(0);
  });

  it('sagt ehrlich, dass es eine unbekannte Claude-Sitzung nicht gibt', async () => {
    await expect(
      harness.call('agents:transcript', {
        agent: 'claude',
        sessionId: 'gibt-es-nicht',
        projectKey: 'egal',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('liefert eine Verlaufsseite für eine bekannte Codex-Sitzung', async () => {
    const page = await harness.call('agents:transcript', {
      agent: 'codex',
      sessionId: CODEX_LINKED_SESSION,
      projectKey: 'für Codex ohne Bedeutung',
    });

    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.entries.some((entry) => entry.text?.includes('offer list'))).toBe(true);
  });

  it('sagt ehrlich, dass es eine unbekannte Codex-Sitzung nicht gibt', async () => {
    await expect(
      harness.call('agents:transcript', {
        agent: 'codex',
        sessionId: 'gibt-es-nicht',
        projectKey: 'egal',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('liest keine Codex-Verlaufsdatei, wenn das Mitlesen abgeschaltet ist', async () => {
    await harness.settings.patchVault({ overview: { useCodexSessions: false } });

    await expect(
      harness.call('agents:transcript', {
        agent: 'codex',
        sessionId: CODEX_LINKED_SESSION,
        projectKey: 'egal',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});
