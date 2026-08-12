/* Navigation und Ruhe: einen Screen anfahren, warten bis er still steht, die
   Screen-Liste gegen den Renderer prüfen. Getrennt von app-harness.mjs, weil das
   Starten der App und das Bedienen der Oberfläche zwei Dinge sind.

   Die Screens stehen hier als Liste, weil ein .mjs-Skript kein TypeScript
   importieren kann; `checkScreenList()` vergleicht sie mit
   src/renderer/lib/screens.ts und meldet Abweichungen. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './app-harness.mjs';

/** Die Rail-Screens in der Reihenfolge aus docs/ARCHITECTURE.md. */
export const SCREENS = [
  'dashboard',
  'capture',
  'inbox',
  'ask',
  'projects',
  'journal',
  'modules',
  'sources',
  'garden',
  'settings',
];

/** Screens, die zusätzlich im engen Fenster geprüft werden: die mit Inhalt. */
export const NARROW_SCREENS = [
  'dashboard',
  'capture',
  'inbox',
  'ask',
  'projects',
  /* Zwei Spalten mit Detailspalte: bei 1152 px steht der Tag über der
     Tagesliste, und Composer samt Abschluss-Knopf sind am unteren Rand der
     Detailspalte verankert (`measureJournalNarrow` in shot.mjs misst das —
     Tageseintrag, Tagesliste und Aktionsleiste je einzeln). */
  'journal',
  /* Die Pflege stellt Widersprüche zweispaltig hin und trägt Vorschauen in Mono:
     bei 1152 px muss beides untereinander passen, ohne dass eine Zeile ausbricht. */
  'garden',
  'settings',
];

/**
 * Zustände, die auch im engen Fenster fotografiert werden. Ein Rail-Screen im
 * Leerlauf verrät nichts über eine Detailspalte, die bei 1152 px neben der Liste
 * nicht mehr passt — und genau dort rutschen Aktionen unter den Rand.
 *
 * Die Kennungen sind Verweise in `DEEP_STATES`; wer dort einen Zustand umbenennt,
 * bekommt hier eine Meldung statt einer stillen Lücke.
 */
export const NARROW_DEEP_STATES = ['project-detail', 'project-todos'];

/**
 * Zustände, die in der Adresse stehen und deshalb ohne Klickweg erreichbar sind:
 * Modul-Detail und die Tabs der Einstellungen. Sie waren bisher in keiner
 * Aufnahme und in keinem axe-Lauf — ein halber Screen ist ein ungeprüfter Screen.
 *
 * `wait` ist ein Selektor, der belegt, dass der Zustand wirklich stand: sonst
 * fotografiert das Skript den Skelettzustand und nennt ihn Ergebnis.
 */
export const DEEP_STATES = [
  {
    id: 'project-detail',
    hash: '/projects?p=orbit-sso-migration',
    wait: '.sb-pdetail .sb-nextstep',
  },
  {
    /* Das Projekt ohne nächsten Schritt: der auffordernde Zustand samt Knopf. */
    id: 'project-nostep',
    hash: '/projects?p=angebot-praxisnetz',
    wait: '.sb-nextstep-missing',
  },
  { id: 'project-todos', hash: '/projects?tab=todos', wait: '.sb-todogroup' },
  {
    id: 'module-page',
    hash: '/modules?m=identity-management&p=modules/identity-management/wiki/concepts/token-lebensdauer.md',
    wait: '.sb-md',
  },
  { id: 'module-graph', hash: '/modules?m=identity-management&tab=graph', wait: '.sb-graph' },
  { id: 'module-log', hash: '/modules?m=identity-management&tab=log', wait: '.sb-log-entry' },
  { id: 'settings-languages', hash: '/settings?tab=languages', wait: '.sb-panel' },
  { id: 'settings-models', hash: '/settings?tab=models', wait: '.sb-panel' },
  { id: 'settings-behavior', hash: '/settings?tab=behavior', wait: '.sb-panel' },
  { id: 'settings-customization', hash: '/settings?tab=customization', wait: '.sb-image-radio' },
  { id: 'settings-about', hash: '/settings?tab=about', wait: '.sb-panel' },
  /* Story 001: the agent session browser has no rail digit (hotkey optional,
     see src/renderer/lib/screens.ts) and is otherwise reachable only by click
     or the command palette — same reasoning as the module tabs above. `.gs-tabs`
     is the Claude/Codex switch, present in every state (loading, off, empty,
     list), so the wait proves the screen rendered regardless of which state
     the reading machine's real `~/.claude`/`~/.codex` happen to be in. */
  { id: 'agents', hash: '/agents', wait: '.gs-tabs' },
];

