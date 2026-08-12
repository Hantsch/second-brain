#!/usr/bin/env node
/* Startet die gebaute App auf dem Demo-Vault und legt Bildschirmfotos jedes
   Screens nach `.screenshots/`. Damit ist die Oberfläche prüfbar, ohne dass
   jemand die App von Hand startet.

   Aufruf:
     node scripts/shot.mjs [--screens dashboard,projects] [--out dir]
                           [--vault pfad] [--keep-open]

   Voraussetzung: `npm run build`. Fehlt `out/`, sagt das Skript das deutlich.
   Fehlt `.demo-vault/`, legt es ihn selbst an.

   Neben den zehn Rail-Screens entstehen: Befehlspalette offen, Tastaturfokus in
   der Rail, Onboarding ohne Vault, das Schnell-Erfassen-Fenster und ein
   Fehlerzustand. Der Zustand „kein Modell konfiguriert" wird auf dem
   Fragen-Screen geprüft (der Demo-Vault trägt keinen Provider). Was nicht
   erreichbar ist, wird gemeldet, nicht erfunden.

   Was nicht entstand, bleibt nicht als altes Bild liegen: jede geschriebene
   Aufnahme wird mitgezählt, und was am Ende im Ordner steht, ohne in diesem Lauf
   geschrieben worden zu sein, wird auf `*.png.stale` umbenannt. Sonst mischte der
   Ordner zwei Builds, ohne dass man es am Bild sieht. Der Lauf sagt am Ende,
   welche Aufnahmen fehlen.

   Rückgabewert 1, wenn Konsolenfehler oder unbehandelte Renderer-Ausnahmen
   aufgetreten sind. Warnungen zählen nicht. */

import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
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
  NARROW_DEEP_STATES,
  NARROW_SCREENS,
  SCREENS,
  checkScreenList,
  gotoHash,
  gotoScreen,
  screenHeading,
  settle,
} from './lib/screens.mjs';

const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 1152, height: 720 };

/**
 * Zielgröße des Standardgitters im engen Fenster: höchstens zwei Bildschirme.
 *
 * Das Dashboard hat eine Aufgabe („was war, was ansteht, worauf gewartet wird",
 * ARCHITECTURE.md) und beantwortet sie nicht, wenn man dafür sechs Bildschirme
 * rollen muss. Die Zahl ist deshalb geprüft und nicht gemeint: wer eine Kachel
 * ohne Grenze baut oder zu viele einblendet, bekommt hier einen Befund.
 */
const MAX_DASHBOARD_SCREENS = 2;

/* Die Frage, die im Demo-Vault schon beantwortet ist (`scripts/seed/chats.mjs`).
   Der Titel ist der Griff, mit dem die Aufnahme genau diese Runde findet. */
const SEEDED_QUESTION = 'Wie lange leben unsere Access-Token?';

function parseArgs(argv) {
  const options = {
    out: join(REPO_ROOT, '.screenshots'),
    vault: join(REPO_ROOT, '.demo-vault'),
    screens: SCREENS,
    keepOpen: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    const value = inline ?? argv[index + 1];
    const take = () => {
      if (!value) throw new HarnessError(`${flag} braucht einen Wert.`);
      if (inline === undefined) index += 1;
      return value;
    };
    if (flag === '--keep-open') options.keepOpen = true;
    else if (flag === '--out') options.out = join(REPO_ROOT, take());
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

/** So lange wartet eine Aufnahme höchstens, und so oft wird sie versucht. */
const SHOT_TIMEOUT_MS = 10_000;
const SHOT_ATTEMPTS = 3;

/**
 * Eine Aufnahme, notfalls mehrmals.
 *
 * Playwright wartet standardmäßig 30 s auf ein Bild; schlägt es fehl, bleibt die
 * Datei aus dem vorigen Lauf liegen — genau so mischte der Ordner zwei Builds,
 * ohne dass man es am Bild sieht. Kurz warten und wiederholen ist ehrlicher: es
 * entsteht ein Bild, oder der Lauf nennt am Ende die Lücke.
 *
 * Rückgabe: `null` bei Erfolg, sonst der Grund.
 */
async function capture(target, path, timeout) {
  let last = 'unerreichbar';
  for (let attempt = 1; attempt <= SHOT_ATTEMPTS; attempt += 1) {
    try {
      /* `animations: 'disabled'` friert Ein- und Ausblenden ein: zwei Läufe
         desselben Screens sollen dasselbe Bild ergeben. */
      await target.screenshot({ path, animations: 'disabled', timeout });
      return null;
    } catch (error) {
      last = error instanceof Error ? error.message.split('\n')[0] : String(error);
      if (attempt < SHOT_ATTEMPTS) await target.waitForTimeout(400).catch(() => undefined);
    }
  }
  return last;
}

/**
 * Fortlaufend nummerierte Dateinamen: `.screenshots/03-inbox.png`.
 * Das Fenster wird immer mitgegeben — es gibt mehr als eines, und ein falsches
 * Standardfenster wäre ein Bild, das eine Lüge erzählt.
 *
 * `written` sammelt jede geschriebene Datei — daran hängt die Aufräumung am Ende.
 * `missed` sammelt, was nicht entstand, samt Grund.
 */
function createShooter(outDir) {
  let counter = 0;
  const taken = [];
  const written = new Set();
  const missed = [];

  /** Aufnahme unter genau diesem Dateinamen. Gibt den Namen zurück, sonst `null`. */
  const shotAs = async (file, target, timeout = SHOT_TIMEOUT_MS) => {
    const why = await capture(target, join(outDir, file), timeout);
    if (why === null) {
      written.add(file);
      taken.push(file);
      return file;
    }
    missed.push({ file, why });
    return null;
  };

  return {
    taken,
    written,
    missed,
    shotAs,
    /** Nummerierte Aufnahme. Die Nummer zählt auch mit, wenn das Bild ausbleibt. */
    async shot(name, target, timeout = SHOT_TIMEOUT_MS) {
      counter += 1;
      const file = `${String(counter).padStart(2, '0')}-${name}.png`;
      return (await shotAs(file, target, timeout)) ?? `${file} — nicht entstanden`;
    },
  };
}

/**
 * Aufnahmen, die dieser Lauf nicht geschrieben hat, aus dem Weg räumen: sie
 * gehören zu einem älteren Build. Umbenannt statt gelöscht — wer vergleichen
 * will, hat das alte Bild noch, aber niemand hält es mehr für dieses.
 */
function sweepStale(outDir, written) {
  const stale = [];
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.png.stale')) {
      rmSync(join(outDir, entry.name), { force: true });
      continue;
    }
    if (!entry.name.endsWith('.png') || written.has(entry.name)) continue;
    renameSync(join(outDir, entry.name), join(outDir, `${entry.name}.stale`));
    stale.push(entry.name);
  }
  return stale;
}

