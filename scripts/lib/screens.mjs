/* Navigation und Ruhe: einen Screen anfahren, warten bis er still steht, die
   Screen-Liste gegen den Renderer prüfen. Getrennt von app-harness.mjs, weil das
   Starten der App und das Bedienen der Oberfläche zwei Dinge sind.

   Die Screens stehen hier als Liste, weil ein .mjs-Skript kein TypeScript
   importieren kann; `checkScreenList()` vergleicht sie mit
   src/renderer/lib/screens.ts und meldet Abweichungen. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './app-harness.mjs';

/** Die Rail-Screens in der Reihenfolge aus docs/ARCHITECTURE.md.
    Erfassen und Fragen stehen seit Story 007 nicht mehr darin: sie sind keine
    Screens mehr, sondern Overlays über dem laufenden Screen (`openOverlay`).
    Inbox ist seit Story 006 kein eigener Rail-Eintrag mehr: was dort stand, ist
    jetzt der Unerledigt-Filter von Notizen — ein Tiefzustand in `DEEP_STATES`
    (`notes-unfiled`), keine eigene Zeile hier. */
export const SCREENS = [
  'dashboard',
  /* The history of asked questions, directly under the dashboard. */
  'chats',
  'projects',
  'notes',
  'journal',
  'knowledge',
  /* 072, D1: sits directly above maintenance in the rail's system group. */
  'tasks',
  'garden',
  'settings',
];

/** Screens, die zusätzlich im engen Fenster geprüft werden: die mit Inhalt.
    Die beiden Overlays gehören hier nicht hinein — sie sind keine Rail-Screens.
    Eng geprüft werden sie trotzdem, ausdrücklich und unter eigenem Namen
    (`shootOverlaysNarrow` in verify.mjs). */