/**
 * Fährt eine Adresse direkt an (`#/…`) und wartet, bis der Zustand steht.
 * Gibt zurück, ob der Beleg-Selektor erschienen ist — „nicht erschienen" wird
 * gemeldet, nicht stillschweigend fotografiert.
 */
export async function gotoHash(page, hash, { wait = null, timeout = 8000 } = {}) {
  await page.evaluate((target) => {
    window.location.hash = `#${target}`;
  }, hash);
  await page
    .locator('.sb-screen h1')
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => undefined);
  let ready = true;
  if (wait !== null) {
    ready = await page
      .locator(wait)
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(
        () => true,
        () => false,
      );
  }
  await settle(page);
  return ready;
}

/**
 * Wartet, bis der Screen still steht: keine Platzhalter mehr, Schriften geladen,
 * Einblend-Animationen durch, zwei Bilder Ruhe.
 *
 * Die Animationen sind hier kein Schönheitsthema: wer mitten in einem
 * Ein-Ausblenden misst, bekommt gemischte Farben — axe meldet dann
 * Kontrastfehler, die es nicht gibt.
 */
export async function settle(page, { timeout = 8000 } = {}) {
  await page
    .waitForFunction(() => document.querySelectorAll('.sb-skeleton').length === 0, null, {
      timeout,
    })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page
    .evaluate(async () => {
      /* Dauerläufer (Spinner, Puls) laufen nie ab — die würden hier hängen. */
      const running = document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getTiming();
        return timing !== undefined && timing.iterations !== Infinity;
      });
      const done = Promise.all(
        running.map((animation) => animation.finished.catch(() => undefined)),
      );
      await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 2000))]);
    })
    .catch(() => undefined);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
      }),
  );
}

/**
 * Fährt einen Screen an: erst über die Rail (das ist der Weg des Nutzers),
 * bei Bedarf über den Hash. Gibt zurück, welcher Weg genommen wurde.
 */
export async function gotoScreen(page, screen, { timeout = 8000 } = {}) {
  const selector = `.sb-rail a[href="#/${screen}"]`;
  let via = 'rail';
  const link = page.locator(selector).first();
  try {
    await link.waitFor({ state: 'visible', timeout: 3000 });
    await link.click({ timeout: 3000 });
  } catch {
    via = 'hash';
    await page.evaluate((target) => {
      window.location.hash = `#/${target}`;
    }, screen);
  }
  await page
    .waitForFunction((target) => window.location.hash === `#/${target}`, screen, { timeout })
    .catch(() => undefined);
  await page
    .locator('.sb-screen h1')
    .first()
    .waitFor({ state: 'visible', timeout })
    .catch(() => undefined);
  await settle(page);
  return via;
}

/** Titel des aktuellen Screens — für die Zusammenfassung auf der Konsole. */
export async function screenHeading(page) {
  return page
    .locator('.sb-screen h1')
    .first()
    .textContent({ timeout: 2000 })
    .catch(() => null);
}

/** Liest die Screen-Liste des Renderers und meldet Abweichungen zur Liste hier. */
export function checkScreenList(log = console.warn) {
  const file = join(REPO_ROOT, 'src/renderer/lib/screens.ts');
  if (!existsSync(file)) return;
  const source = readFileSync(file, 'utf8');
  const ids = [...source.matchAll(/\n\s*(?:\{\s*)?id:\s*'([a-z-]+)'/g)].map((match) => match[1]);
  const missing = ids.filter((id) => !SCREENS.includes(id));
  const extra = SCREENS.filter((id) => !ids.includes(id));
  if (missing.length > 0 || extra.length > 0) {
    log(
      `Achtung: scripts/lib/screens.mjs kennt andere Screens als src/renderer/lib/screens.ts ` +
        `(fehlt hier: ${missing.join(', ') || '–'}; überzählig: ${extra.join(', ') || '–'}).`,
    );
  }
}