/**
 * Rollt alles, was rollt, an sein Ende — und sagt, ob sich etwas bewegt hat.
 *
 * Nicht das Fenster rollt, sondern Container: der Inhaltsbereich beim Dashboard,
 * bei den Projekten die beiden Spalten einzeln. `fullPage` hilft deshalb nicht,
 * und ein Bild, das „bis zum Ende gerollt" heißt und dasselbe zeigt wie das
 * vorige, wäre eine Behauptung ohne Deckung. Die Rückgabe entscheidet, ob die
 * Aufnahme überhaupt entsteht.
 */
function scrollAll(page, where) {
  return page.evaluate((target) => {
    let moved = false;
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight - element.clientHeight < 24) continue;
      const overflow = getComputedStyle(element).overflowY;
      if (overflow !== 'auto' && overflow !== 'scroll') continue;
      const before = element.scrollTop;
      element.scrollTop = target === 'end' ? element.scrollHeight : 0;
      if (element.scrollTop !== before) moved = true;
    }
    return moved;
  }, where);
}

const scrollToEnd = (page) => scrollAll(page, 'end');
const scrollToStart = (page) => scrollAll(page, 'start');

/**
 * Zwei frühere Bauformen für das Tagebuch im engen Fenster (1152×720 —
 * schmaler bricht das Layout zuerst) sind verworfen: `position: sticky` auf
 * dem Composer verdeckte Text, Stimmung, Energie und Chips dahinter; ein
 * eigener Deckel-Roller für den Composer schnitt eine Textzeile mittendurch
 * ab, und Feld, „Sagen" sowie Haltungswahl lagen darunter — formal im Baum,
 * praktisch unsichtbar. Die dritte, vorgegebene Bauform trägt zwei Reiter,
 * „Tag" und „Gespräch" (`DayEntry.tsx`): jeder zeigt nur, wozu er da ist, und
 * keine Rollhöhe muss mehr beides gleichzeitig tragen.
 *
 * Dieses Gate prüft deshalb beide Reiter — per `elementFromPoint` bzw.
 * Geometrie, mit einer Meldung, die sagt, WAS verdeckt oder unerreichbar ist
 * und um wie viele Pixel:
 *
 * 1. Reiter „Tag": der Tageseintrag (Stimmung, Energie, Projekt-/
 *    Personen-Chips) ist anklickbar, ungerollt oben in `.sb-journal-main`.
 * 2. Reiter „Tag": mindestens eine Zeile der Tagesliste steht vollständig in
 *    ihrem eigenen Rollbereich, nicht nur angeschnitten (gilt unabhängig vom
 *    Reiter — die Liste liegt außerhalb von `.sb-dayentry` —, geprüft wird
 *    hier, weil der Aufruf ohnehin auf diesem Reiter steht).
 * 3. Reiter „Gespräch": Composer-Feld, Haltungswahl und „Sagen" stehen ohne
 *    Rollen im Fenster — kein zweiter, verschachtelter Roller schneidet dabei
 *    eine Zeile ab.
 */
async function measureJournalDayTab(session) {
  return session.page.evaluate(() => {
    const findings = [];

    // ── Tageseintrag anklickbar (oben, ungerollt) ─────────────────────────
    const moodGroups = [...document.querySelectorAll('.sb-dayentry-levels .sb-mood')];
    const clickTargets = [
      ['Stimmung', moodGroups[0]?.querySelector('.sb-moodstep') ?? null],
      ['Energie', moodGroups[1]?.querySelector('.sb-moodstep') ?? null],
      ['die Projekt-/Personen-Chips', document.querySelector('.sb-dayentry-chips .sb-chip')],
    ];
    for (const [name, el] of clickTargets) {
      if (el === null) continue; // an diesem Tag nicht vorhanden — keine Aussage möglich
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && (hit === el || el.contains(hit))) continue;
      findings.push(
        `${name} (Reiter „Tag") ist nicht anklickbar (getroffen: ${hit?.className || 'nichts'})`,
      );
    }

    // ── Mindestens eine Zeile der Tagesliste vollständig sichtbar ────────
    const list = document.querySelector('.sb-daylist');
    const rows = [...document.querySelectorAll('.sb-dayrow')];
    if (list !== null && rows.length > 0) {
      const listRect = list.getBoundingClientRect();
      const fits = (rect) => rect.top >= listRect.top - 0.5 && rect.bottom <= listRect.bottom + 0.5;
      const complete = rows.some((row) => fits(row.getBoundingClientRect()));
      if (!complete) {
        const first = rows[0].getBoundingClientRect();
        const missingPx = Math.round(first.bottom - listRect.bottom);
        findings.push(
          `Tagesliste: keine der ${rows.length} Zeilen passt vollständig ` +
            `(erste Zeile ${Math.round(first.height)}px hoch, Rollbereich ${Math.round(listRect.height)}px, ` +
            `${missingPx}px fehlen)`,
        );
      }
    }

    return findings;
  });
}

/** Reiter „Gespräch" (siehe `measureJournalDayTab` für den Kontext): Feld,
    Haltungswahl und „Sagen" müssen ohne Rollen im Fenster stehen. */
