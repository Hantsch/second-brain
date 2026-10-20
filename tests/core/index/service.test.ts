import { describe, expect, it } from 'vitest';
import { IndexService } from '@core/index/service';
import { VaultIndexStore } from '@core/index/persist';
import { indexPath } from '@core/vault/paths';
import type { VaultStat } from '@core/vault/types';
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

describe('IndexService: derived() Memoisierung', () => {
  it('rechnet einmal je Generation und erneut nach einer Aenderung', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    const before = service.dumps();
    const generationBefore = service.generation();
    // Zweiter Aufruf ohne Aenderung: dieselbe Referenz, nicht neu gerechnet.
    expect(service.dumps()).toBe(before);

    await vault.writeText(
      'inbox/2026-08-10-1500-neuer-gedanke.md',
      '---\ntype: dump\ntitle: Neuer Gedanke\nstatus: raw\n---\n\nNoch unsortiert.\n',
    );
    await service.refresh(['inbox/2026-08-10-1500-neuer-gedanke.md']);

    expect(service.generation()).toBeGreaterThan(generationBefore);
    const after = service.dumps();
    expect(after).not.toBe(before);
    expect(after.length).toBe(before.length + 1);
  });

  it('rechnet nicht neu, wenn ein Lauf nichts am Index aendert', async () => {
    const vault = store();
    const service = await IndexService.open(vault, OPTIONS);
    const before = service.dumps();
    const generationBefore = service.generation();

    await vault.writeText('raw/files/x/bild.png', 'binaer');
    await service.refresh(['raw/files/x/bild.png']);

    expect(service.generation()).toBe(generationBefore);
    expect(service.dumps()).toBe(before);
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

/**
 * Haelt den ersten `stat` auf `gate` an, bis der Test ihn freigibt — so steht
 * ein gezielter Refresh nachweislich mitten im Lauf, waehrend weitere Aufrufe
 * eintreffen.
 */
class GatedStore extends CountingStore {
  private gate: { path: string; entered: () => void; release: Promise<void> } | null = null;

  holdAt(path: string): { entered: Promise<void>; release: () => void } {
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => (entered = resolve));
    const releasePromise = new Promise<void>((resolve) => (release = resolve));
    this.gate = { path, entered, release: releasePromise };
    return { entered: enteredPromise, release };
  }

  override async stat(path: string): Promise<VaultStat | null> {
    const gate = this.gate;
    if (gate !== null && gate.path === path) {
      this.gate = null;
      gate.entered();
      await gate.release;
    }
    return super.stat(path);
  }
}

function note(title: string): string {
  return ['---', 'type: note', `title: ${title}`, '---', '', `Inhalt ${title}.`, ''].join('\n');
}

describe('IndexService: gebuendeltes Nachziehen', () => {
  it('refresh calls during a running update collapse into one follow-up run', async () => {
    const vault = new GatedStore({
      files: vaultFiles(),
      now: new Date('2026-08-09T08:00:00.000Z'),
    });
    const service = await IndexService.open(vault, { ...OPTIONS, persistence: null });
    for (let i = 0; i <= 5; i += 1) await vault.writeText(`areas/neu-${i}.md`, note(`Neu ${i}`));
    const before = service.generation();

    const gate = vault.holdAt('areas/neu-0.md');
    const first = service.refresh(['areas/neu-0.md']);
    await gate.entered;
    const followers = [1, 2, 3, 4, 5].map((i) => service.refresh([`areas/neu-${i}.md`]));
    // All five mid-run calls share the one queued run's promise.
    for (const follower of followers) expect(follower).toBe(followers[0]);
    expect(followers[0]).not.toBe(first);

    gate.release();
    await expect(Promise.all([first, ...followers])).resolves.toBeDefined();

    // Each run that finds a new file bumps the generation once: two runs, not six.
    expect(service.generation() - before).toBe(2);
    expect(service.stats().docs).toBe(20);
  });

  it('a refresh arriving mid-run is not lost', async () => {
    const vault = new GatedStore({
      files: vaultFiles(),
      now: new Date('2026-08-09T08:00:00.000Z'),
    });
    const service = await IndexService.open(vault, { ...OPTIONS, persistence: null });
    await vault.writeText('areas/erste.md', note('Erste'));

    const gate = vault.holdAt('areas/erste.md');
    const first = service.refresh(['areas/erste.md']);
    await gate.entered;
    await vault.writeText('areas/nachzuegler.md', note('Nachzuegler'));
    const late = service.refresh(['areas/nachzuegler.md']);

    gate.release();
    await Promise.all([first, late]);

    const hits = service.search({ text: 'Nachzuegler' });
    expect(hits.map((hit) => hit.path)).toContain('areas/nachzuegler.md');
  });

  it('a failed run rejects its callers but still starts the queued run', async () => {
    const vault = new GatedStore({
      files: vaultFiles(),
      now: new Date('2026-08-09T08:00:00.000Z'),
    });
    const service = await IndexService.open(vault, { ...OPTIONS, persistence: null });
    await vault.writeText('areas/kaputt.md', note('Kaputt'));
    await vault.writeText('areas/danach.md', note('Danach'));

    const gate = vault.holdAt('areas/kaputt.md');
    const originalStat = vault.stat.bind(vault);
    let failed = false;
    vault.stat = async (path: string): Promise<VaultStat | null> => {
      const result = await originalStat(path);
      if (path === 'areas/kaputt.md' && !failed) {
        failed = true;
        throw new Error('stat failed');
      }
      return result;
    };
    const first = service.refresh(['areas/kaputt.md']);
    await gate.entered;
    const follower = service.refresh(['areas/danach.md']);

    gate.release();
    await expect(first).rejects.toThrow('stat failed');
    await follower;
    expect(service.search({ text: 'Danach' }).map((hit) => hit.path)).toContain('areas/danach.md');
  });

  it('a full refresh merged into the queued run wins over its path set', async () => {
    const vault = new GatedStore({
      files: vaultFiles(),
      now: new Date('2026-08-09T08:00:00.000Z'),
    });
    const service = await IndexService.open(vault, { ...OPTIONS, persistence: null });
    await vault.writeText('areas/start.md', note('Start'));

    const gate = vault.holdAt('areas/start.md');
    const first = service.refresh(['areas/start.md']);
    await gate.entered;
    await vault.writeText('areas/ungemeldet.md', note('Ungemeldet'));
    const scoped = service.refresh(['areas/start.md']);
    const full = service.refresh();
    expect(full).toBe(scoped);

    gate.release();
    await Promise.all([first, scoped]);
    // Nobody reported this path; only the full walk can have found it.
    expect(service.search({ text: 'Ungemeldet' }).map((hit) => hit.path)).toContain(
      'areas/ungemeldet.md',
    );
  });
});
