/* Die vier Ingestoren als Satz — und einmal der echte Weg auf die Platte.
 *
 * Alle anderen Tests dieser Schicht arbeiten mit Faelschungen. Genau ein Test nimmt
 * `nodeFileSystem()` und einen echten Vault: das Kopieren einer Quelldatei in den Vault
 * rechnet mit OS-Pfaden, und dieser Rechenweg soll nicht erst beim Nutzer auffallen. */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allIngestors, nodeFileSystem, type IngestContext } from '@core/ingest';
import { buildIndex } from '@core/index';
import { withTempVault } from '../../helpers/vault';
import { NOW_MS } from '../../helpers/time';

describe('allIngestors', () => {
  it('waehlt fuer jede Eingabe die richtige Art', () => {
    const ingestors = allIngestors();
    expect(ingestors.map((ingestor) => ingestor.kind)).toEqual(['youtube', 'url', 'file', 'text']);

    const first = (input: string): string | undefined =>
      ingestors.find((ingestor) => ingestor.canHandle(input))?.kind;

    // YouTube vor URL: eine watch-Adresse ist beides.
    expect(first('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(first('https://example.org/blog/artikel')).toBe('url');
    // Datei vor Text: ein Pfad ist auch Text.
    expect(first('C:/quellen/notiz.md')).toBe('file');
    expect(first('Ein eingefuegter Absatz ohne Pfad und ohne Adresse.')).toBe('text');
  });
});

describe('FileIngestor auf der echten Platte', () => {
  it('kopiert die Quelldatei in den Vault und der Index findet sie', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sb-quelle-'));
    const source = join(outside, 'auth0-rbac-guide.md');
    await writeFile(source, '# Auth0 RBAC Guide\n\nRollen erben nicht automatisch.\n', 'utf8');

    await withTempVault(async (vault) => {
      const ctx: IngestContext = {
        store: vault.store,
        fs: nodeFileSystem(),
        now: new Date(NOW_MS),
        module: 'identity-management',
      };
      const ingestor = allIngestors().find((entry) => entry.kind === 'file');
      const outcome = await ingestor?.ingest(source, ctx);

      expect(outcome?.rawPath).toBe('raw/files/2026-08-10-auth0-rbac-guide');
      expect(await vault.exists('raw/files/2026-08-10-auth0-rbac-guide/auth0-rbac-guide.md')).toBe(
        true,
      );
      expect(await vault.exists('raw/files/2026-08-10-auth0-rbac-guide/.ingest.json')).toBe(true);

      const index = await buildIndex(vault.store, { now: new Date(NOW_MS) });
      const found = index.sources.find((entry) => entry.path === outcome?.rawPath);
      expect(found).toMatchObject({
        kind: 'file',
        title: 'Auth0 RBAC Guide',
        origin: source,
        sourcePage: null,
        modules: ['identity-management'],
      });
      expect(found?.bytes).toBeGreaterThan(0);
    });
  });
});