async function measureJournalTalkTab(session) {
  return session.page.evaluate(() => {
    const findings = [];
    const reachTargets = [
      ['Das Feld', document.querySelector('#sb-journal-field')],
      ['Die Haltungswahl', document.querySelector('.sb-stance-seg')],
      ['„Sagen"', document.querySelector('.sb-composer-action button')],
    ];
    for (const [name, el] of reachTargets) {
      if (el === null) {
        findings.push(`${name} (Reiter „Gespräch") steht nicht im Baum`);
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.bottom > window.innerHeight || rect.top < 0) {
        findings.push(
          `${name} (Reiter „Gespräch") steht bei ${Math.round(rect.top)}–${Math.round(rect.bottom)}px, ` +
            `das Fenster reicht bis ${window.innerHeight}px — ohne Rollen nicht sichtbar`,
        );
        continue;
      }
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && (hit === el || el.contains(hit))) continue;
      findings.push(
        `${name} (Reiter „Gespräch") ist nicht anklickbar (getroffen: ${hit?.className || 'nichts'})`,
      );
    }
    return findings;
  });
}

/**
 * Wie viele Bildschirme hoch ist der Inhalt des Dashboards? Gemessen wird der
 * Rollbereich selbst, nicht das Fenster: gerollt wird im Inhaltsbereich.
 */
async function measureDashboard(session) {
  return session.page.evaluate(() => {
    const box = document.querySelector('.sb-content') ?? document.querySelector('.sb-screen');
    if (box === null) return null;
    const grid = document.querySelector('.sb-tiles');
    return {
      scroll: box.scrollHeight,
      client: box.clientHeight,
      tiles: grid === null ? 0 : grid.querySelectorAll(':scope > .sb-tile').length,
    };
  });
}

/** Ein Vault-Ordner, der wie ein Vault aussieht, aber nicht zu öffnen ist. */
function createBrokenVault(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, '.secondbrain'), { recursive: true });
  writeFileSync(
    join(dir, '.secondbrain/vault.json'),
    `${JSON.stringify({ version: 1, name: 'Kaputter Vault', createdAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
  /* `settings.json` als Ordner: das Schreiben der Vault-Einstellungen scheitert,
     also schlägt `vault:open` fehl — genau der Fehlerzustand, den wir zeigen wollen. */
  mkdirSync(join(dir, '.secondbrain/settings.json'), { recursive: true });
  writeFileSync(join(dir, '.secondbrain/settings.json/belegt.txt'), 'belegt\n', 'utf8');
  return dir;
}

/** Die zehn Rail-Screens, breit — der Kern des Durchlaufs. */
async function shootScreens(session, shooter, screens, log) {
  const rows = [];
  for (const [position, screen] of screens.entries()) {
    const via = await gotoScreen(session.page, screen);
    const heading = await screenHeading(session.page);
    const file = await shooter.shot(screen, session.page);
    rows.push({ screen, via, heading, file });
    log(
      `  ${String(position + 1).padStart(2, ' ')}/${screens.length} ${screen.padEnd(10)} ` +
        `${(heading ?? 'ohne Überschrift').padEnd(24)} über ${via} → ${file}`,
    );
  }
  return rows;
}

/** Dieselben Screens im engen Fenster: hier bricht Layout zuerst. */
async function shootNarrow(session, shooter, screens, log, skipped) {
  const files = [];
  await session.resize(NARROW.width, NARROW.height);
  for (const screen of screens) {
    await gotoScreen(session.page, screen);

    /* Das Tagebuch trägt im engen Fenster zwei Reiter (`DayEntry.tsx`) — die
       Vorgabe beim Betreten hängt davon ab, ob der Tag schon Text hat, ist
       hier also keine verlässliche Grundlage für ein Gate. Der Reiter „Tag"
       wird deshalb ausdrücklich gewählt, bevor die erste Aufnahme entsteht
       und Zusicherung 1 sowie 3 (Tageseintrag anklickbar, eine Zeile der
       Tagesliste vollständig sichtbar) geprüft werden. */
    if (screen === 'journal') {
      const dayTab = session.page.getByRole('tab', { name: 'Tag' });
      if ((await dayTab.count()) > 0) {
        await dayTab.click();
        await settle(session.page);
      }
    }

    const file = `${screen}-narrow.png`;
    files.push(await shooter.shotAs(file, session.page));
    log(`  eng ${NARROW.width}×${NARROW.height}  ${screen.padEnd(10)} → ${file}`);

    /* Composer und „Tag abschließen" waren einmal am unteren Rand der
       Detailspalte verankert — genau die Aktion, die bei 1152 px unter den
       Rand rutschte, ohne dass ein Gate es meldete, und später, geklebt, den
       Tageseintrag selbst verdeckte. Die dritte Bauform trägt dafür zwei
       Reiter; dieses Gate prüft deshalb beide, nicht nur die Kante einer
       Leiste (siehe `measureJournalDayTab`). */
    if (screen === 'journal') {
      const dayFindings = await measureJournalDayTab(session);
      for (const finding of dayFindings) skipped.push(`Tagebuch (eng, Reiter „Tag"): ${finding}`);
      if (dayFindings.length > 0) process.exitCode = 1;

      const talkTab = session.page.getByRole('tab', { name: /Gespräch/ });
      if ((await talkTab.count()) === 0) {
        skipped.push('Tagebuch (eng, Reiter „Gespräch"): der Reiter steht nicht im Baum');
        process.exitCode = 1;
      } else {
        await talkTab.click();
        await settle(session.page);
        files.push(await shooter.shotAs('journal-narrow-talk.png', session.page));
        log(
          `  eng ${NARROW.width}×${NARROW.height}  journal     → journal-narrow-talk.png (Reiter „Gespräch")`,
        );
        const talkFindings = await measureJournalTalkTab(session);
        for (const finding of talkFindings) {
          skipped.push(`Tagebuch (eng, Reiter „Gespräch"): ${finding}`);
        }
        if (talkFindings.length > 0) process.exitCode = 1;
      }
    }

    /* Die Dichte des Dashboards ist eine Zahl, nicht ein Gefühl — und sie wird
       genau dort gemessen, wo der Platz am knappsten ist. */
    if (screen !== 'dashboard') continue;
    const size = await measureDashboard(session);
    if (size === null || size.client === 0) {
      skipped.push('Dashboard-Dichte: der Inhaltsbereich ließ sich nicht messen');
      continue;
    }
    const screensTall = size.scroll / size.client;
    log(
      `  Dichte: ${size.tiles} Kacheln, ${size.scroll} px in ${size.client} px ` +
        `= ${screensTall.toFixed(2)} Bildschirme (Ziel < ${MAX_DASHBOARD_SCREENS.toFixed(1)})`,
    );
    if (screensTall >= MAX_DASHBOARD_SCREENS) {
      skipped.push(
        `Dashboard-Dichte: ${screensTall.toFixed(2)} Bildschirme bei ${NARROW.width}×${NARROW.height} ` +
          `— das Standardgitter muss unter ${MAX_DASHBOARD_SCREENS.toFixed(1)} bleiben`,
      );
      process.exitCode = 1;
    }
  }
  /* Ein Rail-Screen im Leerlauf zeigt keine Detailspalte. Genau die passt bei
     1152 px nicht mehr neben die Liste — deshalb hier und nicht nur breit. */
  for (const id of NARROW_DEEP_STATES) {
    const state = DEEP_STATES.find((entry) => entry.id === id);
    if (state === undefined) {
      skipped.push(`${id}: steht nicht in DEEP_STATES — eng nicht geprüft`);
      continue;
    }
    const ready = await gotoHash(session.page, state.hash, { wait: state.wait });
    const file = `${id}-narrow.png`;
    files.push(await shooter.shotAs(file, session.page));
    /* Und dasselbe bis zum Ende gerollt: im engen Fenster liegt genau hier, was
       sonst unter dem Rand verschwindet. Rollt nichts, entsteht kein zweites
       Bild — sonst stünde derselbe Ausschnitt zweimal da. */
    let end = null;
    if (await scrollToEnd(session.page)) {
      await settle(session.page);
      end = `${id}-narrow-end.png`;
      files.push(await shooter.shotAs(end, session.page));
      await scrollToStart(session.page);
    }
    log(
      `  eng ${NARROW.width}×${NARROW.height}  ${id.padEnd(10)} → ${file}` +
        `${end === null ? ' (rollt nicht)' : `, ${end}`}`,
    );
    if (!ready) skipped.push(`${id} (eng): ${state.wait} erschien nicht`);
  }
  await session.resize(WIDE.width, WIDE.height);
  return files.filter(Boolean);
}

