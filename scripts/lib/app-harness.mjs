/* Gemeinsame Grundlage von scripts/shot.mjs und scripts/a11y.mjs: die gebaute
   App über Playwrights `_electron` starten und dabei alles mitschreiben, was in
   der Konsole landet. Das Anfahren der Screens liegt daneben in screens.mjs.

   Zwei Eigenheiten von Electron, die hier gelöst sind:
   - ELECTRON_RUN_AS_NODE muss aus der Umgebung raus (VSCode setzt es), sonst
     startet Electron als reiner Node-Prozess und stirbt.
   - Der Vault kommt über `SB_VAULT`; der Hauptprozess zieht die Variable der
     Vault-Historie vor, `SB_DEMO=1` schaltet `app:info.demo`. Zusätzlich läuft
     jeder Lauf in einem eigenen `--user-data-dir` (mit passendem `lastVault`),
     damit die echte Installation des Nutzers unberührt bleibt.

   A run stays off the desktop and out of the keyboard focus: `SB_UI_HARNESS=1`
   makes the main process place every window left of all displays, unfocusable
   and painted via `showInactive()` (src/main/window-shared.ts). Set
   `SB_UI_VISIBLE=1` to watch a run on screen while debugging. */

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
 *
 * `uiLanguage` defaults to German because the screenshots are German. The e2e
 * suite pins 'en' instead: its assertions read visible labels, and those must
 * not change with whatever language the author happens to prefer.
 */
