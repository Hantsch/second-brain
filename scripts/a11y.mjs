#!/usr/bin/env node
/* Prüft jeden Screen der gebauten App mit axe-core und schreibt einen
   Befundbericht nach `.screenshots/a11y.json`.

   Aufruf:
     node scripts/a11y.mjs [--screens dashboard,projects] [--out dir]
                           [--vault pfad]

   Läuft über dieselbe Playwright-Sitzung wie scripts/shot.mjs (gemeinsame
   Grundlage: scripts/lib/app-harness.mjs), damit „was auf dem Bild steht" und
   „was axe findet" derselbe Zustand sind.

   Rückgabewert 1, sobald ein Verstoß der Stufe `serious` oder `critical`
   auftritt. `minor` und `moderate` stehen im Bericht, brechen aber nichts —
   sonst wird der Schwellwert bedeutungslos. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HarnessError,
  REPO_ROOT,
  ensureBuild,
  ensureDemoVault,
  launchApp,
  prepareUserData,
} from './lib/app-harness.mjs';
import {
  DEEP_STATES,
  SCREENS,
  checkScreenList,
  closeOverlay,
  gotoHash,
  gotoScreen,
  openOverlay,
  settle,
} from './lib/screens.mjs';

const BLOCKING = new Set(['serious', 'critical']);
/** `--sb-hit` aus `src/renderer/index.css` — eine Zahl, hier als Messlatte. */
const HIT_MIN = 32;
const AXE_SOURCE = join(REPO_ROOT, 'node_modules/axe-core/axe.min.js');

function parseArgs(argv) {
  const options = {
    out: join(REPO_ROOT, '.screenshots'),
    vault: join(REPO_ROOT, '.demo-vault'),
    screens: SCREENS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    const value = inline ?? argv[index + 1];
    const take = () => {
      if (!value) throw new HarnessError(`${flag} braucht einen Wert.`);
      if (inline === undefined) index += 1;
      return value;
    };
    if (flag === '--out') options.out = join(REPO_ROOT, take());
    else if (flag === '--vault') options.vault = join(REPO_ROOT, take());
    else if (flag === '--screens') {
      const wanted = take()
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      const unknown = wanted.filter((entry) => !SCREENS.includes(entry));
      if (unknown.length > 0) throw new HarnessError(`Unbekannte Screens: ${unknown.join(', ')}`);
      options.screens = wanted;
    } else throw new HarnessError(`Unbekannte Option: ${flag}`);
  }
  return options;
}

/** axe-core in die Seite legen. Kein Netz, die Datei liegt in node_modules. */
async function injectAxe(page) {
  const already = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (already) return;
  await page.addScriptTag({ content: readFileSync(AXE_SOURCE, 'utf8') });
}

/**
 * Ein Lauf über das ganze Dokument, auf das Wesentliche eingekocht.
 *
 * `target-size` läuft nicht in der Standardauswahl (WCAG 2.2, in axe als
 * „experimental" geführt) — hier ist es ausdrücklich an: „jede interaktive Fläche
 * ≥ 32 px" steht in ARCHITECTURE.md als Pflicht, und eine Pflicht ohne Prüfung
 * kommt zurück. Die Regel misst gegen 24 px (WCAG-Untergrenze); alles darunter
 * ist damit ein Verstoß, der den Lauf bricht.
 */
async function runAxe(page) {
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ['violations'],
      rules: { 'target-size': { enabled: true } },
    });
    return {
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? 'unbekannt',
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.slice(0, 5).map((node) => ({
          target: node.target.join(' '),
          html: node.html.slice(0, 200),
          summary: (node.failureSummary ?? '').split('\n').slice(0, 3).join(' '),
        })),
        nodeCount: violation.nodes.length,
      })),
      passes: result.passes?.length ?? 0,
      incomplete: (result.incomplete ?? []).map((entry) => entry.id),
    };
  });
}

/**
 * Die Meldung mit „Rückgängig" — der einzige Zustand, den kein Screen zeigt und
 * den deshalb bis zuletzt niemand gemessen hat. Genau dort lag der Knopf mit
 * 19 px unter `--sb-hit: 32px`: Gaston gibt dem Textknopf einer Meldung mit
 * `all: unset` keine Höhe, und „Rückgängig" ist die wichtigste Fläche der App.
 *
 * Der Weg dorthin ist eine echte Bedienung (eine Erinnerung zur Ruhe legen) und
 * wird am Ende über denselben Knopf zurückgenommen — der Demo-Vault bleibt, wie er
 * war, und dass das Rückgängig anklickbar ist, ist damit gleich mitgeprüft.
 */