/** Befehlspalette (Ctrl+K) und Schnell-Erfassen-Fenster. */
async function shootOverlays(session, shooter, log, skipped) {
  await gotoScreen(session.page, 'dashboard');
  await session.page.keyboard.press('Control+K');
  const palette = session.page.locator('[role="dialog"]').first();
  try {
    await palette.waitFor({ state: 'visible', timeout: 4000 });
    await session.page.keyboard.type('proj');
    await settle(session.page);
    log(`  Befehlspalette → ${await shooter.shot('command-palette', session.page)}`);
    await session.page.keyboard.press('Escape');
  } catch {
    skipped.push('Befehlspalette: Ctrl+K öffnete keinen Dialog');
  }

  try {
    const [captureWindow] = await Promise.all([
      session.app.waitForEvent('window', { timeout: 8000 }),
      session.page.evaluate(() => window.sb?.invoke('capture:window', { show: true })),
    ]);
    await captureWindow.waitForLoadState('domcontentloaded');
    /* Das Fenster erscheint auf dem Bildschirm des Mauszeigers — für
       vergleichbare Aufnahmen gehört es auf den Hauptbildschirm. */
    await session.moveSecondaryToPrimary(560, 220);
    /* Sichtbar wird es erst bei `ready-to-show`. Vorher liefert `screenshot`
       nichts und lief in die 30-s-Zeitüberschreitung — deshalb wird hier auf die
       Sichtbarkeit gewartet, nicht auf eine geratene halbe Sekunde. */
    const visible = await windowVisible(session);
    if (!visible) skipped.push('Schnell-Erfassen-Fenster: es wurde nicht sichtbar');
    await settle(captureWindow);
    log(`  Schnell-Erfassen → ${await shooter.shot('quick-capture', captureWindow)}`);
    await session.page.evaluate(() => window.sb?.invoke('capture:window', { show: false }));
  } catch (error) {
    skipped.push(`Schnell-Erfassen-Fenster: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Wartet, bis das zweite Fenster wirklich auf dem Schirm ist (`ready-to-show`
 * bzw. `isVisible()`). Gefragt wird der Hauptprozess: der Renderer weiß nicht,
 * ob sein Fenster angezeigt wird, und ein Bild eines unsichtbaren Fensters gibt
 * es nicht — es gibt nur eine Zeitüberschreitung.
 */
function windowVisible(session, timeout = 4000) {
  return session.app.evaluate(
    ({ BrowserWindow }, options) =>
      new Promise((resolve) => {
        const other = BrowserWindow.getAllWindows().find((window) => window.id !== options.mainId);
        if (!other) {
          resolve(false);
          return;
        }
        if (other.isVisible()) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => resolve(other.isVisible()), options.timeout);
        other.once('ready-to-show', () => {
          clearTimeout(timer);
          /* Ein Takt Luft: `ready-to-show` heißt gezeichnet, nicht schon gezeigt. */
          setTimeout(() => resolve(other.isVisible()), 200);
        });
      }),
    { mainId: session.mainWindowId, timeout },
  );
}

/**
 * Das Dashboard in seinen drei Zuständen: das volle Gitter, eine angehobene
 * Kachel im Verschiebemodus und die offene Auswahl der Module.
 *
 * Der Verschiebemodus ist der Zustand, der sonst in keiner Aufnahme steht: er
 * entsteht nur über die Tastatur, und genau daran hängt die Bedienbarkeit des
 * Gitters ohne Maus. Erscheint keine angehobene Kachel, ist das ein Befund.
 *
 * Projekt-Detail und die Todos-Ansicht kommen aus `DEEP_STATES`
 * (`project-detail`, `project-nostep`, `project-todos`) — dieselben Zustände
 * zweimal zu fotografieren wäre Rauschen.
 */
async function shootDashboard(session, shooter, log, skipped) {
  await gotoScreen(session.page, 'dashboard');
  const tiles = session.page.locator('.sb-tiles .sb-tile');
  const shown = await tiles
    .first()
    .waitFor({ state: 'visible', timeout: 6000 })
    .then(
      () => true,
      () => false,
    );
  await settle(session.page);
  log(
    `  Dashboard-Gitter (${await tiles.count()} Module) → ${await shooter.shot('dashboard-grid', session.page)}`,
  );
  if (!shown) {
    skipped.push('Dashboard: es erschien keine Kachel im Gitter');
    return;
  }

  /* Das Gitter ist höher als das Fenster. Ohne diese Aufnahme wäre die untere
     Hälfte der Kacheln in keinem Bild — und ein Knopf unter dem Rand fällt
     niemandem auf. */
  if (await scrollToEnd(session.page)) {
    await settle(session.page);
    log(`  Gitter bis zum Ende → ${await shooter.shot('dashboard-bottom', session.page)}`);
    await scrollToStart(session.page);
  } else {
    skipped.push('Dashboard: das Gitter rollt nicht — die unteren Kacheln blieben ungeprüft');
  }

  const handle = session.page.locator('.sb-tile-handle').first();
  await handle.focus();
  await session.page.keyboard.press('Space');
  const lifted = await session.page
    .locator('.sb-tile--lifted')
    .first()
    .waitFor({ state: 'visible', timeout: 4000 })
    .then(
      () => true,
      () => false,
    );
  await settle(session.page);
  log(`  Verschiebemodus → ${await shooter.shot('dashboard-move', session.page)}`);
  if (!lifted) skipped.push('Dashboard: die Leertaste hob keine Kachel an');
  await session.page.keyboard.press('Escape');

  await session.page.getByRole('button', { name: 'Module', exact: true }).click();
  const dialog = session.page.locator('[role="dialog"] .sb-catalog');
  const open = await dialog.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  await settle(session.page);
  log(`  Auswahl der Module → ${await shooter.shot('dashboard-catalog', session.page)}`);
  if (!open) skipped.push('Dashboard: die Auswahl der Module öffnete nicht');
  else await session.page.keyboard.press('Escape');
}

/**
 * Zustand „kein Modell konfiguriert". Der Demo-Vault trägt bewusst keinen
 * Provider. Der Fragen-Screen bleibt trotzdem benutzbar — das Fragefeld steht da
 * und daneben eine ruhige Hinweiszeile. Genau das soll die Aufnahme belegen;
 * fehlt die Zeile, ist das ein Befund.
 */
async function checkLlmMissing(session, log, skipped) {
  await gotoScreen(session.page, 'ask');
  const note = session.page.getByText('brauchen ein Modell', { exact: false });
  const shown = await note.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  const field = await session.page.locator('#sb-ask-field').count();
  if (shown && field > 0) {
    /* Keine eigene Aufnahme: 04-ask.png zeigt genau diesen Zustand, ein zweites
       Bild derselben Fläche wäre nur Rauschen. */
    log('  Kein Modell konfiguriert → Hinweiszeile plus Fragefeld auf 04-ask.png');
  } else if (!shown) {
    skipped.push('Zustand „kein Modell konfiguriert": der Fragen-Screen zeigte keinen Hinweis');
  } else {
    skipped.push('Fragen-Screen ohne Fragefeld: ohne Modell bleibt nichts Benutzbares');
  }
}

/**
 * Eine echte Frage auf dem Fragen-Screen — der Weg, der ohne Modell funktionieren
 * muss. Der Demo-Vault trägt keinen Provider, also sind die Fundstellen die
 * Antwort: Titel, Zitat, Pfad mit Zeile. Kommt keine Fundstelle, ist das ein
 * Befund, keine Aufnahme.
 */
async function shootAskAnswer(session, shooter, log, skipped) {
  await gotoScreen(session.page, 'ask');
  await session.page.fill('#sb-ask-field', 'Was weiß ich über Token-Lebensdauer?');
  await session.page.locator('.sb-composer-action button').click();
  const cite = session.page.locator('.sb-cite').first();
  const found = await cite.waitFor({ state: 'visible', timeout: 8000 }).then(
    () => true,
    () => false,
  );
  await settle(session.page);
  const file = await shooter.shot('ask-answer', session.page);
  const count = await session.page.locator('.sb-cite').count();
  log(`  Frage ohne Modell → ${file} (${count} Belege)`);
  if (!found) skipped.push('Fragen: die Antwort blieb ohne Fundstelle');
}

/**
 * Ein beantwortetes Gespräch: der Demo-Vault trägt eine Runde mit drei geprüften
 * Belegen (`scripts/seed/chats.mjs`). Genau dieser Zustand — Prosa mit
 * Belegmarken — entsteht nur mit Modell und war deshalb in keiner Aufnahme.
 * Danach ein Klick auf die Marke `[1]`: das Beleg-Panel zeigt die Fundstelle.
 */
async function shootAskAnswered(session, shooter, log, skipped) {
  await gotoScreen(session.page, 'ask');
  /* Nicht „das erste Gespräch": das ist nach `shootAskAnswer` die eben gestellte
     Frage ohne Modell. Gesucht ist die beantwortete Runde aus dem Seed. */
  const thread = session.page
    .locator('.sb-threadlist button', { hasText: SEEDED_QUESTION })
    .first();
  const opened = await thread.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  if (!opened) {
    skipped.push(`Beantwortete Frage: „${SEEDED_QUESTION}" stand nicht im Verlauf`);
    return;
  }
  await thread.click();
  const cites = session.page.locator('.sb-cite').first();
  const shown = await cites.waitFor({ state: 'visible', timeout: 6000 }).then(
    () => true,
    () => false,
  );
  await settle(session.page);
  const count = await session.page.locator('.sb-cite').count();
  log(
    `  Beantwortete Frage → ${await shooter.shot('ask-answered', session.page)} (${count} Belege)`,
  );
  if (!shown) {
    skipped.push('Beantwortete Frage: die Antwort zeigte keine Belege');
    return;
  }

  const mark = session.page.locator('.sb-citemark').first();
  const clickable = await mark.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  if (!clickable) {
    skipped.push('Belegmarke: im Antworttext stand keine Marke');
    return;
  }
  await mark.click();
  const panel = session.page.locator('[role="dialog"] .sb-context').first();
  const open = await panel.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  await settle(session.page);
  if (open) {
    log(`  Beleg-Panel → ${await shooter.shot('ask-citation', session.page)}`);
    await session.page.keyboard.press('Escape');
  } else {
    skipped.push('Beleg-Panel: der Klick auf die Marke öffnete nichts');
  }
}

/**
 * Zwei Aufträge auf dem Quellen-Screen, wie sie im Betrieb nebeneinander stehen:
 * einer wartet auf ein Modell (`awaiting-llm`, der Normalfall ohne Provider),
 * einer läuft noch.
 *
 * Der laufende Auftrag holt von einem Server, der hier im Skript läuft und nie
 * antwortet — kein echtes Netz, und der Zustand steht still, solange die Aufnahme
 * dauert. Danach wird abgebrochen: ein hängender Auftrag gehört nicht in den
 * Demo-Vault.
 */
async function shootSourceJobs(session, shooter, log, skipped) {
  const server = createServer(() => {
    /* Absicht: nie antworten. Der Auftrag bleibt im Zustand „holt". */
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let running = null;

  try {
    await gotoScreen(session.page, 'sources');
    const waiting = await session.page.evaluate(() =>
      window.sb?.invoke('ingest:start', {
        kind: 'text',
        input:
          '# Notiz aus einem Vortrag\n\nWissen verrottet, wenn es nur wächst. Pflege gehört dazu.',
        module: null,
      }),
    );
    running = await session.page.evaluate(
      (target) => window.sb?.invoke('ingest:start', { kind: 'url', input: target, module: null }),
      `http://127.0.0.1:${port}/artikel-ueber-token`,
    );

    const row = session.page.locator('.sb-job').first();
    const shown = await row.waitFor({ state: 'visible', timeout: 6000 }).then(
      () => true,
      () => false,
    );
    /* Warten, bis der wartende Auftrag wirklich wartet — sonst zeigt das Bild
       zwei Aufträge im Zustand „holt" und behauptet damit zu viel. */
    await session.page
      .waitForFunction(() => document.querySelectorAll('.sb-job-notetitle').length > 0, null, {
        timeout: 8000,
      })
      .catch(() => undefined);
    await settle(session.page);
    log(`  Quellen mit Aufträgen → ${await shooter.shot('sources-jobs', session.page)}`);
    if (!shown) skipped.push('Quellen: es erschien kein Auftrag in der Liste');
    if (waiting === undefined || running === undefined) {
      skipped.push('Quellen: ingest:start lieferte keinen Auftrag');
    }
  } finally {
    if (running?.id) {
      await session.page
        .evaluate((id) => window.sb?.invoke('ingest:cancel', { id }), running.id)
        .catch(() => undefined);
    }
    server.close();
  }
}

/** Die offene Rohquelle ist der wichtigste Quellen-Zustand: Von hier muss die
    Verdichtung erreichbar sein, auch nachdem die App neu gestartet wurde. */
async function shootSourceDetail(session, shooter, log, skipped) {
  await gotoScreen(session.page, 'sources');
  const row = session.page.getByRole('button', {
    name: /Details der Quelle Digital Gardening: ein Überblick öffnen/,
  });
  const available = (await row.count()) > 0;
  if (!available) {
    skipped.push('Quellendetail: die unverdichtete Seed-Quelle stand nicht in der Liste');
    return;
  }

  await row.click();
  const dialog = session.page.getByRole('dialog');
  const open = await dialog.waitFor({ state: 'visible', timeout: 4000 }).then(
    () => true,
    () => false,
  );
  await settle(session.page);
  if (!open) {
    skipped.push('Quellendetail: der Klick auf die unverdichtete Quelle öffnete nichts');
    return;
  }

  log(`  Unverdichtete Quelle → ${await shooter.shot('source-detail', session.page)}`);
  await session.resize(NARROW.width, NARROW.height);
  await settle(session.page);
  log(
    `  eng ${NARROW.width}×${NARROW.height}  Quellendetail → ` +
      `${await shooter.shotAs('source-detail-narrow.png', session.page)}`,
  );
  await session.resize(WIDE.width, WIDE.height);
  await session.page.keyboard.press('Escape');
}

/** Zustände, die in der Adresse stehen: Modul-Detail und die Einstellungen-Tabs. */
async function shootDeepStates(session, shooter, log, skipped) {
  for (const state of DEEP_STATES) {
    const ready = await gotoHash(session.page, state.hash, { wait: state.wait });
    if (state.id === 'settings-customization') {
      const background = session.page.locator(
        'input[name="app-background"][value="knowledge-garden"]',
      );
      await background.click();
      await session.page.waitForFunction(
        () =>
          document.querySelector(
            'input[name="app-background"][value="knowledge-garden"]:checked',
          ) !== null,
      );
      await settle(session.page);
    }
    const file = await shooter.shot(state.id, session.page);
    log(`  ${state.id.padEnd(18)} → ${file}${ready ? '' : ' (Inhalt blieb aus)'}`);
    if (!ready) skipped.push(`${state.id}: ${state.wait} erschien nicht`);

    /* Der Verhalten-Tab ist höher als das Fenster, und die untere Hälfte trägt
       genau das, was oft falsch war: Schalter, die etwas behaupten. Ohne diese
       Aufnahme wären Tagebuch und Pflege in keinem Bild. */
    if (state.id === 'settings-behavior') {
      if (await scrollToEnd(session.page)) {
        await settle(session.page);
        log(
          `  ${'behavior bis zum Ende'.padEnd(18)} → ${await shooter.shot('settings-behavior-bottom', session.page)}`,
        );
        await scrollToStart(session.page);
      } else {
        skipped.push(
          'settings-behavior: der Tab rollt nicht — die unteren Schalter blieben ungeprüft',
        );
      }
    }
  }
}

/* Die Seite, an der der Konflikt gezeigt wird — sie ist im Demo-Vault lang genug,
   dass der Speicherknopf unter dem Rand liegt. */
const CONFLICT_PAGE = 'modules/identity-management/wiki/concepts/token-lebensdauer.md';

/**
 * Der Zustand, in dem eine Datei wirklich auf dem Spiel steht: In der App getippt,
 * von außen geschrieben, unten auf „Speichern" geklickt — der Hauptprozess lehnt
 * ab.
 *
 * Genau hier lag die Meldung einmal außerhalb des Sichtfelds (182 px hoch bei
 * `top = -136`), und niemandem fiel es auf, weil der Zustand in keiner Aufnahme
 * stand. Deshalb wird er fotografiert **und** gemessen: liegt die Karte nicht
 * vollständig im Blick, ist das ein Befund.
 *
 * Die fremde Änderung wird danach zurückgenommen — der Demo-Vault soll nach dem
 * Lauf derselbe sein wie vorher.
 */
async function shootPageConflict(session, shooter, log, skipped) {
  const page = session.page;
  const before = await page.evaluate(
    (path) => window.sb?.invoke('vault:read', { path }),
    CONFLICT_PAGE,
  );
  if (!before) {
    skipped.push(`Konflikt beim Speichern: ${CONFLICT_PAGE} gibt es nicht`);
    return;
  }
  try {
    await gotoHash(page, `/modules?m=identity-management&p=${CONFLICT_PAGE}`, { wait: '.sb-md' });
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await page.locator('#sb-page-draft').waitFor({ state: 'visible', timeout: 4000 });
    await page.locator('#sb-page-draft').click();
    /* An das Ende des Entwurfs, nicht dorthin, wo der Klick landete. */
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n\nIn der App getippt, noch nicht gespeichert.');

    /* Von außen schreiben, wie Obsidian oder ein Ingest es tut: derselbe Kanal,
       aber ohne den eingefrorenen Hash des Editors. */
    await page.evaluate(async (path) => {
      const doc = await window.sb?.invoke('vault:read', { path });
      await window.sb?.invoke('vault:write', {
        path,
        body: `${doc.body}\nVon außen angehängt.\n`,
        expectedHash: doc.hash,
      });
    }, CONFLICT_PAGE);

    /* Ans Ende rollen: dort steht der Knopf, den der Nutzer drückt. */
    await scrollToEnd(page);
    await settle(page);
    await page.getByRole('button', { name: 'Speichern' }).click();
    const shown = await page
      .locator('.sb-conflict')
      .first()
      .waitFor({ state: 'visible', timeout: 6000 })
      .then(
        () => true,
        () => false,
      );
    await settle(page);
    const seen = shown ? await measureAlert(page) : null;
    log(
      `  Konflikt beim Speichern → ${await shooter.shot('page-conflict', page)}` +
        (seen === null ? '' : ` (${seen.visible}/${seen.height} px im Blick)`),
    );
    /* Und eng: hier bricht die Fußzeile um, und die Zeile neben dem Knopf hat
       weniger Platz als der Satz lang ist. */
    await session.resize(NARROW.width, NARROW.height);
    await scrollToEnd(page);
    await settle(page);
    const narrow = shown ? await measureAlert(page) : null;
    log(
      `  eng ${NARROW.width}×${NARROW.height}  Konflikt → ` +
        `${await shooter.shotAs('page-conflict-narrow.png', page)}` +
        (narrow === null ? '' : ` (${narrow.visible}/${narrow.height} px im Blick)`),
    );
    await session.resize(WIDE.width, WIDE.height);
    if (!shown) {
      skipped.push('Konflikt beim Speichern: es erschien keine Meldung');
    } else if (seen !== null && seen.visible < seen.height) {
      skipped.push(
        `Konfliktkarte: nur ${seen.visible} von ${seen.height} px im Sichtfeld — ` +
          'wer unten klickt, sieht keine Antwort',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    skipped.push(`Konflikt beim Speichern: ${error instanceof Error ? error.message : error}`);
  } finally {
    /* Entwurf weg, Datei zurück auf den Stand des Seeds. */
    await page.evaluate(
      async (state) => {
        const doc = await window.sb?.invoke('vault:read', { path: state.path });
        if (doc && doc.body !== state.body) {
          await window.sb?.invoke('vault:write', {
            path: state.path,
            body: state.body,
            expectedHash: doc.hash,
          });
        }
      },
      { path: CONFLICT_PAGE, body: before.body },
    );
  }
}

/** Wie viel von der Meldung im Rollbereich steht — in Pixeln, nicht im Gefühl. */
function measureAlert(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.sb-conflict');
    const box = document.querySelector('.sb-content') ?? document.scrollingElement;
    if (card === null || box === null) return null;
    const rect = card.getBoundingClientRect();
    const view = box.getBoundingClientRect();
    return {
      height: Math.round(rect.height),
      visible: Math.round(
        Math.max(0, Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top)),
      ),
    };
  });
}

/**
 * Tastaturfokus auf dem aktiven Rail-Eintrag. Der Fokusring wurde dort schon
 * einmal von der Aktivmarkierung überschrieben; ein Bild davon lässt den
 * Rückfall auffallen.
 */
async function shootRailFocus(session, shooter, log, skipped) {
  await gotoScreen(session.page, 'dashboard');
  const active = '.sb-rail-item[aria-current="page"]';
  /* Genug Schritte, um einmal durch den ganzen Screen zu kommen: das Dashboard
     hat je Kachel einen Griff und ein Menü, dazu die Zeilen. Die Prüfung bleibt
     dieselbe — es gibt einen Tastaturweg zurück in die Rail. */
  let landed = false;
  for (let step = 0; step < 150 && !landed; step += 1) {
    await session.page.keyboard.press('Tab');
    landed = await session.page.evaluate(
      (selector) => document.activeElement?.matches(selector) === true,
      active,
    );
  }
  if (!landed) {
    skipped.push('Tastaturfokus: kein Tab-Weg zum aktiven Rail-Eintrag gefunden');
    return;
  }
  await settle(session.page);
  log(`  Tastaturfokus in der Rail → ${await shooter.shot('rail-focus', session.page)}`);
}

/**
 * Zustände, die einen eigenen Start brauchen: Onboarding ohne Vault und der
 * Fehlerzustand beim Öffnen eines kaputten Vaults.
 */
async function shootColdStates(options, shooter, log, skipped) {
  /* Der kaputte Vault steht im Verlauf, aber nicht als letzter Vault: so
     startet die App im Onboarding und ein Klick auf den Eintrag führt in den
     Fehlerzustand — genau der Weg, den ein Nutzer nimmt. */
  const broken = createBrokenVault(join(options.out, '.fixtures', 'kaputter-vault'));
  const userDataDir = prepareUserData(join(options.out, '.userdata-onboarding'), {
    vault: null,
    recent: [broken],
    ...WIDE,
  });
  const session = await launchApp({ userDataDir, vault: null });
  try {
    await session.resize(WIDE.width, WIDE.height);
    await settle(session.page);
    log(`  Onboarding (kein Vault) → ${await shooter.shot('onboarding', session.page)}`);

    const entry = session.page.locator('.sb-recent-item').first();
    try {
      await entry.waitFor({ state: 'visible', timeout: 4000 });
      await entry.click();
    } catch {
      skipped.push('Fehlerzustand: kein Verlaufseintrag zum Anklicken');
    }
    const errorCard = session.page
      .getByText('Das hat nicht funktioniert', { exact: false })
      .first();
    const shown = await errorCard.waitFor({ state: 'visible', timeout: 6000 }).then(
      () => true,
      () => false,
    );
    await settle(session.page);
    if (shown) {
      log(`  Fehlerzustand → ${await shooter.shot('error-state', session.page)}`);
    } else {
      log(
        `  Fehlerzustand (nicht erschienen) → ${await shooter.shot('error-state-versuch', session.page)}`,
      );
      skipped.push('Fehlerzustand: das Onboarding zeigte keine Fehlerkarte');
    }
    return session.logs;
  } finally {
    await session.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureBuild();
  checkScreenList();
  mkdirSync(options.out, { recursive: true });
  ensureDemoVault(options.vault);

  const log = (line) => console.log(line);
  log(`Screenshots nach ${options.out}`);
  log(`Vault: ${options.vault}`);

  const skipped = [];
  const userDataDir = prepareUserData(join(options.out, '.userdata'), {
    vault: options.vault,
    ...WIDE,
  });
  const session = await launchApp({ userDataDir, vault: options.vault });
  const shooter = createShooter(options.out);
  let coldLogs = null;

  try {
    await session.resize(WIDE.width, WIDE.height);
    await settle(session.page);
    const rows = await shootScreens(session, shooter, options.screens, log);
    await shootOverlays(session, shooter, log, skipped);
    if (options.screens.includes('dashboard')) {
      await shootDashboard(session, shooter, log, skipped);
    }
    /* Bei eingeschränkter Auswahl auch eng nur prüfen, was gewünscht war. */
    const narrow = NARROW_SCREENS.filter((screen) => options.screens.includes(screen));
    await shootNarrow(
      session,
      shooter,
      narrow.length > 0 ? narrow : options.screens.slice(0, 3),
      log,
      skipped,
    );

    await checkLlmMissing(session, log, skipped);
    await shootAskAnswer(session, shooter, log, skipped);
    await shootAskAnswered(session, shooter, log, skipped);
    await shootSourceDetail(session, shooter, log, skipped);
    await shootSourceJobs(session, shooter, log, skipped);
    await shootDeepStates(session, shooter, log, skipped);
    if (options.screens.includes('modules')) {
      await shootPageConflict(session, shooter, log, skipped);
    }
    await shootRailFocus(session, shooter, log, skipped);

    if (options.keepOpen) {
      log('\n--keep-open: das Fenster bleibt offen. Schließen beendet das Skript.');
      await session.app.waitForEvent('close', { timeout: 0 });
    } else {
      coldLogs = await shootColdStates(options, shooter, log, skipped);
    }

    const entries = [...session.logs.entries, ...(coldLogs?.entries ?? [])];
    const errors = entries.filter((entry) => entry.level === 'error');
    const logFile = join(options.out, 'console.log');
    const protocol = [session.logs.format(), coldLogs?.format() ?? ''].filter(Boolean).join('\n');
    writeFileSync(logFile, `${protocol}\n`, 'utf8');

    /* Ein voller Lauf darf aufräumen: dann steht im Ordner genau dieser Build.
       Bei eingeschränkter Auswahl bleibt alles liegen — die anderen Bilder sind
       nicht veraltet, sie waren nur nicht gefragt. */
    const full = options.screens.length === SCREENS.length && !options.keepOpen;
    const stale = full ? sweepStale(options.out, shooter.written) : [];

    log('');
    log(
      `${shooter.taken.length} Aufnahmen, ${rows.length} Rail-Screens, ${entries.length} Meldungen.`,
    );
    log(`Protokoll: ${logFile}`);
    for (const gap of shooter.missed) log(`  fehlt: ${gap.file} — ${gap.why}`);
    if (stale.length > 0) {
      log(`  veraltet, auf *.stale umbenannt: ${stale.join(', ')}`);
    } else if (!full) {
      log('  Teillauf: alte Aufnahmen bleiben liegen, der Ordner mischt zwei Läufe.');
    }
    for (const note of skipped) log(`  übersprungen: ${note}`);
    if (errors.length > 0) {
      log(`\n${errors.length} Fehler in der Konsole:`);
      for (const entry of errors.slice(0, 10)) log(`  ${entry.source}: ${entry.text}`);
      process.exitCode = 1;
    } else {
      log('Keine Konsolenfehler.');
    }
  } finally {
    if (!options.keepOpen) await session.close();
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof HarnessError) console.error(`\n${error.message}`);
  else console.error(error);
  process.exitCode = 1;
}