export const NARROW_SCREENS = [
  'dashboard',
  'projects',
  /* Die Fußzeile des Composers (Zielauswahl, Tastenhinweis, Speichern-Knopf)
     steht in einer Flex-Zeile mit `flex-wrap: wrap` (`sb-notecompose-foot` in
     notes.css) — bei 1152 px ist zu prüfen, dass sie sauber umbricht statt
     etwas zu überlappen, und dass der Regelsatz (`sb-notes-rule`) darüber
     nicht ausbricht. */
  'notes',
  /* Zwei Spalten mit Detailspalte: bei 1152 px steht der Tag über der
     Tagesliste, und Composer samt Abschluss-Knopf sind am unteren Rand der
     Detailspalte verankert (`measureJournalNarrow` in verify.mjs misst das —
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
export const NARROW_DEEP_STATES = ['project-detail', 'project-todos', 'notes-unfiled'];

/**
 * Zustände, die in der Adresse stehen und deshalb ohne Klickweg erreichbar sind:
 * Modul-Detail, der Quellen-Reiter und die Tabs der Einstellungen. Sie waren
 * bisher in keiner Aufnahme und in keinem axe-Lauf — ein halber Screen ist ein
 * ungeprüfter Screen.
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
    /* Story 006: Inbox ist kein eigener Rail-Screen mehr, sondern der
       Unerledigt-Filter von Notizen (`#/notes?filter=unfiled`) — ohne diesen
       Zustand wäre die zweispaltige Ablage-Werkbank in keinem Bild mehr.
       `.sb-inbox` steht in jedem gefüllten Zustand der Werkbank (Liste plus
       Detailspalte) und belegt damit, dass sie wirklich stand. */
    id: 'notes-unfiled',
    hash: '/notes?filter=unfiled',
    wait: '.sb-inbox',
  },
  {
    /* Story 038, D9: the condensed tab of an area, opened straight from the
       address (`?a=<slug>&tab=condensed`, NotesScreen.tsx). `gesundheit` is
       the area the seed condensed (scripts/seed/projects.mjs), so this shows
       a real artifact, not an empty state. `.sb-condensed-artifact` only
       renders once the existing digest has loaded — the proof that this is
       the artifact, not the skeleton (AreaCondensedTab.tsx). */
    id: 'notes-condensed',
    hash: '/notes?a=gesundheit&tab=condensed',
    wait: '.sb-condensed-artifact',
  },
  {
    /* Story 045, D5: the knowledge tab of a project, opened straight from the
       address (`?p=<slug>&tab=knowledge`, ProjectDetail.tsx). `orbit-sso-migration`
       is the project the seed condensed (scripts/seed/projects.mjs), so this shows
       a real artifact, not an empty state — the same reasoning as `notes-condensed`
       above, one level down. `.sb-condensed-artifact` only renders once the
       existing digest has loaded (CondensedUnitPanel.tsx, shared with the area). */
    id: 'project-knowledge',
    hash: '/projects?p=orbit-sso-migration&tab=knowledge',
    wait: '.sb-condensed-artifact',
  },
  {
    id: 'module-page',
    hash: '/knowledge?m=identity-management&p=modules/identity-management/wiki/concepts/token-lebensdauer.md',
    wait: '.sb-md',
  },
  { id: 'module-graph', hash: '/knowledge?m=identity-management&tab=graph', wait: '.sb-graph' },
  { id: 'module-log', hash: '/knowledge?m=identity-management&tab=log', wait: '.sb-log-entry' },
  {
    /* Story 002: Die Quellen sind ein Reiter von Wissen und haben keine eigene
       Rail-Kachel mehr — ohne diesen Zustand wäre die Werkbank in keinem Bild.
       `.sb-sourceinput` steht in jedem Zustand des Reiters (Liste leer, Liste
       voll, Fehler) und belegt damit, dass der Reiter wirklich stand. */
    id: 'knowledge-sources',
    hash: '/knowledge?tab=sources',
    wait: '.sb-sourceinput',
  },
  { id: 'settings-languages', hash: '/settings?tab=languages', wait: '.sb-panel' },
  { id: 'settings-models', hash: '/settings?tab=models', wait: '.sb-panel' },
  { id: 'settings-behavior', hash: '/settings?tab=behavior', wait: '.sb-panel' },
  { id: 'settings-customization', hash: '/settings?tab=customization', wait: '.sb-image-radio' },
  { id: 'settings-agent', hash: '/settings?tab=agent', wait: '.sb-panel' },
  { id: 'settings-about', hash: '/settings?tab=about', wait: '.sb-panel' },
  /* Story 008: Der Sitzungsbrowser ist kein eigener Screen mehr, sondern hängt
     unter Projekte (`/projects/sessions`) — ohne Rail-Ziffer, erreichbar über
     die Kachel auf dem Dashboard und die Befehlspalette. `.gs-tabs` ist die
     Claude/Codex-Umschaltung. Seit Story 025 pinnt der Seed sowohl
     `overview.claudeProjectsDir` als auch `overview.codexSessionsDir` auf
     Demo-Verzeichnisse in `.demo-vault/` und legt für beide echte Demo-
     Sitzungen an (scripts/seed/claude.mjs, scripts/seed/codex.mjs); der
     Screenshot zeigt also in beiden Reitern echte Demo-Sitzungen, nie den
     echten Inhalt von `~/.claude`/`~/.codex` auf der aufnehmenden Maschine. */
  { id: 'agents', hash: '/projects/sessions', wait: '.gs-tabs' },
  {
    /* Story 008: derselbe Stoff je Projekt — der Sitzungen-Reiter im
       Projektdetail. `orbit-sso-migration` führt in `repos`
       `C:/development/demo/orbit-sso-infra`, wofür scripts/seed/claude.mjs
       echte Sitzungen anlegt: der Reiter wird also angeboten und ist nicht leer.
       `.sb-trace` ist die Arbeitsspur oben im Reiter — sie steht in jedem
       Zustand (lädt, Fehler, aus, ohne Verknüpfung, Liste, Transkript), weil
       sie aus dem Index kommt und kein Sitzungs-Lesen sie kippen kann. Ein
       Selektor aus der Liste würde nur den Glücksfall belegen; `.gs-tabs`
       wäre kein Beleg, weil schon die Reiterleiste des Projekts so heißt. */
    id: 'project-sessions',
    hash: '/projects?p=orbit-sso-migration&tab=sessions',
    wait: '.sb-trace',
  },
  {
    /* Story 059, D4: the generic reading view — the fallback `homeOf()` gives
       any document with no dedicated home. `module.md` is exactly that case
       (see `docs/VAULT-FORMAT.md` and `tests/renderer/doc-home.test.ts`'s own
       fallback example): real frontmatter (`type: note`, a description) but
       no page view of its own. `.sb-pageview` only stands once the document
       has actually loaded, never on the loading skeleton. */
    id: 'reader',
    hash: '/read?path=modules%2Fidentity-management%2Fmodule.md',
    wait: '.sb-pageview',
  },
  {
    /* Story 059, D5: the full search result view — a route, not a rail
       entry, reached straight from its own address. 'Rollenkonzept' is a
       term the seed vault uses across multiple document kinds (project,
       condensed project, wiki), so this shows real snippets, not an empty
       result list. `.sb-searchresults` only renders once hits actually
       came back, never on the loading skeleton. */
    id: 'search-results',
    hash: '/search?q=Rollenkonzept',
    wait: '.sb-searchresults',
  },
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

/* Was belegt, dass ein Overlay wirklich steht: das Feld darin, nicht der
   Rahmen. Der Rahmen ist schon da, während der Inhalt noch lädt — und ein Bild
   davon wäre ein Skelett, das sich für ein Ergebnis ausgibt. */
const OVERLAY_PROOF = {
  capture: '.gs-scrim .sb-overlay #sb-capture-field',
  ask: '.gs-scrim .sb-overlay--wide #sb-ask-field',
};

