/* `WikiTransaction` is the way back out of a half-finished digestion. Four
   assurances are tested here, and the third is the one that matters most: a file
   somebody else has edited since is never touched again — neither reverted nor
   moved to the trash. The vault format says the app does not rewrite a line it did
   not write itself, and a rollback is not an exception to that. */

import { describe, expect, it } from 'vitest';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { trashDir } from '@core/vault/paths';
import { WikiTransaction } from '@core/wiki';
import { NOW_MS } from '../../helpers/time';

const WIKI = 'modules/identity-management/wiki';
const SOURCE_PAGE = `${WIKI}/sources/s-2026-08-10-auth0-rbac-guide.md`;
const ENTITY_PAGE = `${WIKI}/entities/scim.md`;
const INDEX_PAGE = `${WIKI}/index.md`;
const LOG_PAGE = `${WIKI}/log.md`;

const INDEX_BEFORE = ['# Index', '', '- [[scim]] — SCIM als Protokoll', ''].join('\n');
const LOG_BEFORE = [
  '## [2026-08-04] ingest | Token Lifetimes',
  '- summary: wiki/sources/s-2026-08-04-token-lifetimes-blog.md',
  '',
].join('\n');
const ENTITY_BEFORE = [
  '---',
  'type: entity',
  'title: SCIM',
  'module: identity-management',
  '---',
  '',
  'SCIM stellt Nutzer bereit (source: [[s-2026-08-04-token-lifetimes-blog]]).',
  '',
  '## Contradictions',
  '',
].join('\n');

const SOURCE_FRONTMATTER = {
  type: 'source',
  title: 'Auth0 RBAC Guide',
  module: 'identity-management',
};
const SOURCE_BODY = 'Rollen erben in Auth0 nicht automatisch.\n';

function vault(files: Record<string, string> = {}): MemoryVaultStore {
  return new MemoryVaultStore({ files, now: new Date(NOW_MS) });
}

/** Alle Dateien, die im Papierkorb liegen — als „Pfad → Inhalt". */
function trashed(store: MemoryVaultStore): Record<string, string> {
  const prefix = `${trashDir()}/`;
  return Object.fromEntries(
    Object.entries(store.allFiles()).filter(([path]) => path.startsWith(prefix)),
  );
}