async function shootToast(page) {
  await gotoScreen(page, 'dashboard');
  const snooze = page.locator('.sb-snooze > button').first();
  const reachable = await snooze.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  if (!reachable) return { ok: false, why: 'keine Erinnerung auf dem Dashboard' };
  await snooze.click();
  /* Die Auswahl der Ruhezeiten: der erste Eintrag genügt. */
  const first = page.locator('.sb-snooze-item').first();
  const opened = await first.waitFor({ state: 'visible', timeout: 2000 }).then(
    () => true,
    () => false,
  );
  if (!opened) return { ok: false, why: 'die Auswahl der Ruhezeiten ging nicht auf' };
  await first.click();

  const undo = page.locator('.sb-toasts .gs-toast-action').first();
  const shown = await undo.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  if (!shown) return { ok: false, why: 'es erschien keine Meldung' };
  await settle(page);
  const box = await undo.boundingBox();
  const close = await page.locator('.sb-toasts .gs-toast-x').first().boundingBox();
  return {
    ok: true,
    undoHeight: Math.round(box?.height ?? 0),
    closeHeight: Math.round(close?.height ?? 0),
    /* Zurücknehmen, damit der Demo-Vault nach dem Lauf unverändert ist. */
    revert: async () => {
      await undo.click().catch(() => undefined);
      await settle(page);
    },
  };
}

/**
 * Öffnet einen Dialog, misst seinen Schließen-Knopf (`.gs-dialog-x`) und
 * schließt ihn wieder über Escape (der eigene Fluchtweg, den jeder Dialog
 * ARCHITECTURE.md zufolge haben muss).
 *
 * `.gs-dialog-x` kommt aus einem einzigen vendorierten Satz
 * (`atoms/Dialog.tsx`), den jeder Dialog der App teilt — er stand bisher in
 * keinem Gate, obwohl „target-size scharf" für den Toast schon lief. Genau
 * das erzeugte falsche Sicherheit: der Gate war grün, der Knopf trotzdem zu
 * klein.
 */
async function measureDialogClose(page, open) {
  const opened = await open(page);
  if (!opened) return { ok: false };
  const dialog = page.locator('[role="dialog"]').first();
  const shown = await dialog.waitFor({ state: 'visible', timeout: 6000 }).then(
    () => true,
    () => false,
  );
  if (!shown) return { ok: false };
  await settle(page);
  const close = await dialog.locator('.gs-dialog-x').first().boundingBox();
  return {
    ok: true,
    width: Math.round(close?.width ?? 0),
    height: Math.round(close?.height ?? 0),
    revert: async () => {
      await page.keyboard.press('Escape').catch(() => undefined);
      await settle(page);
    },
  };
}

/* Zu welchem Rail-Screen ein Tiefzustand gehört. Das Präfix der Kennung nennt
   ihn, aber nicht immer unter seinem Namen: `module-*` steht seit Story 002 unter
   „knowledge". Ein Präfix ohne Rail-Screen (`agents` hat keine Kennung in SCREENS)
   wird immer geprüft — lieber einmal zu viel als still ausgelassen. */
const DEEP_STATE_SCREENS = {
  project: 'projects',
  module: 'knowledge',
  knowledge: 'knowledge',
  settings: 'settings',
};

function deepStateScreen(id) {
  return DEEP_STATE_SCREENS[id.split('-')[0]] ?? null;
}

/**
 * Drei stellvertretende Dialoge — genug, weil die Fläche überall dieselbe
 * Klasse trägt: kommt sie zurück, betrifft der Fund alle gleichzeitig, nicht
 * nur den hier gemessenen.
 */
