# e2e conventions

## `test.step` naming

Every action inside a spec goes through

```ts
await test.step('<flow> — <step>', async () => {
  /* ... */
});
```

`<flow>` is the scenario the test tells (e.g. "vault isolation"), `<step>` is
what that particular step proves within it (e.g. "settings shows the open
vault path"). Playwright prints the step name in the run log and in the HTML
report; with this convention a failure reads flow / step / expectation
straight from that log, without opening the spec file to figure out what the
test was even doing (AC9).

Example:

```ts
await test.step('vault isolation — settings shows the open vault path', async () => {
  await page.locator('.sb-rail a[href="#/settings"]').click();
  await expect(page.locator('.sb-vault-path')).toBeVisible();
});
```

A step that only asserts against the vault on disk (see `fixtures/vault.ts`)
still gets a step name — the flow/step naming applies regardless of whether
the assertion reads the DOM or the filesystem.

## Worker options (`fixtures/app.ts`)

Every spec file sets these via `test.use({ ... })`, one Electron instance per
worker (see `specId`). Two settings-related ones (058, D1):

- `closeToTray` (default `true`) — whether closing the main window sends the
  app to the tray instead of quitting, matching the real app-level default.
  `quit-during-run.spec.ts` and `quit-during-digestion.spec.ts` set this to
  `false`, since they prove the window-close quit door that only exists when
  close-to-tray is off.
- `startMinimized` (default `false`) — whether the app starts hidden in the
  tray instead of showing its main window.
- `hotkey` (default `false`) — whether the app registers its global
  quick-capture hotkey. Off, a run claims no system-wide key while you type.
  `tray.spec.ts` turns it on, and the fixture then pins the chord to
  `E2E_HOTKEY_CHORD`, so a running Gaston holding the default chord can't fail
  the spec.

## An invisible run

The harness (`scripts/lib/app-harness.mjs`) sets `SB_UI_HARNESS=1` for every
app it starts: `npm run test:e2e`, `npm run shot` and `npm run a11y`. The main
process then places every window (main window, quick capture) left of all
displays, makes it unfocusable and shows it with `showInactive()`. It also
sends no reminder notifications and registers no hotkey. All of this lives in
`src/main/window-shared.ts`. Your desktop and your keyboard focus stay
untouched while a run goes. `harness-offscreen.spec.ts` fails if a window
lands on a display, takes the focus or stops painting.

To watch a run while debugging, set `SB_UI_VISIBLE=1`. The windows then
appear on screen but still don't take the focus.
