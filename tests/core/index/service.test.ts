import { describe, expect, it } from 'vitest';
import { IndexService } from '@core/index/service';
import { VaultIndexStore } from '@core/index/persist';
import { indexPath } from '@core/vault/paths';
import { CountingStore, TODAY, vaultFiles } from './fixtures';

function store(): CountingStore {
  return new CountingStore({ files: vaultFiles(), now: new Date('2026-08-09T08:00:00.000Z') });
}

const OPTIONS = { now: () => new Date(`${TODAY}T09:00:00.000Z`), staleAfterDays: 14 };

describe('IndexService: oeffnen', () => {
  it('baut beim ersten Oeffnen auf und legt den Index ab', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    const stats = service.stats();
    expect(stats).toMatchObject({ docs: 14, todos: 9, projects: 2, modules: 2, pages: 5 });
    expect(stats.words).toBeGreaterThan(100);
    expect(stats.builtAt).not.toBeNull();
    expect(stats.durationMs).not.toBeNull();
    expect(await vault.exists(indexPath())).toBe(true);
  });

  it('beim zweiten Oeffnen wird keine unveraenderte Datei erneut gelesen', async () => {
    const vault = store();
    await IndexService.open(vault, OPTIONS);
    vault.reads.length = 0;
    const service = await IndexService.open(vault, OPTIONS);
    expect(vault.markdownReads()).toEqual([]);
    expect(service.stats().docs).toBe(14);
    // Der Suchzustand kam aus der Datei, nicht aus einem Neuaufbau.
    expect(service.search({ text: 'Rueckmeldung' }).length).toBeGreaterThan(0);
  });

  it('eine kaputte index.json fuehrt zum Neuaufbau statt zum Absturz', async () => {
    const vault = store();
    await vault.writeText(indexPath(), '{"schema":1,"docs":[{"pfad":');
    const service = await IndexService.open(vault, OPTIONS);
    expect(service.stats().docs).toBe(14);
    expect(vault.markdownReads().length).toBe(14);
    expect(service.search({ text: 'Rollenkonzept' }).length).toBeGreaterThan(0);
  });

  it('laeuft auch ohne Ablage — dann lebt der Index nur im Speicher', async () => {
    const vault = store();
    const service = await IndexService.open(vault, { ...OPTIONS, persistence: null });
    expect(service.stats().docs).toBe(14);
    expect(await vault.exists(indexPath())).toBe(false);
  });
});

describe('IndexService: nachziehen', () => {
  it('nimmt eine neue Datei auf und macht sie suchbar', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    expect(service.search({ text: 'Kaffeemaschine' })).toEqual([]);

    await vault.writeText(
      'areas/kueche.md',
      ['---', 'type: area', 'title: Küche', '---', '', 'Die Kaffeemaschine tropft.', ''].join('\n'),
    );
    await service.refresh(['areas/kueche.md']);

    expect(service.stats().docs).toBe(15);
    const hits = service.search({ text: 'Kaffeemaschine' });
    expect(hits.map((hit) => hit.path)).toEqual(['areas/kueche.md']);
    expect(hits[0]?.snippet).toContain('**Kaffeemaschine**');
  });

  it('entfernt eine geloeschte Datei aus Index und Suche', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    await vault.delete('inbox/2026-08-10-1432-gedanke-zur-suche.md');
    await service.refresh(['inbox/2026-08-10-1432-gedanke-zur-suche.md']);
    expect(service.stats().docs).toBe(13);
    expect(service.search({ text: 'Teilwörter' })).toEqual([]);
  });

  it('haelt still, wenn die gemeldeten Pfade den Index nicht beruehren', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    await vault.writeText('raw/files/x/bild.png', 'binaer');
    vault.reads.length = 0;
    await service.refresh(['raw/files/x/bild.png']);
    expect(vault.reads).toEqual([]);
    expect(service.stats().docs).toBe(14);
  });

  it('rebuild liest alles neu und meldet Fortschritt', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    vault.reads.length = 0;
    const seen: [number, number][] = [];
    const stats = await service.rebuild((done, total) => seen.push([done, total]));
    expect(vault.markdownReads()).toHaveLength(14);
    expect(seen[0]).toEqual([0, 14]);
    expect(seen[seen.length - 1]).toEqual([14, 14]);
    expect(stats.docs).toBe(14);
  });

  it('zwei Laeufe gleichzeitig laufen hintereinander', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    const [first, second] = await Promise.all([service.rebuild(), service.rebuild()]);
    expect(first.docs).toBe(14);
    expect(second.docs).toBe(14);
    expect(service.search({ text: 'Rollenkonzept' }).length).toBeGreaterThan(0);
  });
});

describe('IndexService: Ableitungen bleiben am uebergebenen heute', () => {
  it('rechnet Fristen und Stagnation gegen die Uhr des Dienstes', async () => {
    const vault = store();
    const service = await IndexService.open(vault, {
      now: () => new Date('2026-08-20T09:00:00.000Z'),
      staleAfterDays: 5,
    });
    const index = service.index();
    const mapping = index.todos.find((todo) => todo.due === '2026-08-15');
    expect(mapping?.dueInDays).toBe(-5);
    expect(index.projects.every((project) => project.stale)).toBe(true);
  });

  it('nimmt Spuren von aussen als lastTouch', async () => {
    const vault = store();
    const service = await IndexService.open(vault, {
      ...OPTIONS,
      externalTouches: new Map([
        ['keller-ausbau', { at: '2026-08-10T07:00:00.000Z', source: 'claude-session' as const }],
      ]),
    });
    const keller = service.index().projects.find((project) => project.slug === 'keller-ausbau');
    expect(keller?.lastTouch).toBe('2026-08-10T07:00:00.000Z');
    expect(keller?.lastTouchSource).toBe('claude-session');
  });
});

describe('IndexService: eigene Ablage', () => {
  it('benutzt eine mitgegebene Ablage', async () => {
    const vault = store();
    const persistence = new VaultIndexStore(vault, '.secondbrain/index/eigen.json');
    await IndexService.open(vault, { ...OPTIONS, persistence });
    expect(await vault.exists('.secondbrain/index/eigen.json')).toBe(true);
    expect(await vault.exists(indexPath())).toBe(false);
    expect((await persistence.load())?.index.docs).toHaveLength(14);
  });
});

describe('IndexService: abgeleitete Listen', () => {
  it('liefert Projekte, Todos, Dumps, Tage, Module und Quellen', async () => {
    const service = await IndexService.open(store(), OPTIONS);

    expect(service.projects().map((project) => project.slug)).toContain('nyota-auth0-migration');
    expect(service.todos().length).toBe(9);
    expect(service.dumps().map((dump) => dump.path)).toEqual([
      'inbox/2026-08-10-1432-gedanke-zur-suche.md',
    ]);
    expect(service.journal().map((day) => day.date)).toEqual(['2026-08-10']);
    expect(service.modules().map((module) => module.slug)).toEqual([
      'identity-management',
      'second-brain-methodik',
    ]);
    expect(service.sources().length).toBe(1);
    expect(service.pages().length).toBe(5);
  });

  it('zieht die Listen nach, wenn eine Datei dazukommt', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    expect(service.dumps().length).toBe(1);

    await vault.writeText(
      'inbox/2026-08-10-1500-neuer-gedanke.md',
      '---\ntype: dump\ntitle: Neuer Gedanke\nstatus: raw\n---\n\nNoch unsortiert.\n',
    );
    await service.refresh(['inbox/2026-08-10-1500-neuer-gedanke.md']);

    expect(service.dumps().map((dump) => dump.title)).toContain('Neuer Gedanke');
  });
});
