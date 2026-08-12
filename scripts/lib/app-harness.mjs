/* Gemeinsame Grundlage von scripts/shot.mjs und scripts/a11y.mjs: die gebaute
   App über Playwrights `_electron` starten und dabei alles mitschreiben, was in
   der Konsole landet. Das Anfahren der Screens liegt daneben in screens.mjs.

   Zwei Eigenheiten von Electron, die hier gelöst sind:
   - ELECTRON_RUN_AS_NODE muss aus der Umgebung raus (VSCode setzt es), sonst
     startet Electron als reiner Node-Prozess und stirbt.
   - Der Vault kommt über `SB_VAULT`; der Hauptprozess zieht die Variable der
     Vault-Historie vor, `SB_DEMO=1` schaltet `app:info.demo`. Zusätzlich läuft
     jeder Lauf in einem eigenen `--user-data-dir` (mit passendem `lastVault`),
     damit die echte Installation des Nutzers unberührt bleibt. */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const MAIN_ENTRY = 'out/main/index.cjs';
const RENDERER_ENTRY = 'out/renderer/index.html';

class HarnessError extends Error {}

/** Deutliche Meldung statt eines Playwright-Stacktraces, wenn der Build fehlt. */
export function ensureBuild() {
  const missing = [MAIN_ENTRY, RENDERER_ENTRY].filter((path) => !existsSync(join(REPO_ROOT, path)));
  if (missing.length > 0) {
    throw new HarnessError(
      `Der Build fehlt (${missing.join(', ')} nicht gefunden).\n` +
        'Erst bauen, dann prüfen:  npm run build',
    );
  }
}

/** Legt den Demo-Vault an, falls er fehlt. Ohne Bestand ist jede Prüfung wertlos. */
export function ensureDemoVault(vaultPath, log = console.log) {
  if (existsSync(join(vaultPath, '.secondbrain/vault.json'))) return vaultPath;
  log(`Demo-Vault fehlt, lege ihn an: ${vaultPath}`);
  const result = spawnSync(
    process.execPath,
    ['scripts/seed-vault.mjs', '--out', vaultPath, '--quiet'],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new HarnessError('npm run seed ist fehlgeschlagen — ohne Demo-Vault keine Prüfung.');
  }
  return vaultPath;
}

/**
 * Eigenes userData-Verzeichnis mit vorbereiteten App-Einstellungen.
 * `vault: null` heißt: kein letzter Vault — die App startet im Onboarding.
 * `recent` füllt die Liste „Zuletzt geöffnet", auch wenn kein Vault offen ist.
 */