const DIALOG_CASES = [
  {
    id: 'inbox-target-picker',
    screen: 'inbox',
    open: async (page) => {
      await gotoScreen(page, 'inbox');
      const button = page.getByRole('button', { name: 'Anderes Ziel' });
      const ready = await button.waitFor({ state: 'visible', timeout: 6000 }).then(
        () => true,
        () => false,
      );
      if (!ready) return false;
      await button.click();
      return true;
    },
  },
  {
    id: 'journal-close-dialog',
    screen: 'journal',
    open: async (page) => {
      await gotoScreen(page, 'journal');
      const button = page.getByRole('button', { name: 'Tag abschließen' });
      const ready = await button.waitFor({ state: 'visible', timeout: 6000 }).then(
        () => true,
        () => false,
      );
      if (!ready) return false;
      await button.click();
      return true;
    },
  },
  {
    id: 'dashboard-module-catalog',
    screen: 'dashboard',
    open: async (page) => {
      await gotoScreen(page, 'dashboard');
      const button = page.getByRole('button', { name: 'Module', exact: true });
      const ready = await button.waitFor({ state: 'visible', timeout: 6000 }).then(
        () => true,
        () => false,
      );
      if (!ready) return false;
      await button.click();
      return true;
    },
  },
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureBuild();
  checkScreenList();
  mkdirSync(options.out, { recursive: true });
  ensureDemoVault(options.vault);

  const userDataDir = prepareUserData(join(options.out, '.userdata-a11y'), {
    vault: options.vault,
  });
  const session = await launchApp({ userDataDir, vault: options.vault });
  const report = {
    ranAt: new Date().toISOString(),
    vault: options.vault,
    viewport: { width: 1440, height: 900 },
    axeVersion: null,
    screens: [],
  };

  try {
    await session.resize(1440, 900);
    await settle(session.page);
    await injectAxe(session.page);
    report.axeVersion = await session.page.evaluate(() => window.axe.version);
    console.log(`axe-core ${report.axeVersion}, ${options.screens.length} Screens`);

    for (const screen of options.screens) {
      await gotoScreen(session.page, screen);
      /* Nach jedem Routenwechsel neu einhängen: der Hash-Router tauscht nur den
         Inhalt aus, aber ein Neuladen des Fensters würde axe verlieren. */
      await injectAxe(session.page);
      const result = await runAxe(session.page);
      const blocking = result.violations.filter((violation) => BLOCKING.has(violation.impact));
      report.screens.push({ screen, ...result, blockingCount: blocking.length });
      const summary =
        result.violations.length === 0
          ? 'ohne Verstoß'
          : result.violations
              .map((violation) => `${violation.id}[${violation.impact}]×${violation.nodeCount}`)
              .join(', ');
      console.log(`  ${screen.padEnd(10)} ${summary}`);
    }

    /* Zustände hinter einer Adresse: Modul-Detail, Quellen-Reiter und die
       Einstellungen-Tabs. Ein Screen, dessen Hälfte nie geprüft wurde, ist nicht
       geprüft. Bei eingeschränkter Auswahl bleiben sie weg. */
    const wanted = new Set(options.screens);
    for (const state of DEEP_STATES) {
      const owner = deepStateScreen(state.id);
      if (owner !== null && !wanted.has(owner)) continue;
      const ready = await gotoHash(session.page, state.hash, { wait: state.wait });
      await injectAxe(session.page);
      const result = await runAxe(session.page);
      const blocking = result.violations.filter((violation) => BLOCKING.has(violation.impact));
      report.screens.push({ screen: state.id, ...result, blockingCount: blocking.length });
      const summary =
        result.violations.length === 0
          ? 'ohne Verstoß'
          : result.violations
              .map((violation) => `${violation.id}[${violation.impact}]×${violation.nodeCount}`)
              .join(', ');
      console.log(`  ${state.id.padEnd(18)} ${summary}${ready ? '' : ' (Inhalt blieb aus)'}`);
    }

    /* Die Befehlspalette ist ein Dialog und damit der A11y-kritischste Teil der
       Hülle — sie wird wie ein eigener Screen geprüft. */
    await gotoScreen(session.page, 'dashboard');
    await session.page.keyboard.press('Control+K');
    const paletteOpen = await session.page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(
        () => true,
        () => false,
      );
    if (paletteOpen) {
      await settle(session.page);
      await injectAxe(session.page);
      const result = await runAxe(session.page);
      report.screens.push({
        screen: 'command-palette',
        ...result,
        blockingCount: result.violations.filter((violation) => BLOCKING.has(violation.impact))
          .length,
      });
      console.log(
        `  ${'command-palette'.padEnd(10)} ${
          result.violations.length === 0 ? 'ohne Verstoß' : `${result.violations.length} Verstöße`
        }`,
      );
      await session.page.keyboard.press('Escape');
    } else {
      console.log('  command-palette  nicht erreichbar, übersprungen');
    }

    /* Die beiden Overlays der Hülle (Erfassen, Fragen). Seit Story 007 sind sie
       keine Screens mehr und fielen damit aus der Schleife oben heraus — genau
       so entsteht ein Dialog, den niemand misst. Sie stehen unter lesbarer
       Kennung im Bericht, nicht unter einer Nummer, und werden über den Weg des
       Nutzers geöffnet (`openOverlay`). Geht einer nicht auf, sagt der Lauf das,
       statt still nichts zu melden. */
    for (const kind of ['capture', 'ask']) {
      const id = `${kind}-overlay`;
      await gotoScreen(session.page, 'dashboard');
      if (!(await openOverlay(session.page, kind))) {
        console.log(`  ${id.padEnd(18)} nicht erreichbar, übersprungen`);
        continue;
      }
      await injectAxe(session.page);
      const result = await runAxe(session.page);
      report.screens.push({
        screen: id,
        ...result,
        blockingCount: result.violations.filter((violation) => BLOCKING.has(violation.impact))
          .length,
      });
      const summary =
        result.violations.length === 0
          ? 'ohne Verstoß'
          : result.violations
              .map((violation) => `${violation.id}[${violation.impact}]×${violation.nodeCount}`)
              .join(', ');
      console.log(`  ${id.padEnd(18)} ${summary}`);
      await closeOverlay(session.page);
    }

    /* Die Meldung mit „Rückgängig" — nur bei vollem Lauf, sie hängt am Dashboard. */
    if (wanted.has('dashboard')) {
      const toast = await shootToast(session.page);
      if (!toast.ok) {
        console.log(`  toast-undo       nicht erreichbar: ${toast.why}`);
        report.toast = { reached: false, why: toast.why };
      } else {
        await injectAxe(session.page);
        const result = await runAxe(session.page);
        report.screens.push({
          screen: 'toast-undo',
          ...result,
          blockingCount: result.violations.filter((violation) => BLOCKING.has(violation.impact))
            .length,
        });
        report.toast = {
          reached: true,
          undoHeight: toast.undoHeight,
          closeHeight: toast.closeHeight,
        };
        const small = [
          ['Rückgängig', toast.undoHeight],
          ['Schließen', toast.closeHeight],
        ].filter(([, height]) => height < HIT_MIN);
        console.log(
          `  ${'toast-undo'.padEnd(18)} ${
            result.violations.length === 0 ? 'ohne Verstoß' : `${result.violations.length} Verstöße`
          } — Rückgängig ${toast.undoHeight} px, Schließen ${toast.closeHeight} px`,
        );
        if (small.length > 0) {
          for (const [what, height] of small) {
            console.error(
              `  Meldung: „${what}" ist ${height} px hoch, --sb-hit verlangt ${HIT_MIN}.`,
            );
          }
          process.exitCode = 1;
        }
        await toast.revert();
      }
    }

    /* Die Schließen-Knöpfe der Dialoge — jeder trägt dieselbe vendorierte
       Klasse, deshalb reichen drei stellvertretende Öffnungen. */
    report.dialogClose = [];
    for (const dialogCase of DIALOG_CASES) {
      if (!wanted.has(dialogCase.screen)) continue;
      const measured = await measureDialogClose(session.page, dialogCase.open);
      if (!measured.ok) {
        console.log(`  ${dialogCase.id.padEnd(24)} nicht erreichbar`);
        continue;
      }
      await injectAxe(session.page);
      const result = await runAxe(session.page);
      report.screens.push({
        screen: dialogCase.id,
        ...result,
        blockingCount: result.violations.filter((violation) => BLOCKING.has(violation.impact))
          .length,
      });
      report.dialogClose.push({
        id: dialogCase.id,
        width: measured.width,
        height: measured.height,
      });
      console.log(
        `  ${dialogCase.id.padEnd(24)} Schließen ${measured.width}×${measured.height} px`,
      );
      if (measured.width < HIT_MIN || measured.height < HIT_MIN) {
        console.error(
          `  ${dialogCase.id}: „Schließen" ist ${measured.width}×${measured.height} px, ` +
            `--sb-hit verlangt ${HIT_MIN}×${HIT_MIN}.`,
        );
        process.exitCode = 1;
      }
      await measured.revert();
    }

    const file = join(options.out, 'a11y.json');
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const blocking = report.screens.flatMap((entry) =>
      entry.violations
        .filter((violation) => BLOCKING.has(violation.impact))
        .map((violation) => ({ screen: entry.screen, violation })),
    );
    const total = report.screens.reduce((sum, entry) => sum + entry.violations.length, 0);

    /* „incomplete" heißt: axe konnte es nicht entscheiden (typisch bei Kontrast
       über Farbvariablen). Kein Verstoß, aber der einzige Hinweis darauf, dass
       jemand von Hand nachsehen muss. */
    const undecided = [...new Set(report.screens.flatMap((entry) => entry.incomplete))];

    console.log('');
    console.log(
      `${total} Verstöße insgesamt, davon ${blocking.length} blockierend (serious/critical).`,
    );
    if (undecided.length > 0) {
      console.log(`Unentschieden (bitte von Hand prüfen): ${undecided.join(', ')}`);
    }
    console.log(`Bericht: ${file}`);
    if (blocking.length > 0) {
      console.log('');
      for (const { screen, violation } of blocking) {
        console.log(`  ${screen}: ${violation.id} (${violation.impact}) — ${violation.help}`);
        for (const node of violation.nodes) console.log(`      ${node.target}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await session.close();
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof HarnessError) console.error(`\n${error.message}`);
  else console.error(error);
  process.exitCode = 1;
}
