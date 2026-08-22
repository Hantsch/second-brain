/* Die Projekt- und Todo-Kanäle im Hauptprozess — an echten Dateien, ohne Netz.
 *
 * Der Prüfstein dieses Bereichs ist ein Versprechen an die Datei: was die App
 * schreibt, ist genau das, was sie ankündigt. Deshalb steht hier vor allem, was
 * *nicht* passieren darf — ein verlorenes Nutzerfeld, eine zweite umgeschriebene
 * Zeile, ein Statuswechsel ohne Bestätigung, ein Häkchen über eine fremde
 * Änderung hinweg.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filingBlock, removeBlock } from '@core/capture';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { CLAUDE_PROJECTS_DIR } from '../fixtures';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { TODAY, day, freezeTime } from '../helpers/time';

/* Electron gibt es im Test nicht: Fenster keine, Verschlüsselung keine. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const WORK = 'projects/work/kundenportal-relaunch/project.md';
const PRIVATE = 'projects/private/hochbeet-bauen/project.md';

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { projectHandlers } = await import('../../src/main/ipc/projects');
  const { todoHandlers } = await import('../../src/main/ipc/todos');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: der Index zieht über `settle()` im Handler nach — genau das
     soll geprüft werden. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = { ...projectHandlers(services), ...todoHandlers(services) };
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, events };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Projekt- und Todo-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    /* `@done:` und die Tagesdatei hängen am Kalendertag — der muss feststehen,
       sonst prüft der Test morgen etwas anderes. */
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-projects-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    /* `projects:suggestStatus` liest Arbeitsspuren mit. Sie kommen aus den
       Fixtures, nie aus dem echten `~/.claude`. */
    await harness.settings.patchVault({ overview: { claudeProjectsDir: CLAUDE_PROJECTS_DIR } });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  /* Das Frontmatter, wie es in der Datei steht — über den Lesekanal geparst,
     damit die Prüfung am Inhalt hängt und nicht am YAML-Stil. */
  async function frontmatterOf(slug: string): Promise<Record<string, unknown>> {
    const found = await harness.call('projects:get', { slug });
    return found?.doc.frontmatter ?? {};
  }

  // ── Lesen ──────────────────────────────────────────────────────────────────

  it('trennt Arbeit und Privat und lässt Erledigtes draußen', async () => {
    const work = await harness.call('projects:list', { scope: 'work' });
    const all = await harness.call('projects:list', {});

    expect(work.map((project) => project.slug)).toEqual(['kundenportal-relaunch']);
    expect(all.map((project) => project.scope).sort()).toEqual(['private', 'work']);
  });

  it('gibt Projekt und Datei zusammen zurück, mit Hash für den Schreibweg', async () => {
    const found = await harness.call('projects:get', { slug: 'kundenportal-relaunch' });

    expect(found?.project.title).toBe('Kundenportal Relaunch');
    expect(found?.doc.path).toBe(WORK);
    expect(found?.doc.hash).toHaveLength(64);
    expect(found?.doc.body).toContain('## Stand');
  });

  it('sagt bei einem Projekt, das es nicht gibt, dass es keins gibt', async () => {
    expect(await harness.call('projects:get', { slug: 'gibt-es-nicht' })).toBeNull();
    await expect(
      harness.call('projects:patch', { slug: 'gibt-es-nicht', patch: { status: 'done' } }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  // ── Ändern ─────────────────────────────────────────────────────────────────

  it('erhält beim Patchen unbekannte Frontmatter-Felder des Nutzers', async () => {
    await vault.write(
      WORK,
      ((await vault.read(WORK)) ?? '').replace(
        'type: project',
        'type: project\nkostenstelle: 4711\neigene_liste:\n  - a\n  - b',
      ),
    );
    await harness.services.requireIndex().refresh?.([WORK]);

    const patched = await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { status: 'paused', next_step: 'Erst nach dem Release weitermachen' },
    });

    expect(patched.status).toBe('paused');
    expect(patched.nextStep).toBe('Erst nach dem Release weitermachen');
    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).toContain('kostenstelle: 4711');
    expect(raw).toContain('eigene_liste:');
    expect(raw).toContain('  - b');
    /* Die App hat geschrieben, also trägt sie `updated` nach. */
    expect(raw).toContain(`updated: ${TODAY}`);
    /* Der Rumpf bleibt Zeile für Zeile stehen. */
    expect(raw).toContain('- [ ] Abnahmeprotokoll mit Miriam durchgehen @due:2026-08-10 !!!');
  });

  /* Die Herkunft steht in der Datei, nicht nur im Index: wer den Vault ohne die
     App liest, sieht ebenfalls, woher Status und nächster Schritt stammen. */
  it('stempelt beim Patchen die Herkunft von Status und nächstem Schritt', async () => {
    await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { status: 'paused', next_step: 'Erst nach dem Release weitermachen' },
    });

    const front = await frontmatterOf('kundenportal-relaunch');
    expect(front['status_set']).toEqual({ at: TODAY, by: 'user' });
    expect(front['next_step_set']).toEqual({ at: TODAY, by: 'user' });
    expect((await vault.read(WORK)) ?? '').toContain('status_set:');
  });

  it('schreibt eine angenommene Vorschlagsänderung als Vorschlag, nicht als Nutzerentscheidung', async () => {
    await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { status: 'paused' },
      origin: 'suggestion',
    });

    expect((await frontmatterOf('kundenportal-relaunch'))['status_set']).toEqual({
      at: TODAY,
      by: 'suggestion',
    });
    expect((await vault.read(WORK)) ?? '').toContain('by: suggestion');
  });

  /* Ein Patch über `priority` sagt nichts über den Status — er darf deshalb auch
     keinen Stempel erfinden, der behauptet, heute habe jemand den Status gesetzt. */
  it('stempelt nichts, wenn der Patch Status und nächsten Schritt gar nicht anfasst', async () => {
    await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { priority: 1 },
    });

    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).not.toContain('status_set:');
    expect(raw).not.toContain('next_step_set:');
    expect(raw).toContain(`updated: ${TODAY}`);
  });

  /* Der eigentliche Risikofall des Schreibpfads: `setPreserving` ersetzt eine
     verschachtelte Map als Ganzes. Ein Patch, der Status/nächsten Schritt gar
     nicht nennt, darf einen bereits vorhandenen Stempel deshalb nicht nur
     „nicht neu erfinden" (das prüft der Test darüber), sondern muss ihn
     Zeichen für Zeichen stehen lassen — auch über mehrere Tage hinweg, nicht
     nur am selben Tag wie das ursprüngliche Setzen. */
  it('lässt einen vorhandenen Stempel unangetastet, wenn ein Patch ihn nicht betrifft', async () => {
    await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { status: 'paused', next_step: 'Erst nach dem Release weitermachen' },
      origin: 'suggestion',
    });
    const before = await frontmatterOf('kundenportal-relaunch');
    expect(before['status_set']).toEqual({ at: TODAY, by: 'suggestion' });
    expect(before['next_step_set']).toEqual({ at: TODAY, by: 'suggestion' });

    await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { priority: 1 },
    });

    const after = await frontmatterOf('kundenportal-relaunch');
    expect(after['status_set']).toEqual({ at: TODAY, by: 'suggestion' });
    expect(after['next_step_set']).toEqual({ at: TODAY, by: 'suggestion' });
  });

  it('weist ein Feld ab, das die App nicht kennt, statt es stillschweigend zu schlucken', async () => {
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { erfunden: 'ja' } as never,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { scope: 'private' },
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { status: 'irgendwas' as never },
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    /* Die Herkunft stempelt die App selbst — ein Aufrufer, der sie mitschickt,
       würde eine Behauptung setzen, für die niemand geradesteht. */
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { status_set: { at: '2026-01-01', by: 'user' } } as never,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    /* `favorite: null` würde "Feld löschen" bedeuten — Entstern schreibt aber
       laut Spezifikation immer `favorite: false`, nie ein Fehlen des Feldes. */
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { favorite: null } as never,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('schreibt mit veraltetem Hash nicht, sondern meldet den Konflikt', async () => {
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { status: 'done' },
        expectedHash: 'von-vorgestern',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).toContain('status: active');
    /* Kein halber Schreibvorgang: der abgewiesene Patch hat auch keinen Stempel
       hinterlassen, der einen Statuswechsel behaupten würde. */
    expect(raw).not.toContain('status_set:');
  });

  it('schreibt `favorite` beim Patchen und erhält dabei unbekannte Nutzerfelder', async () => {
    await vault.write(
      WORK,
      ((await vault.read(WORK)) ?? '').replace('type: project', 'type: project\nkostenstelle: 4711'),
    );
    await harness.services.requireIndex().refresh?.([WORK]);

    const patched = await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { favorite: true },
    });

    expect(patched.favorite).toBe(true);
    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).toContain('favorite: true');
    /* Das Patchen von `favorite` betrifft ein fremdes Feld nicht — es muss
       genauso stehen bleiben wie bei jedem anderen Patch. */
    expect(raw).toContain('kostenstelle: 4711');
  });

  it('schreibt mit veraltetem Hash auch bei `favorite` nicht, sondern meldet den Konflikt', async () => {
    await expect(
      harness.call('projects:patch', {
        slug: 'kundenportal-relaunch',
        patch: { favorite: true },
        expectedHash: 'von-vorgestern',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).not.toContain('favorite: true');
  });

  it('meldet die Änderung, damit der Renderer nachlädt', async () => {
    await harness.call('projects:patch', {
      slug: 'hochbeet-bauen',
      patch: { priority: 1 },
    });

    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [PRIVATE],
      external: false,
    });
  });

  // ── Anlegen ────────────────────────────────────────────────────────────────

  it('legt ein Projekt nach VAULT-FORMAT.md an', async () => {
    const created = await harness.call('projects:create', {
      title: 'Küche renovieren',
      scope: 'private',
      status: 'idea',
      body: 'Angebote von zwei Schreinern liegen vor.',
    });

    expect(created.slug).toBe('kueche-renovieren');
    expect(created.path).toBe('projects/private/kueche-renovieren/project.md');
    expect(created.status).toBe('idea');
    const raw = (await vault.read(created.path)) ?? '';
    expect(raw).toContain('type: project');
    expect(raw).toContain('title: Küche renovieren');
    expect(raw).toContain('slug: kueche-renovieren');
    expect(raw).toContain('scope: private');
    expect(raw).toContain('## Stand');
    expect(raw).toContain('Angebote von zwei Schreinern liegen vor.');
    expect(raw).toContain('## Todos');
    expect(raw).toContain('## Notizen');
    /* Beim Anlegen gibt es keinen Vorschlag, den jemand angenommen haben könnte:
       der Status kommt vom Nutzer. */
    expect((await frontmatterOf('kueche-renovieren'))['status_set']).toEqual({
      at: TODAY,
      by: 'user',
    });
    /* Sofort in der Liste — der Index ist nachgezogen. */
    const list = await harness.call('projects:list', { scope: 'private' });
    expect(list.map((project) => project.slug)).toContain('kueche-renovieren');
  });

  /* 024: a project created while the vault's document language is English
     must carry English headings from the start — otherwise creating a
     project would disagree with filing onto it a moment later. */
  it('legt ein Projekt mit englischen Überschriften an, wenn die Dokumentsprache Englisch ist', async () => {
    await harness.settings.setLanguages({ documents: 'en' });

    const created = await harness.call('projects:create', {
      title: 'Renovate kitchen',
      scope: 'private',
      status: 'idea',
      body: 'Two carpenters sent quotes.',
    });

    const raw = (await vault.read(created.path)) ?? '';
    expect(raw).toContain('## Status');
    expect(raw).toContain('Two carpenters sent quotes.');
    expect(raw).toContain('## Todos');
    expect(raw).toContain('## Notes');
    expect(raw).not.toContain('## Stand');
    expect(raw).not.toContain('## Notizen');
  });

  /* Der Ordner entscheidet, nicht der Titel: „Hochbeet bauen" landet im Ordner
     des bestehenden Projekts — und wird deshalb abgewiesen. */
  it('legt kein zweites Projekt über ein bestehendes', async () => {
    await expect(
      harness.call('projects:create', { title: 'Hochbeet bauen', scope: 'private' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('hängt einen Text unter einem Abschnitt an, ohne den Rest anzufassen', async () => {
    const before = (await vault.read(PRIVATE)) ?? '';

    await harness.call('projects:append', {
      slug: 'hochbeet-bauen',
      section: 'Notizen',
      content: '### 2026-08-10\n\nLärche war teurer als gedacht.',
    });

    const raw = (await vault.read(PRIVATE)) ?? '';
    expect(raw).toContain('Lärche war teurer als gedacht.');
    expect(raw).toContain('Maße stehen: 120 × 60 × 80');
    expect(raw.indexOf('## Notizen')).toBe(before.indexOf('## Notizen'));
  });

  // ── Notizen ────────────────────────────────────────────────────────────────

  /* Der zweite neue Schreibweg in die Dateien des Nutzers. Deshalb steht hier
     vor allem, was *nicht* passieren darf: ein Block, der anders aussieht als
     der der Ablage; ein Schreibvorgang über eine fremde Änderung hinweg; ein
     Rückweg, der eine vom Nutzer überarbeitete Notiz mitnimmt. */

  const hashOf = async (path: string): Promise<string> => {
    const doc = await vault.store.read(path);
    expect(doc, path).not.toBeNull();
    return doc?.hash ?? '';
  };

  /** Ein Projekt ganz ohne Notizen-Abschnitt — von außen geschrieben. */
  const NO_SECTION = 'projects/work/altbau-sanierung/project.md';
  const noSectionFile = [
    '---',
    'type: project',
    'title: Altbau Sanierung',
    'slug: altbau-sanierung',
    'scope: work',
    'status: active',
    'priority: 3',
    'started: 2026-07-01',
    'created: 2026-07-01',
    'updated: 2026-07-01',
    '---',
    '',
    '## Stand',
    '',
    'Der Statiker ist beauftragt.',
    '',
    '## Todos',
    '',
    '- [ ] Angebot vom Dachdecker einholen',
    '',
  ].join('\n');

  it('schreibt eine Notiz als Datumsblock, Zeichen für Zeichen wie die Ablage', async () => {
    const before = await vault.store.read(PRIVATE);
    const text = 'Lärche war teurer als gedacht, Douglasie tut es auch.';

    const written = await harness.call('projects:createNote', { slug: 'hochbeet-bauen', text });

    /* Genau der Block, den `filingBlock` erzeugt — sonst driften Ablage und
       handgeschriebene Notiz in derselben Datei auseinander. */
    expect(written.block).toBe(filingBlock(text));
    expect(written.block).toBe(`### ${TODAY}\n\n${text}`);
    expect(written.path).toBe(PRIVATE);
    expect(written.created).toBe(false);
    expect(written.hash).toBe(await hashOf(PRIVATE));
    const after = await vault.store.read(PRIVATE);
    expect(after?.body).toContain(written.block);
    /* Nichts sonst hat sich bewegt: den Block wieder heraus, und die Datei ist
       die alte — Frontmatter, Stand, Todos, der ältere Eintrag. */
    expect(removeBlock(after?.body ?? '', written.block)).toBe(before?.body);
    expect(await vault.read(PRIVATE)).toContain('### 2026-08-08');
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [PRIVATE],
      external: false,
    });
  });

  it('legt den Notizen-Abschnitt am Dateiende an, wenn die Datei keinen hat', async () => {
    await vault.write(NO_SECTION, noSectionFile);

    const written = await harness.call('projects:createNote', {
      slug: 'altbau-sanierung',
      text: 'Statiker meldet sich nächste Woche.',
    });

    expect(written.path).toBe(NO_SECTION);
    const raw = (await vault.read(NO_SECTION)) ?? '';
    /* Der Abschnitt steht hinten, und alles davor ist Zeichen für Zeichen die
       Datei, die der Nutzer geschrieben hat. */
    expect(raw.slice(0, raw.indexOf('## Notizen'))).toBe(`${noSectionFile}\n`);
    expect(raw.slice(raw.indexOf('## Notizen'))).toBe(`## Notizen\n\n${written.block}\n`);
  });

  /* Die Überschrift kommt aus der Datei: ein Projekt, das „Notes" führt, führt
     es weiter — sonst hätte dieselbe Datei zwei Notizen-Abschnitte. */
  it('hängt unter die englische Überschrift an, wenn die Datei sie führt', async () => {
    await vault.write(
      NO_SECTION,
      `${noSectionFile}\n## Notes\n\n### 2026-08-01\n\nErster Eintrag.\n`,
    );

    const written = await harness.call('projects:createNote', {
      slug: 'altbau-sanierung',
      text: 'Dachdecker war da.',
    });

    const raw = (await vault.read(NO_SECTION)) ?? '';
    expect(raw).not.toContain('## Notizen');
    expect(raw.split('## Notes')).toHaveLength(2);
    expect(raw.indexOf(written.block)).toBeGreaterThan(raw.indexOf('Erster Eintrag.'));
  });

  it('schreibt eine Notiz mit veraltetem Hash nicht, sondern meldet den Konflikt', async () => {
    const stale = await hashOf(PRIVATE);
    await harness.call('projects:createNote', { slug: 'hochbeet-bauen', text: 'Erste Notiz' });
    const between = await vault.read(PRIVATE);

    await expect(
      harness.call('projects:createNote', {
        slug: 'hochbeet-bauen',
        text: 'Zweite Notiz auf veraltetem Stand',
        expectedHash: stale,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(PRIVATE)).toBe(between);
    expect(await vault.read(PRIVATE)).not.toContain('Zweite Notiz auf veraltetem Stand');
  });

  it('verliert bei schreiben → von außen ändern → wieder lesen nichts', async () => {
    const written = await harness.call('projects:createNote', {
      slug: 'hochbeet-bauen',
      text: 'Erde nach dem Regen holen.',
    });
    /* Der Nutzer öffnet die Datei selbst und ergänzt eine Zeile im Stand. */
    await vault.write(
      PRIVATE,
      ((await vault.read(PRIVATE)) ?? '').replace(
        'Keller, die Schrauben auch.',
        'Keller, die Schrauben auch. Winkel fehlen noch.',
      ),
    );

    const reread = await harness.call('projects:get', { slug: 'hochbeet-bauen' });

    expect(reread?.doc.body).toContain('Winkel fehlen noch.');
    expect(reread?.doc.body).toContain(written.block);
    expect(reread?.doc.hash).not.toBe(written.hash);
    /* Und die nächste Notiz geht auf dem neuen Stand durch, ohne die fremde
       Zeile anzufassen. */
    const second = await harness.call('projects:createNote', {
      slug: 'hochbeet-bauen',
      text: 'Winkel bestellt.',
    });
    const raw = (await vault.read(PRIVATE)) ?? '';
    expect(raw).toContain('Winkel fehlen noch.');
    expect(raw).toContain(written.block);
    expect(raw).toContain(second.block);
    expect(raw).toContain('### 2026-08-08');
  });

  it('nimmt genau den geschriebenen Block wieder heraus', async () => {
    const before = await vault.read(PRIVATE);
    const written = await harness.call('projects:createNote', {
      slug: 'hochbeet-bauen',
      text: 'Doch nicht Lärche.',
    });

    const removed = await harness.call('projects:removeNote', {
      slug: 'hochbeet-bauen',
      block: written.block,
    });

    /* Zeichen für Zeichen die Datei von vorher. */
    expect(await vault.read(PRIVATE)).toBe(before);
    expect(removed).toEqual({ path: PRIVATE, hash: await hashOf(PRIVATE), created: false });
  });

  it('lässt eine vom Nutzer geänderte Notiz stehen und schreibt nichts', async () => {
    const written = await harness.call('projects:createNote', {
      slug: 'hochbeet-bauen',
      text: 'Erde und Kompost aus dem Baumarkt.',
    });
    /* Der Nutzer schreibt die Notiz um — jetzt ist es seine Zeile. */
    await vault.write(
      PRIVATE,
      ((await vault.read(PRIVATE)) ?? '').replace(
        'Erde und Kompost aus dem Baumarkt.',
        'Erde und Kompost besser vom Gärtner nebenan.',
      ),
    );
    const edited = await vault.read(PRIVATE);
    const hash = await hashOf(PRIVATE);

    const result = await harness.call('projects:removeNote', {
      slug: 'hochbeet-bauen',
      block: written.block,
    });

    /* Kein Fehler: es gibt nur nichts mehr zurückzunehmen. Und keine Zeile des
       Nutzers wurde dafür angefasst. */
    expect(result).toEqual({ path: PRIVATE, hash, created: false });
    expect(await vault.read(PRIVATE)).toBe(edited);
    expect(await vault.read(PRIVATE)).toContain('Erde und Kompost besser vom Gärtner nebenan.');
  });

  it('verweigert eine leere Notiz und einen leeren Block', async () => {
    const before = await vault.read(PRIVATE);

    await expect(
      harness.call('projects:createNote', { slug: 'hochbeet-bauen', text: '   \n  ' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('projects:removeNote', { slug: 'hochbeet-bauen', block: '   ' }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.read(PRIVATE)).toBe(before);
  });

  it('schreibt keine Notiz in ein Projekt, das es nicht gibt', async () => {
    await expect(
      harness.call('projects:createNote', { slug: 'gibt-es-nicht', text: 'Irgendwas' }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      harness.call('projects:removeNote', { slug: 'gibt-es-nicht', block: `### ${TODAY}\n\nx` }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('erhält beim Schreiben einer Notiz unbekannte Frontmatter-Felder des Nutzers', async () => {
    await vault.write(
      WORK,
      ((await vault.read(WORK)) ?? '').replace(
        'type: project',
        'type: project\nkostenstelle: 4711\neigene_liste:\n  - a\n  - b',
      ),
    );
    await harness.services.requireIndex().refresh?.([WORK]);
    const before = await vault.read(WORK);

    const written = await harness.call('projects:createNote', {
      slug: 'kundenportal-relaunch',
      text: 'Jonas hat den Fallback abgenickt.',
    });

    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).toContain('kostenstelle: 4711');
    expect(raw).toContain('eigene_liste:');
    expect(raw).toContain('  - b');
    expect(raw).toContain(written.block);
    /* Und der Rückweg lässt das Frontmatter genauso stehen. */
    await harness.call('projects:removeNote', {
      slug: 'kundenportal-relaunch',
      block: written.block,
    });
    expect(await vault.read(WORK)).toBe(before);
  });

  // ── Warte-auf ──────────────────────────────────────────────────────────────

  it('hakt genau den gemeinten Warte-auf-Eintrag ab und behält den anderen', async () => {
    await vault.write(
      WORK,
      ((await vault.read(WORK)) ?? '').replace(
        '    due: 2026-08-12',
        '    due: 2026-08-12\n    ticket: OPS-88\n  - who: Miriam\n    what: Abnahmetermin\n    since: 2026-08-07',
      ),
    );
    await harness.services.requireIndex().refresh?.([WORK]);

    const patched = await harness.call('projects:resolveWaiting', {
      slug: 'kundenportal-relaunch',
      index: 1,
    });

    expect(patched.waitingOn.map((entry) => [entry.who, entry.resolved === true])).toEqual([
      ['Jonas', false],
      ['Miriam', true],
    ]);
    /* Ein eigenes Feld am Eintrag überlebt. */
    expect(await vault.read(WORK)).toContain('ticket: OPS-88');
  });

  it('sagt bei einem Warte-auf, das es nicht gibt, dass es keins gibt', async () => {
    await expect(
      harness.call('projects:resolveWaiting', { slug: 'kundenportal-relaunch', index: 9 }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      harness.call('projects:resolveWaiting', { slug: 'hochbeet-bauen', index: 0 }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  // ── Vorschlag für den Stand ────────────────────────────────────────────────

  it('schlägt ohne Modell heuristisch vor und schreibt nichts', async () => {
    const before = await vault.read(WORK);

    const suggestion = await harness.call('projects:suggestStatus', {
      slug: 'kundenportal-relaunch',
    });

    expect(suggestion).not.toBeNull();
    /* Ein unerledigtes Warte-auf steht im Frontmatter — das ist der Beleg. */
    expect(suggestion?.status).toBe('waiting');
    expect(suggestion?.reason).toContain('Jonas');
    /* Der Vorschlag steht so schon im Projekt: er ist kein erfundener Satz. */
    expect(
      ((await vault.read(WORK)) ?? '').includes(suggestion?.nextStep.slice(0, 20) ?? 'x'),
    ).toBe(true);
    expect(await vault.read(WORK)).toBe(before);
  });

  it('nimmt den Vorschlag des Modells und schreibt ihn erst nach der Bestätigung', async () => {
    await harness.settings.setVaultSection('providers', [
      {
        id: 'local-1',
        label: 'Lokal',
        kind: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        hasKey: false,
        local: true,
        enabled: true,
        models: ['qwen2.5:14b'],
        createdAt: '2026-08-10T12:00:00.000Z',
      },
    ]);
    await harness.settings.setVaultSection('routing', {
      tasks: { 'project-status': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(() =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                status: 'paused',
                nextStep: 'Nach dem Release der Angebotsliste weitermachen',
                reason: 'Alle offenen Punkte hängen am Release.',
              }),
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fake.fetch);

    const suggestion = await harness.call('projects:suggestStatus', {
      slug: 'kundenportal-relaunch',
    });

    expect(fake.calls).toHaveLength(1);
    expect(suggestion?.status).toBe('paused');
    expect(suggestion?.nextStep).toBe('Nach dem Release der Angebotsliste weitermachen');
    /* Nichts geschrieben, solange niemand bestätigt hat. */
    expect(await vault.read(WORK)).toContain('status: active');

    await harness.call('projects:patch', {
      slug: 'kundenportal-relaunch',
      patch: { status: suggestion?.status, next_step: suggestion?.nextStep },
    });
    const raw = (await vault.read(WORK)) ?? '';
    expect(raw).toContain('status: paused');
    expect(raw).toContain('next_step: Nach dem Release der Angebotsliste weitermachen');
  });

  it('bleibt bei der Heuristik, wenn das Modell ausfällt', async () => {
    await harness.settings.setVaultSection('providers', [
      {
        id: 'local-1',
        label: 'Lokal',
        kind: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        hasKey: false,
        local: true,
        enabled: true,
        models: ['qwen2.5:14b'],
        createdAt: '2026-08-10T12:00:00.000Z',
      },
    ]);
    await harness.settings.setVaultSection('routing', {
      tasks: { 'project-status': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    vi.stubGlobal('fetch', createFetchFake(() => new Error('connect ECONNREFUSED')).fetch);

    const suggestion = await harness.call('projects:suggestStatus', {
      slug: 'hochbeet-bauen',
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.reason).toContain('Todos');
  });

  // ── Todos ──────────────────────────────────────────────────────────────────

  const openTodo = async (text: string) => {
    const todos = await harness.call('todos:list', { open: true });
    const found = todos.find((todo) => todo.text === text);
    expect(found, `Todo „${text}" nicht gefunden`).toBeDefined();
    return found as NonNullable<typeof found>;
  };

  it('hakt genau eine Zeile ab und setzt den @done:-Marker', async () => {
    const before = ((await vault.read(PRIVATE)) ?? '').split('\n');
    const todo = await openTodo('Noppenfolie innen anbringen');

    const toggled = await harness.call('todos:toggle', { id: todo.id });

    expect(toggled.state).toBe('done');
    expect(toggled.doneAt).toBe(TODAY);
    const after = ((await vault.read(PRIVATE)) ?? '').split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.filter((line, at) => line !== before[at]);
    expect(changed).toEqual([`- [x] Noppenfolie innen anbringen @done:${TODAY}`]);
  });

  it('nimmt das Häkchen wieder weg und entfernt den Marker', async () => {
    const todo = await openTodo('Bretter auf Länge sägen');
    const done = await harness.call('todos:toggle', { id: todo.id });
    expect(done.state).toBe('done');

    const back = await harness.call('todos:toggle', { id: done.id });

    expect(back.state).toBe('open');
    expect(back.doneAt).toBeNull();
    const raw = (await vault.read(PRIVATE)) ?? '';
    expect(raw).toContain('- [ ] Bretter auf Länge sägen @due:2026-08-10');
    expect(raw).not.toContain('@done:');
  });

  it('schreibt nicht, wenn die Zeile zwischenzeitlich von außen geändert wurde', async () => {
    const todo = await openTodo('Erde und Kompost holen');
    await vault.write(
      PRIVATE,
      ((await vault.read(PRIVATE)) ?? '').replace(
        '- [ ] Erde und Kompost holen',
        '- [x] Erde und Kompost holen @done:2026-08-09',
      ),
    );

    await expect(harness.call('todos:toggle', { id: todo.id })).rejects.toMatchObject({
      code: 'conflict',
    });
    /* Die fremde Änderung steht unverändert da. */
    expect(await vault.read(PRIVATE)).toContain('- [x] Erde und Kompost holen @done:2026-08-09');
  });

  it('legt ein Todo mit Frist in der Projektdatei an', async () => {
    const before = await harness.call('todos:list', { project: 'hochbeet-bauen' });
    const created = await harness.call('todos:create', {
      text: 'Schrauben nachkaufen',
      scope: 'private',
      project: 'hochbeet-bauen',
      due: '2026-08-12',
    });

    expect(created.text).toBe('Schrauben nachkaufen');
    expect(created.due).toBe('2026-08-12');
    expect(created.project).toBe('hochbeet-bauen');
    expect(created.state).toBe('open');
    expect(created.priority).toBe(2);
    const raw = (await vault.read(PRIVATE)) ?? '';
    expect(raw).toContain('- [ ] Schrauben nachkaufen @due:2026-08-12 !!');
    /* Unter „Todos", nicht am Dateiende. */
    expect(raw.indexOf('Schrauben nachkaufen')).toBeLessThan(raw.indexOf('## Notizen'));
    const after = await harness.call('todos:list', { project: 'hochbeet-bauen' });
    expect(after.slice(0, -1).map((todo) => todo.id)).toEqual(before.map((todo) => todo.id));
    expect(after.at(-1)?.id).toBe(created.id);
  });

  it('legt ein Todo ohne Projekt im heutigen Tageseintrag an', async () => {
    const created = await harness.call('todos:create', {
      text: 'Zahnarzttermin verschieben',
      scope: 'private',
      project: null,
      due: null,
    });

    expect(created.path).toBe(`journal/2026/08/${TODAY}.md`);
    expect(created.project).toBeNull();
    expect(created.scope).toBe('private');
    expect(await vault.read(created.path)).toContain('- [ ] Zahnarzttermin verschieben');
  });

  /* 024: `ensureDay` creates a *new* day file with the right-language "Facts"
     heading (here: no entry exists yet for tomorrow); a caller that then
     resolved the target section from a hardcoded German constant would
     append under a second, freshly created "## Fakten" instead of the
     "## Facts" `ensureDay` just wrote. */
  it('legt ein neues Tagesdatei-Todo unter der englischen Facts-Überschrift an, nicht unter einer zweiten deutschen', async () => {
    await harness.settings.setLanguages({ documents: 'en' });
    freezeTime(`${day(1)}T09:00:00+02:00`);

    const created = await harness.call('todos:create', {
      text: 'Reschedule dentist appointment',
      scope: 'private',
      project: null,
      due: null,
    });

    expect(created.path).toBe(`journal/2026/08/${day(1)}.md`);
    const raw = (await vault.read(created.path)) ?? '';
    expect(raw).toContain('## Facts');
    expect(raw).not.toContain('## Fakten');
    expect(raw.indexOf('Reschedule dentist appointment')).toBeGreaterThan(raw.indexOf('## Facts'));
  });

  /* 024: today's day file in the fixture already carries the German
     "## Fakten" heading — the setting must not win over a heading that is
     already there, or filing a todo would split it into two sections. */
  it('hängt ein Tagesdatei-Todo unter das bestehende „## Fakten" an, auch wenn die Dokumentsprache Englisch ist', async () => {
    await harness.settings.setLanguages({ documents: 'en' });

    const created = await harness.call('todos:create', {
      text: 'Reschedule dentist appointment',
      scope: 'private',
      project: null,
      due: null,
    });

    expect(created.path).toBe(`journal/2026/08/${TODAY}.md`);
    const raw = (await vault.read(created.path)) ?? '';
    expect(raw).toContain('## Fakten');
    expect(raw).not.toContain('## Facts');
    expect(raw.indexOf('Reschedule dentist appointment')).toBeGreaterThan(raw.indexOf('## Fakten'));
  });

  // ── Todos in Areas ─────────────────────────────────────────────────────────

  const AREA = 'areas/gesundheit.md';

  it('filtert die Todo-Liste nach Bereich', async () => {
    const todos = await harness.call('todos:list', { area: 'gesundheit' });

    expect(todos.map((todo) => todo.text).sort()).toEqual([
      'Schlafzeiten zwei Wochen mitgeschrieben',
      'Termin beim Physiotherapeuten machen',
    ]);
    expect(todos.every((todo) => todo.area === 'gesundheit')).toBe(true);
  });

  it('legt ein Todo im Todos-Abschnitt des Bereichs an, nicht im Tageseintrag', async () => {
    const created = await harness.call('todos:create', {
      text: 'Rückenschule buchen',
      scope: 'private',
      area: 'gesundheit',
    });

    expect(created.area).toBe('gesundheit');
    expect(created.project).toBeNull();
    expect(created.path).toBe(AREA);
    const raw = (await vault.read(AREA)) ?? '';
    expect(raw).toContain('- [ ] Rückenschule buchen');
    expect(raw.indexOf('Rückenschule buchen')).toBeGreaterThan(raw.indexOf('## Todos'));
    expect(raw.indexOf('Rückenschule buchen')).toBeLessThan(raw.indexOf('## Notizen'));
    /* Nicht im heutigen Tageseintrag gelandet. */
    const journalPath = `journal/2026/08/${TODAY}.md`;
    expect((await vault.read(journalPath)) ?? '').not.toContain('Rückenschule buchen');
  });

  it('verweigert das Anlegen, wenn Projekt und Bereich beide angegeben sind', async () => {
    await expect(
      harness.call('todos:create', {
        text: 'Doppelt zugeordnet',
        scope: 'private',
        project: 'hochbeet-bauen',
        area: 'gesundheit',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('meldet einen unbekannten Bereich als not-found', async () => {
    await expect(
      harness.call('todos:create', {
        text: 'Irgendwas',
        scope: 'private',
        area: 'nicht-vorhanden',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('hakt ein Bereichs-Todo ab und liest den neuen Hash mit', async () => {
    const created = await harness.call('todos:create', {
      text: 'Wasserflasche auffüllen',
      scope: 'private',
      area: 'gesundheit',
    });

    const toggled = await harness.call('todos:toggle', { id: created.id });

    expect(toggled.state).toBe('done');
    expect(toggled.doneAt).toBe(TODAY);
    expect((await vault.read(AREA)) ?? '').toContain(
      `- [x] Wasserflasche auffüllen !! @done:${TODAY}`,
    );
  });

  it('ändert Text eines Bereichs-Todos', async () => {
    const created = await harness.call('todos:create', {
      text: 'Vitamin D testen lassen',
      scope: 'private',
      area: 'gesundheit',
    });

    const updated = await harness.call('todos:update', {
      id: created.id,
      text: 'Vitamin-D-Spiegel testen lassen',
    });

    expect(updated.text).toBe('Vitamin-D-Spiegel testen lassen');
    expect((await vault.read(AREA)) ?? '').toContain('- [ ] Vitamin-D-Spiegel testen lassen');
  });

  it('verweigert das Umsortieren eines Bereichs-Todos', async () => {
    const created = await harness.call('todos:create', {
      text: 'Ergonomischen Stuhl bestellen',
      scope: 'private',
      area: 'gesundheit',
    });

    await expect(harness.call('todos:reorder', { ids: [created.id] })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('ändert die Frist inline und behält alle übrigen Marker', async () => {
    const todo = await openTodo('Fallback für abgelaufene Sitzungen bauen');

    const updated = await harness.call('todos:update', { id: todo.id, due: '2026-08-20' });

    expect(updated.due).toBe('2026-08-20');
    expect(updated.waitingFor).toBe('Jonas');
    expect(updated.neededBy).toBe('2026-08-12');
    expect(await vault.read(WORK)).toContain(
      '- [ ] Fallback für abgelaufene Sitzungen bauen @wait:Jonas @needed:2026-08-12 @due:2026-08-20',
    );
  });

  it('ändert den Text und lässt Frist und Priorität stehen', async () => {
    const todo = await openTodo('Ladezeiten der Angebotsliste unter 1,5 s bringen');

    const updated = await harness.call('todos:update', {
      id: todo.id,
      text: 'Ladezeiten der Angebotsliste messen und senken',
    });

    expect(updated.text).toBe('Ladezeiten der Angebotsliste messen und senken');
    expect(updated.due).toBe('2026-08-08');
    expect(updated.priority).toBe(2);
    expect(await vault.read(WORK)).toContain(
      '- [ ] Ladezeiten der Angebotsliste messen und senken @due:2026-08-08 !!',
    );
  });

  it('ändert Text, Frist und Priorität in einem Schreibvorgang', async () => {
    const todo = await openTodo('Noppenfolie innen anbringen');

    const updated = await harness.call('todos:update', {
      id: todo.id,
      text: 'Noppenfolie sauber befestigen',
      due: '2026-08-14',
      priority: 3,
    });

    expect(updated).toMatchObject({
      text: 'Noppenfolie sauber befestigen',
      due: '2026-08-14',
      priority: 3,
    });
    expect(await vault.read(PRIVATE)).toContain(
      '- [ ] Noppenfolie sauber befestigen @due:2026-08-14 !!!',
    );
  });

  it('sortiert alle Todos einer Projektdatei und lässt den übrigen Inhalt stehen', async () => {
    const todos = await harness.call('todos:list', { project: 'hochbeet-bauen' });
    const ids = todos.map((todo) => todo.id).reverse();
    const before = (await vault.read(PRIVATE)) ?? '';

    const reordered = await harness.call('todos:reorder', { ids });
    const after = (await vault.read(PRIVATE)) ?? '';

    expect(reordered.map((todo) => todo.id)).toEqual(ids);
    expect(after.indexOf('Erde und Kompost holen')).toBeLessThan(
      after.indexOf('Noppenfolie innen anbringen'),
    );
    expect(after).toContain('## Notizen');
    expect(after.slice(after.indexOf('## Notizen'))).toBe(
      before.slice(before.indexOf('## Notizen')),
    );
  });

  it('verweigert das Umsortieren nach einer externen Änderung', async () => {
    const todos = await harness.call('todos:list', { project: 'hochbeet-bauen' });
    await vault.write(
      PRIVATE,
      ((await vault.read(PRIVATE)) ?? '').replace(
        '- [ ] Noppenfolie innen anbringen',
        '- [ ] Noppenfolie exakt zuschneiden',
      ),
    );

    await expect(
      harness.call('todos:reorder', { ids: todos.map((todo) => todo.id).reverse() }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await vault.read(PRIVATE)).toContain('Noppenfolie exakt zuschneiden');
  });

  it('verlangt einen offenen Vault', async () => {
    await harness.services.closeVault();
    await expect(harness.call('projects:list', {})).rejects.toMatchObject({ code: 'no-vault' });
    await expect(harness.call('todos:list', {})).rejects.toMatchObject({ code: 'no-vault' });
  });
});
