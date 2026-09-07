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