describe('WikiTransaction', () => {
  it('takes back a page it created — into the trash, not for good', async () => {
    const store = vault();
    const tx = new WikiTransaction(store);

    const written = await tx.create(SOURCE_PAGE, SOURCE_FRONTMATTER, SOURCE_BODY);
    expect(written.created).toBe(true);
    expect(await store.readText(SOURCE_PAGE)).toContain(SOURCE_BODY);

    const result = await tx.rollback();

    expect(result).toEqual({ deleted: [SOURCE_PAGE], restored: [], kept: [] });
    expect(await store.readText(SOURCE_PAGE)).toBeNull();
    // Der Rueckweg selbst hat einen Rueckweg: die Kopie liegt unter der Marke.
    expect(Object.values(trashed(store)).some((text) => text.includes(SOURCE_BODY))).toBe(true);
  });

  it('restores a file it changed to the content it had before', async () => {
    const store = vault({ [INDEX_PAGE]: INDEX_BEFORE });
    const tx = new WikiTransaction(store);

    await tx.writeText(INDEX_PAGE, `${INDEX_BEFORE}- [[oauth2]] — OAuth 2.0\n`);

    const result = await tx.rollback();

    expect(result).toEqual({ deleted: [], restored: [INDEX_PAGE], kept: [] });
    expect(await store.readText(INDEX_PAGE)).toBe(INDEX_BEFORE);
  });

  it('restores the state before its first write, not before its last one', async () => {
    const store = vault({ [INDEX_PAGE]: INDEX_BEFORE });
    const tx = new WikiTransaction(store);

    const first = await tx.writeText(INDEX_PAGE, `${INDEX_BEFORE}- [[oauth2]] — OAuth 2.0\n`);
    await tx.writeText(INDEX_PAGE, `${INDEX_BEFORE}- [[oauth2]] — OAuth 2.0\n- [[jwt]] — JWT\n`, {
      expectedHash: first.hash,
    });

    const result = await tx.rollback();

    expect(result.restored).toEqual([INDEX_PAGE]);
    expect(await store.readText(INDEX_PAGE)).toBe(INDEX_BEFORE);
  });

  it('leaves a changed file alone when somebody else has edited it since', async () => {
    const store = vault({ [INDEX_PAGE]: INDEX_BEFORE });
    const tx = new WikiTransaction(store);
    await tx.writeText(INDEX_PAGE, `${INDEX_BEFORE}- [[oauth2]] — OAuth 2.0\n`);

    /* Nicht durch die Transaktion: der Nutzer selbst, in Obsidian. */
    const byUser = `${INDEX_BEFORE}- [[oauth2]] — von Hand beschrieben\n`;
    await store.writeText(INDEX_PAGE, byUser);

    const result = await tx.rollback();

    expect(result).toEqual({ deleted: [], restored: [], kept: [INDEX_PAGE] });
    expect(await store.readText(INDEX_PAGE)).toBe(byUser);
  });

  it('leaves a created page alone when somebody else has edited it since', async () => {
    const store = vault();
    const tx = new WikiTransaction(store);
    await tx.create(SOURCE_PAGE, SOURCE_FRONTMATTER, SOURCE_BODY);

    const byUser = `${(await store.readText(SOURCE_PAGE)) ?? ''}\nEigene Notiz des Nutzers.\n`;
    await store.writeText(SOURCE_PAGE, byUser);

    const result = await tx.rollback();

    expect(result).toEqual({ deleted: [], restored: [], kept: [SOURCE_PAGE] });
    expect(await store.readText(SOURCE_PAGE)).toBe(byUser);
    expect(trashed(store)).toEqual({});
  });

  it('does nothing on rollback after commit', async () => {
    const store = vault({ [INDEX_PAGE]: INDEX_BEFORE });
    const tx = new WikiTransaction(store);
    await tx.create(SOURCE_PAGE, SOURCE_FRONTMATTER, SOURCE_BODY);
    const indexAfter = `${INDEX_BEFORE}- [[s-2026-08-10-auth0-rbac-guide]] — Quelle\n`;
    await tx.writeText(INDEX_PAGE, indexAfter);

    tx.commit();
    const result = await tx.rollback();

    expect(result).toEqual({ deleted: [], restored: [], kept: [] });
    expect(await store.readText(SOURCE_PAGE)).toContain(SOURCE_BODY);
    expect(await store.readText(INDEX_PAGE)).toBe(indexAfter);
    expect(trashed(store)).toEqual({});
  });

  it('a digestion that fails after the source page leaves no page, no catalog entry and no chronicle line', async () => {
    const store = vault({
      [INDEX_PAGE]: INDEX_BEFORE,
      [LOG_PAGE]: LOG_BEFORE,
      [ENTITY_PAGE]: ENTITY_BEFORE,
    });
    const tx = new WikiTransaction(store);

    await tx.create(SOURCE_PAGE, SOURCE_FRONTMATTER, SOURCE_BODY);
    await tx.append(
      ENTITY_PAGE,
      'Contradictions',
      '- [[s-2026-08-10-auth0-rbac-guide]] widerspricht der Vererbung von Rollen.',
    );
    await tx.writeText(INDEX_PAGE, `${INDEX_BEFORE}- [[s-2026-08-10-auth0-rbac-guide]] — Quelle\n`);

    /* Die Chronik geht schief — hier ein veralteter Hash, in Wirklichkeit ein
       Konflikt, ein Plattenfehler oder ein beendetes Programm. */
    await expect(
      tx.writeText(LOG_PAGE, `${LOG_BEFORE}## [2026-08-10] ingest | Auth0 RBAC Guide\n`, {
        expectedHash: 'veraltet',
      }),
    ).rejects.toThrow();

    const result = await tx.rollback();

    expect(await store.readText(SOURCE_PAGE)).toBeNull();
    expect(await store.readText(INDEX_PAGE)).toBe(INDEX_BEFORE);
    expect(await store.readText(ENTITY_PAGE)).toBe(ENTITY_BEFORE);
    expect(await store.readText(LOG_PAGE)).toBe(LOG_BEFORE);
    expect(result.deleted).toEqual([SOURCE_PAGE]);
    expect(result.restored).toEqual([INDEX_PAGE, ENTITY_PAGE]);
    expect(result.kept).toEqual([]);
  });
});