export function prepareUserData(dir, { vault, recent, width = 1440, height = 900 }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'settings.json'),
    `${JSON.stringify(
      {
        version: 1,
        lastVault: vault,
        recentVaults: recent ?? (vault ? [vault] : []),
        theme: 'dark',
        uiLanguage: 'de',
        window: { width, height, maximized: false },
        startMinimized: false,
        onboarded: vault !== null,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return dir;
}

/** Sammelt Konsolenmeldungen, Renderer-Ausnahmen und Ausgaben des Hauptprozesses. */
function createLogSink() {
  const entries = [];
  const add = (level, source, text, location = '') => {
    entries.push({ at: new Date().toISOString(), level, source, text, location });
  };
  return {
    entries,
    add,
    get errors() {
      return entries.filter((entry) => entry.level === 'error');
    },
    format() {
      return entries
        .map(
          (entry) =>
            `[${entry.at}] ${entry.level.toUpperCase().padEnd(7)} ${entry.source.padEnd(10)} ${entry.text}${
              entry.location ? `  (${entry.location})` : ''
            }`,
        )
        .join('\n');
    },
  };
}

function watchPage(page, logs, source) {
  page.on('console', (message) => {
    const type = message.type();
    const level = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'info';
    const at = message.location();
    logs.add(level, source, message.text(), at.url ? `${at.url}:${at.lineNumber}` : '');
  });
  page.on('pageerror', (error) => {
    logs.add('error', source, `unbehandelte Ausnahme: ${error.message}`, error.stack ?? '');
  });
  page.on('crash', () => logs.add('error', source, 'Renderer-Prozess abgestürzt'));
}

/**
 * Startet die gebaute App. Der Aufrufer bekommt Fenster, Protokoll und einen
 * `close()`, der auch bei Fehlern aufräumt.
 */
export async function launchApp({ userDataDir, vault, timeout = 60_000 }) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (vault) {
    env.SB_VAULT = vault;
    env.SB_DEMO = '1';
  }

  const logs = createLogSink();
  const app = await _electron.launch({
    args: [join(REPO_ROOT, MAIN_ENTRY), `--user-data-dir=${userDataDir}`],
    cwd: REPO_ROOT,
    env,
    timeout,
  });

  const stderr = app.process().stderr;
  if (stderr) {
    stderr.setEncoding('utf8');
    stderr.on('data', (chunk) => {
      for (const line of String(chunk).split('\n')) {
        /* Der Hauptprozess landet als Hinweis im Protokoll, nicht als Fehler:
           Electron schreibt auch Harmloses nach stderr. */
        if (line.trim().length > 0) logs.add('warn', 'main', line.trim());
      }
    });
  }

  const page = await app.firstWindow({ timeout });
  watchPage(page, logs, 'renderer');
  await page.waitForLoadState('domcontentloaded');

  /* Die Id des Hauptfensters jetzt merken: später kommen weitere Fenster dazu
     (Schnell-Erfassen), und `getAllWindows()[0]` wäre dann nicht mehr eindeutig. */
  const mainWindowId = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.id,
  );

  /* Prüfen, dass Electron unser userData wirklich benutzt — sonst hätte die App
     die echten Einstellungen des Nutzers geladen und der Vault fehlte. */
  const actualUserData = await app.evaluate(({ app: electronApp }) =>
    electronApp.getPath('userData'),
  );
  if (actualUserData.replace(/\\/g, '/') !== userDataDir.replace(/\\/g, '/')) {
    await app.close();
    throw new HarnessError(
      `Electron benutzt ein anderes userData-Verzeichnis (${actualUserData}). ` +
        'Ohne --user-data-dir wäre die Prüfung nicht reproduzierbar — abgebrochen.',
    );
  }

  return {
    app,
    page,
    logs,
    mainWindowId,
    /**
     * Schiebt ein Nebenfenster (Schnell-Erfassen) auf den Hauptbildschirm und
     * setzt seine Größe neu.
     *
     * Nötig, weil das Fenster dort erscheint, wo der Mauszeiger steht: auf einem
     * zweiten Bildschirm mit anderer Skalierung rechnet Windows die Fenstergröße
     * um, und die Aufnahme wäre bei jedem Lauf anders groß.
     */
    moveSecondaryToPrimary: (width, height) =>
      app.evaluate(
        ({ BrowserWindow, screen }, size) => {
          const other = BrowserWindow.getAllWindows().find((window) => window.id !== size.mainId);
          if (!other) return null;
          const area = screen.getPrimaryDisplay().workArea;
          other.setBounds({
            x: Math.round(area.x + (area.width - size.width) / 2),
            y: Math.round(area.y + (area.height - size.height) / 3),
            width: size.width,
            height: size.height,
          });
          return other.getBounds();
        },
        { width, height, mainId: mainWindowId },
      ),
    /** Setzt die Inhaltsfläche des Hauptfensters auf genau diese Größe. */
    resize: (width, height) =>
      app.evaluate(
        ({ BrowserWindow }, size) => {
          const main = BrowserWindow.fromId(size.id);
          main?.setContentSize(size.width, size.height);
        },
        { width, height, id: mainWindowId },
      ),
    close: async () => {
      try {
        await app.close();
      } catch {
        /* Ein bereits beendetes Fenster ist kein Fehler. */
      }
    },
  };
}

export { HarnessError };