export function prepareUserData(
  dir,
  {
    vault,
    recent,
    width = 1440,
    height = 900,
    uiLanguage = 'de',
    startMinimized = false,
    closeToTray = true,
  },
) {
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
        uiLanguage,
        window: { width, height, maximized: false },
        startMinimized,
        closeToTray,
        onboarded: vault !== null,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  /* A pre-existing machine scan (035, D1): without this the machine card in
     Settings → Models only ever shows the never-scanned empty state in a
     screenshot, and the reworked populated layout — the three groups, the GB
     field, the slider, the plain-language headline — stays unverified. The
     numbers are plausible fixture values, not a real probe result; that's
     fine, the card never distinguishes "real" from "cached" facts. */
  writeFileSync(
    join(dir, 'machine-scan.json'),
    `${JSON.stringify(
      {
        version: 1,
        scannedAt: new Date().toISOString(),
        facts: {
          totalRamMb: 32768,
          cpuCores: 12,
          platform: 'win32',
          arch: 'x64',
          freeDiskMb: 512000,
          vramMb: 12288,
          gpuName: 'NVIDIA GeForce RTX 4070',
          gpuDetection: 'detected',
        },
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

/* Environment names that look like a provider credential. The main process
   reads none of them today, but an e2e run must not depend on that staying
   true: a spec that reaches a real endpoint because the author's shell exports
   a key is a spec that passes on one machine and bills on another. */
const KEY_ENV_PATTERN =
  /(^|_)(API_)?KEY$|_TOKEN$|_SECRET$|^(ANTHROPIC|OPENAI|OPENROUTER|GROQ|MISTRAL|GEMINI|HUGGINGFACE|HF|CLAUDE)_/i;

/**
 * Startet die gebaute App. Der Aufrufer bekommt Fenster, Protokoll und einen
 * `close()`, der auch bei Fehlern aufräumt.
 *
 * `withoutKeyEnv` strips anything that looks like a provider credential from the
 * child's environment — the e2e suite runs the app with no model reachable.
 * `extraEnv` is merged in last, e.g. to set `SB_E2E_STAGE_DELAY_MS` for a single
 * spec (066, D5) without widening what every other spec's app process sees.
 */
/** Debugging opt-out: the windows of this run appear on screen (still unfocusable). */
const OFFSCREEN = process.env.SB_UI_VISIBLE !== '1';
/** Mirrors `OFFSCREEN_MARGIN` in src/main/window-shared.ts. */
const OFFSCREEN_MARGIN = 100;

export async function launchApp({
  userDataDir,
  vault,
  timeout = 60_000,
  withoutKeyEnv = false,
  extraEnv = {},
}) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (withoutKeyEnv) {
    for (const name of Object.keys(env)) {
      if (KEY_ENV_PATTERN.test(name)) delete env[name];
    }
  }
  env.SB_UI_HARNESS = '1';
  if (vault) {
    env.SB_VAULT = vault;
    env.SB_DEMO = '1';
  }
  Object.assign(env, extraEnv);

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

  /* Das Hauptfenster an seiner Seite erkennen, nicht an der Reihenfolge: später
     kommen weitere Fenster dazu (Schnell-Erfassen), und `getAllWindows()[0]` ist
     dann das zuletzt erzeugte. */
  const mainWindowId = await app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((window) =>
        /\/index\.html(?:[?#]|$)/.test(window.webContents.getURL()),
      )?.id,
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
     * Gibt einem Nebenfenster (Schnell-Erfassen) eine feste Größe und legt es
     * neben das Hauptfenster — außerhalb aller Bildschirme, oder mit
     * `SB_UI_VISIBLE=1` mittig auf den Hauptbildschirm.
     *
     * Nötig, weil das Fenster sonst dort erscheint, wo der Mauszeiger steht: auf
     * einem Bildschirm mit anderer Skalierung rechnet Windows die Größe um, und
     * die Aufnahme wäre bei jedem Lauf anders groß.
     */
    placeSecondary: (width, height) =>
      app.evaluate(
        ({ BrowserWindow, screen }, size) => {
          const other = BrowserWindow.getAllWindows().find((window) => window.id !== size.mainId);
          if (!other) return null;
          const left = Math.min(...screen.getAllDisplays().map((display) => display.bounds.x));
          const area = screen.getPrimaryDisplay().workArea;
          other.setBounds({
            x: size.offscreen
              ? left - size.width - size.margin
              : Math.round(area.x + (area.width - size.width) / 2),
            y: size.offscreen ? 0 : Math.round(area.y + (area.height - size.height) / 3),
            width: size.width,
            height: size.height,
          });
          /* Offscreen on a mixed-DPI desktop the window comes out wider than
             asked; placed by the requested width it would reach back onto a display. */
          if (size.offscreen) other.setPosition(left - other.getSize()[0] - size.margin, 0);
          return other.getBounds();
        },
        { width, height, mainId: mainWindowId, offscreen: OFFSCREEN, margin: OFFSCREEN_MARGIN },
      ),
    /**
     * Setzt die Inhaltsfläche des Hauptfensters auf genau diese Größe — ohne es
     * auf einen Bildschirm zu holen: die Lage außerhalb wird aus der neuen Breite
     * neu berechnet, nie per `center()`.
     *
     * Auf einem Windows-Desktop mit gemischter Skalierung kommt ein rahmenloses
     * Fenster außerhalb der Bildschirme größer heraus als verlangt (gemessen:
     * +16×+8 bei 940×620). Dann wird um die gemessene Abweichung nachgesteuert;
     * die Mindestgröße darf erst wieder greifen, wenn die Verschiebung gelandet
     * ist, sonst klemmt sie sofort zurück.
     */
    resize: (width, height) =>
      app.evaluate(
        async ({ BrowserWindow, screen }, size) => {
          const main = BrowserWindow.fromId(size.id);
          if (!main) return;
          const place = () => {
            if (!size.offscreen) return;
            const left = Math.min(...screen.getAllDisplays().map((display) => display.bounds.x));
            main.setPosition(left - main.getSize()[0] - size.margin, 0);
          };
          main.setContentSize(size.width, size.height);
          place();
          const [actualWidth, actualHeight] = main.getContentSize();
          if (actualWidth === size.width && actualHeight === size.height) return;
          const [minWidth, minHeight] = main.getMinimumSize();
          main.setMinimumSize(1, 1);
          main.setContentSize(
            size.width - (actualWidth - size.width),
            size.height - (actualHeight - size.height),
          );
          place();
          await new Promise((resolve) => setTimeout(resolve, 200));
          main.setMinimumSize(minWidth, minHeight);
        },
        { width, height, id: mainWindowId, offscreen: OFFSCREEN, margin: OFFSCREEN_MARGIN },
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