/**
 * Öffnet eines der beiden Shell-Overlays — auf dem Weg des Nutzers.
 *
 * `capture`: der Knopf in der Titelleiste. Er ist die eine sichtbare Fläche,
 *   die das Erfassen von jedem Screen aus öffnet (`TitleBar.tsx`, aria-label
 *   `titlebar.captureAria`). Der Selektor greift ihn als direktes Kind der
 *   Kopfzeile — die Fensterknöpfe daneben liegen in einem eigenen `div`.
 * `ask`: dafür gibt es bewusst keinen zweiten Knopf. Fragen ist der zweite
 *   Modus hinter Ctrl+K, also gibt es hier zwei Wege:
 *   - mit `question` der echte Nutzerweg: Ctrl+K, `Tab` in den Frage-Modus,
 *     tippen, Enter. Die Frage geht damit gleich raus, so wie beim Nutzer auch.
 *   - ohne `question` die unterstützte Adresse `#/ask`. Sie öffnet das leere
 *     Overlay und ersetzt die Adresse sofort durch `/dashboard`; das Overlay
 *     liegt danach über dem Dashboard.
 *
 * Reihenfolge ist Pflicht: erst den Screen anfahren, dann das Overlay öffnen.
 * Ein Wechsel des Pfads schließt jedes offene Overlay (`lib/shell-overlays.tsx`).
 *
 * Rückgabe: ob das Overlay wirklich stand. „Nicht erschienen" wird gemeldet,
 * nicht stillschweigend fotografiert.
 */
export async function openOverlay(page, kind, { question = null, timeout = 8000 } = {}) {
  const proof = OVERLAY_PROOF[kind];
  if (proof === undefined) throw new Error(`Unbekanntes Overlay: ${kind}`);

  if (kind === 'capture') {
    const button = page.locator('header.sb-titlebar > button.sb-no-drag').first();
    const there = await button.waitFor({ state: 'visible', timeout: 4000 }).then(
      () => true,
      () => false,
    );
    if (!there) return false;
    await button.click();
  } else if (question !== null) {
    await page.keyboard.press('Control+K');
    const field = page.locator('.sb-palette input').first();
    const open = await field.waitFor({ state: 'visible', timeout: 4000 }).then(
      () => true,
      () => false,
    );
    if (!open) return false;
    /* Der Fokus steht im Feld (`autoFocus`), und nur dort schaltet `Tab` den
       Modus um — genau die Bedingung aus `CommandPalette.tsx`. */
    await page.keyboard.press('Tab');
    const asking = await page
      .locator('.sb-palette--ask')
      .first()
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(
        () => true,
        () => false,
      );
    if (!asking) {
      await page.keyboard.press('Escape');
      return false;
    }
    await page.keyboard.type(question);
    await page.keyboard.press('Enter');
  } else {
    await page.evaluate(() => {
      window.location.hash = '#/ask';
    });
  }

  const ready = await page
    .locator(proof)
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(
      () => true,
      () => false,
    );
  await settle(page);
  return ready;
}

/**
 * Schließt, was gerade über dem Screen liegt, und wartet, bis der Vorhang weg
 * ist. Ohne das läge `.gs-scrim` über der Rail, und der nächste Klick auf einen
 * Rail-Screen liefe in die Zeitüberschreitung statt in den Screen.
 *
 * Mehrere Versuche, weil sich Vorhänge stapeln: das Beleg-Panel liegt im
 * Fragen-Overlay, und jedes Escape schließt nur den obersten.
 */
export async function closeOverlay(page, { timeout = 4000 } = {}) {
  const count = () => page.locator('.gs-scrim').count();
  for (let attempt = 0; attempt < 3 && (await count()) > 0; attempt += 1) {
    await page.keyboard.press('Escape');
    await page
      .waitForFunction(() => document.querySelectorAll('.gs-scrim').length === 0, null, { timeout })
      .catch(() => undefined);
  }
  const clear = (await count()) === 0;
  await settle(page);
  return clear;
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
  /* Geprüft ist ein Screen auch dann, wenn er nicht über die Rail angefahren
     wird: der Quellen-Reiter (`knowledge-sources`) hat keine eigene Kachel und
     steht deshalb als Tiefzustand in DEEP_STATES. Ihn hier zusätzlich in
     SCREENS zu führen hieße, ihn zweimal zu fotografieren — die Vereinigung
     beider Listen ist die ehrliche Messlatte. */
  const covered = new Set([...SCREENS, ...DEEP_STATES.map((state) => state.id)]);
  const missing = ids.filter((id) => !covered.has(id));
  const extra = SCREENS.filter((id) => !ids.includes(id));
  if (missing.length > 0 || extra.length > 0) {
    log(
      `Achtung: scripts/lib/screens.mjs kennt andere Screens als src/renderer/lib/screens.ts ` +
        `(fehlt hier: ${missing.join(', ') || '–'}; überzählig: ${extra.join(', ') || '–'}).`,
    );
  }
}
