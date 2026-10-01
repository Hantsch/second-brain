/* States that exist for the hit-area floor (`--sb-hit`) rather than for a
   screen: the toast with "Rückgängig" and a dialog's close button. Each one is
   visited once by the screen pass in scripts/verify.mjs. That visit takes the
   picture, axe runs on it through the shooter, and the measurement here comes
   from the same state. */

import { SCREENS, gotoHash, gotoScreen, settle } from './screens.mjs';

const visible = (locator, timeout) =>
  locator.waitFor({ state: 'visible', timeout }).then(
    () => true,
    () => false,
  );

/**
 * Die Meldung mit „Rückgängig" — der einzige Zustand, den kein Screen zeigt und
 * den deshalb lange niemand gemessen hat. Genau dort lag der Knopf mit 19 px
 * unter `--sb-hit: 32px`: Gaston gibt dem Textknopf einer Meldung mit
 * `all: unset` keine Höhe, und „Rückgängig" ist die wichtigste Fläche der App.
 *
 * Der Weg dorthin ist eine echte Bedienung (eine Erinnerung zur Ruhe legen) und
 * wird am Ende über denselben Knopf zurückgenommen — damit ist auch gleich
 * mitgeprüft, dass das Rückgängig anklickbar ist.
 */
export async function shootToastUndo(session, shooter, audit, log, skipped) {
  const { page } = session;
  await gotoScreen(page, 'dashboard');
  const snooze = page.locator('.sb-snooze > button').first();
  if (!(await visible(snooze, 4000))) return miss('keine Erinnerung auf dem Dashboard');
  await snooze.click();
  /* Die Auswahl der Ruhezeiten: der erste Eintrag genügt. */
  const first = page.locator('.sb-snooze-item').first();
  if (!(await visible(first, 2000))) return miss('die Auswahl der Ruhezeiten ging nicht auf');
  await first.click();

  const undo = page.locator('.sb-toasts .gs-toast-action').first();
  if (!(await visible(undo, 4000))) return miss('es erschien keine Meldung');
  await settle(page);
  const undoBox = await undo.boundingBox();
  const closeBox = await page.locator('.sb-toasts .gs-toast-x').first().boundingBox();
  const undoHeight = Math.round(undoBox?.height ?? 0);
  const closeHeight = Math.round(closeBox?.height ?? 0);
  log(
    `  Meldung mit Rückgängig → ${await shooter.shot('toast-undo', page)}` +
      ` — Rückgängig ${undoHeight} px, Schließen ${closeHeight} px`,
  );
  /* Nur die Höhe: ein Textknopf darf breiter sein als hoch, aber nie flacher. */
  audit.measure('toast-undo', 'Rückgängig', audit.hitMin, undoHeight);
  audit.measure('toast-undo', 'Schließen', audit.hitMin, closeHeight);
  await undo.click().catch(() => undefined);
  await settle(page);

  function miss(why) {
    skipped.push(`Meldung mit Rückgängig: ${why}`);
    audit.unreachable('toast-undo', why);
  }
}

/**
 * Stellvertretende Dialoge für den Schließen-Knopf (`.gs-dialog-x`). Er kommt
 * aus einem einzigen vendorierten Satz (`atoms/Dialog.tsx`), den jeder Dialog
 * der App teilt — kommt er zurück, betrifft der Fund alle gleichzeitig.
 *
 * Der Tagesabschluss gehört seit 018 nicht mehr hierher: er ist eine Karte
 * neben dem Tag, kein Dialog, und wird in `shootDayClose` aufgenommen.
 */
const DIALOG_CASES = [
  /* Die Inbox ist heute der Filter „unablegt" in Notizen; die Adresse sagt das. */
  {
    id: 'inbox-target-picker',
    screen: 'notes',
    hash: '/notes?filter=unfiled',
    button: { name: 'Anderes Ziel' },
  },
  {
    id: 'dashboard-module-catalog',
    screen: 'dashboard',
    button: { name: 'Module', exact: true },
  },
];

/* A case naming a screen that no longer exists would be skipped by the filter
   below without a word — exactly how this list lost its inbox case once. */
for (const dialogCase of DIALOG_CASES) {
  if (!SCREENS.includes(dialogCase.screen)) {
    throw new Error(
      `hit-area-states: ${dialogCase.id} names an unknown screen ${dialogCase.screen}`,
    );
  }
}

export async function shootDialogCloses(session, shooter, audit, screens, log, skipped) {
  const { page } = session;
  for (const dialogCase of DIALOG_CASES) {
    if (!screens.includes(dialogCase.screen)) continue;
    if (dialogCase.hash) await gotoHash(page, dialogCase.hash);
    else await gotoScreen(page, dialogCase.screen);
    const button = page.getByRole('button', dialogCase.button).first();
    const dialog = page.locator('[role="dialog"]').first();
    let opened = await visible(button, 6000);
    if (opened) {
      await button.click();
      opened = await visible(dialog, 6000);
    }
    if (!opened) {
      const why = `der Knopf „${dialogCase.button.name}" öffnete keinen Dialog`;
      skipped.push(`${dialogCase.id}: ${why}`);
      audit.unreachable(dialogCase.id, why);
      continue;
    }
    await settle(page);
    const box = await dialog.locator('.gs-dialog-x').first().boundingBox();
    const width = Math.round(box?.width ?? 0);
    const height = Math.round(box?.height ?? 0);
    log(
      `  ${dialogCase.id} → ${await shooter.shot(dialogCase.id, page)} — Schließen ${width}×${height} px`,
    );
    audit.measure(dialogCase.id, 'Schließen', width, height);
    /* Escape ist der eigene Fluchtweg, den jeder Dialog haben muss. */
    await page.keyboard.press('Escape').catch(() => undefined);
    await settle(page);
  }
}
