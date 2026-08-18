import { describe, expect, it } from 'vitest';
import {
  areaPath,
  assertSafeVaultPath,
  baseName,
  dirName,
  extName,
  inboxPath,
  ingestLogPath,
  isSafeVaultPath,
  isInternalPath,
  isoDay,
  journalPath,
  joinVaultPath,
  minuteStamp,
  modulePagePath,
  modulePath,
  projectPath,
  rawPath,
  slugify,
  sourceSlug,
  toVaultPath,
  uniqueSlug,
  wikiIndexPath,
  wikiLogPath,
} from '@core/vault/paths';
import { VaultPathError } from '@core/vault/types';

describe('slugify', () => {
  it('schreibt Umlaute aus und bleibt ASCII', () => {
    expect(slugify('Größe der Übergabe')).toBe('groesse-der-uebergabe');
    expect(slugify('Änderungen an Öl & Öfen')).toBe('aenderungen-an-oel-und-oefen');
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('macht aus Sonderzeichen und Leerraum genau einen Bindestrich', () => {
    expect(slugify('  Hallo,   Welt!!  ')).toBe('hallo-welt');
    expect(slugify('C:/development/Nyota-Auth0')).toBe('c-development-nyota-auth0');
    expect(slugify('---')).toBe('notiz');
    expect(slugify('')).toBe('notiz');
    expect(slugify('🙂')).toBe('notiz');
  });

  it('kappt an einer Bindestrich-Grenze', () => {
    const slug = slugify('eins zwei drei vier fuenf sechs sieben acht neun zehn elf', 30);
    expect(slug.length).toBeLessThanOrEqual(30);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.startsWith('eins-zwei-drei')).toBe(true);
  });

  it('haengt bei Kollisionen -2, -3 an', () => {
    expect(uniqueSlug('Nyota Auth0', [])).toBe('nyota-auth0');
    expect(uniqueSlug('Nyota Auth0', ['nyota-auth0'])).toBe('nyota-auth0-2');
    expect(uniqueSlug('Nyota Auth0', ['nyota-auth0', 'nyota-auth0-2'])).toBe('nyota-auth0-3');
    expect(uniqueSlug('Nyota Auth0', (candidate) => candidate !== 'nyota-auth0-4')).toBe(
      'nyota-auth0-4',
    );
  });
});

describe('Pfadwache', () => {
  it('lehnt Traversal, absolute Pfade und Laufwerksbuchstaben ab', () => {
    const bad = [
      '../geheim.md',
      'inbox/../../etc/passwd',
      '/etc/passwd',
      '//server/share/x.md',
      'C:/Windows/system.ini',
      'c:\\windows\\system.ini',
      'inbox\\..\\..\\x.md',
      'inbox/a?b.md',
      'inbox/a:b.md',
      'inbox/COM1.md',
      'inbox/ende.',
      '   ',
      '',
    ];
    for (const path of bad) {
      expect(isSafeVaultPath(path), path).toBe(false);
      expect(() => assertSafeVaultPath(path)).toThrow(VaultPathError);
    }
  });

  it('nimmt gueltige Pfade an und vereinheitlicht die Trenner', () => {
    expect(assertSafeVaultPath('projects\\work\\nyota\\project.md')).toBe(
      'projects/work/nyota/project.md',
    );
    expect(assertSafeVaultPath('./inbox//a.md')).toBe('inbox/a.md');
    expect(assertSafeVaultPath('.secondbrain/index/index.json')).toBe(
      '.secondbrain/index/index.json',
    );
    expect(joinVaultPath('inbox', 'a.md')).toBe('inbox/a.md');
    expect(toVaultPath('a\\b\\c')).toBe('a/b/c');
  });

  it('zerlegt Pfade', () => {
    expect(dirName('projects/work/nyota/project.md')).toBe('projects/work/nyota');
    expect(dirName('README.md')).toBe('');
    expect(baseName('projects/work/nyota/project.md')).toBe('project.md');
    expect(extName('a/b/c.MD')).toBe('.md');
    expect(extName('a/b/c')).toBe('');
    expect(isInternalPath('.secondbrain/trash/x/y.md')).toBe(true);
    expect(isInternalPath('inbox/x.md')).toBe(false);
  });
});

describe('Pfad-Bauer', () => {
  it('folgt VAULT-FORMAT.md', () => {
    const at = new Date(2026, 7, 10, 14, 32, 11);
    expect(minuteStamp(at)).toBe('2026-08-10-1432');
    expect(isoDay(at)).toBe('2026-08-10');
    expect(isoDay('2026-08-10')).toBe('2026-08-10');
    expect(inboxPath(at, 'Gedanke zur Deployment-Pipeline')).toBe(
      'inbox/2026-08-10-1432-gedanke-zur-deployment-pipeline.md',
    );
    expect(journalPath(at)).toBe('journal/2026/08/2026-08-10.md');
    expect(journalPath('2026-01-05')).toBe('journal/2026/01/2026-01-05.md');
    expect(projectPath('work', 'Nyota Auth0 Migration')).toBe(
      'projects/work/nyota-auth0-migration/project.md',
    );
    expect(areaPath('Gesundheit & Sport')).toBe('areas/gesundheit-und-sport.md');
    expect(modulePath('Identity Management')).toBe('modules/identity-management/module.md');
    expect(wikiIndexPath('identity-management')).toBe('modules/identity-management/wiki/index.md');
    expect(wikiLogPath('identity-management')).toBe('modules/identity-management/wiki/log.md');
    expect(modulePagePath('identity-management', 'source', 's-2026-07-02-auth0-rbac-guide')).toBe(
      'modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md',
    );
    expect(modulePagePath('identity-management', 'entity', 'Auth0')).toBe(
      'modules/identity-management/wiki/entities/auth0.md',
    );
    expect(
      modulePagePath('identity-management', 'concept', 'Rollenbasierte Zugriffskontrolle'),
    ).toBe('modules/identity-management/wiki/concepts/rollenbasierte-zugriffskontrolle.md');
    expect(modulePagePath('identity-management', 'overview')).toBe(
      'modules/identity-management/wiki/overview.md',
    );
    expect(sourceSlug(at, 'Auth0 RBAC Guide')).toBe('s-2026-08-10-auth0-rbac-guide');
  });

  it('legt Rohquellen an ihren Ort', () => {
    const at = new Date(2026, 7, 10, 14, 40, 0);
    expect(rawPath('youtube', 'xOFkpf9KgKg')).toBe('raw/youtube/xOFkpf9KgKg');
    expect(rawPath('file', 'Konzept.pdf', at)).toBe('raw/files/2026-08-10-konzept-pdf');
    expect(rawPath('url', 'karpathy.bearblog.dev', at)).toBe(
      'raw/web/2026-08-10-karpathy-bearblog-dev.md',
    );
    expect(ingestLogPath(rawPath('youtube', 'xOFkpf9KgKg'))).toBe(
      'raw/youtube/xOFkpf9KgKg/.ingest.json',
    );
    expect(rawPath('youtube', 'a/b?c')).toBe('raw/youtube/a-b-c');
  });
});
