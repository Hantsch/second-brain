/* The area channels in the main process — on real files, without a network.
 *
 * This is the story's only new write path into the user's own files, so what the
 * tests here are really about is what must *not* happen: a note that exists
 * twice after a move, a note that exists nowhere, a line of the file rewritten
 * that nobody asked about, a write on top of somebody else's change.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaNoteBlock } from '@core/areas';
import { removeBlock } from '@core/capture';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { VaultStoreLike } from '../../src/main/contracts';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { TODAY, freezeTime } from '../helpers/time';

/* No Electron in tests: no windows, no encryption. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const AREA = 'areas/gesundheit.md';
const DEFAULT_AREA = 'areas/notes.md';
/** The older of the two entries the fixture carries, verbatim. */
const OLD_ENTRY = [
  '### 2026-07-28',
  '',
  'Der Rücken meldet sich vor allem bei langen Sitzungen. Kurze Pausen alle 45 Minuten',
  'haben mehr gebracht als jede neue Übung.',
].join('\n');

type StoreWrap = (store: VaultStoreLike) => VaultStoreLike;

async function createHarness(userDataDir: string, wrap?: StoreWrap) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { areaHandlers } = await import('../../src/main/ipc/areas');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => {
    const real = new FsVaultStore(root);
    return wrap === undefined ? real : wrap(real);
  });
  /* No watcher: the index catches up via `settle()` in the handler — which is
     exactly what is being checked. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = { ...areaHandlers(services) };
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

describe('area channels in main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  /** The hash a client would have read — the basis of every guarded write. */
  const hashOf = async (path: string): Promise<string> => {
    const doc = await vault.store.read(path);
    expect(doc, path).not.toBeNull();
    return doc?.hash ?? '';
  };

  const countOf = (text: string, needle: string): number => text.split(needle).length - 1;

  beforeEach(async () => {
    /* The date subheading of a note hangs on the calendar day — it has to stand
       still, or tomorrow this test would check something else. */
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-areas-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  // ── Reading ────────────────────────────────────────────────────────────────

  it('lists the areas of the vault with their notes', async () => {
    const areas = await harness.call('areas:list', undefined);

    const health = areas.find((area) => area.slug === 'gesundheit');
    expect(health?.path).toBe(AREA);
    expect(health?.title).toBe('Gesundheit');
    expect(health?.noteCount).toBe(2);
    expect(health?.openTodoCount).toBe(1);
    expect(health?.hash).toBe(await hashOf(AREA));
  });

  /* The list carries the preview — `excerpt()` folds the entry into one line and
     strips its markup. This channel is where the entry itself comes from. */
  it('hands out the full entry, not the preview', async () => {
    const listed = (await harness.call('areas:list', undefined)).find(
      (area) => area.slug === 'gesundheit',
    );
    const notes = await harness.call('areas:notes', { slug: 'gesundheit' });

    const july = notes.find((note) => note.day === '2026-07-28');
    expect(july?.excerpt).toBe(OLD_ENTRY.split('\n').slice(2).join('\n'));
    /* The preview of the same entry is a single folded line — proof that the two
       channels really do answer different questions. */
    const preview = listed?.notes.find((note) => note.day === '2026-07-28')?.excerpt ?? '';
    expect(preview).not.toContain('\n');
    expect(july?.excerpt).toContain('\n');
    /* The line points at the heading in the file, counted from line 1. */
    const lines = ((await vault.read(AREA)) ?? '').split('\n');
    expect(lines[(july?.line ?? 0) - 1]).toBe('### 2026-07-28');
  });

  it('says that an area it does not have does not exist', async () => {
    await expect(harness.call('areas:notes', { slug: 'gibt-es-nicht' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  // ── Writing a note ─────────────────────────────────────────────────────────

  it('appends a note and leaves the rest of the file character for character', async () => {
    const before = await vault.store.read(AREA);
    const block = areaNoteBlock('Physio hat drei Übungen für den Morgen mitgegeben.');

    const result = await harness.call('areas:createNote', {
      text: 'Physio hat drei Übungen für den Morgen mitgegeben.',
      area: 'gesundheit',
    });

    expect(result.path).toBe(AREA);
    expect(result.hash).toBe(await hashOf(AREA));
    const after = await vault.store.read(AREA);
    expect(after?.body).toContain(`### ${TODAY}`);
    expect(after?.body).toContain('Physio hat drei Übungen für den Morgen mitgegeben.');
    /* Nothing else moved: take the new block back out and the file is the old
       one again — frontmatter, both old entries, the todos included. */
    expect(removeBlock(after?.body ?? '', block)).toBe(before?.body);
    expect(await vault.read(AREA)).toContain('- [ ] Termin beim Physiotherapeuten machen');

    /* And the note is readable again in full, through the read path. */
    const notes = await harness.call('areas:notes', { slug: 'gesundheit' });
    expect(notes).toHaveLength(3);
    expect(notes.find((note) => note.day === TODAY)?.excerpt).toBe(
      'Physio hat drei Übungen für den Morgen mitgegeben.',
    );
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [AREA],
      external: false,
    });
  });

  it('refuses a note with a stale hash and writes nothing', async () => {
    const stale = await hashOf(AREA);
    await harness.call('areas:createNote', { text: 'Erste Notiz', area: 'gesundheit' });
    const between = await vault.read(AREA);

    await expect(
      harness.call('areas:createNote', {
        text: 'Zweite Notiz auf veraltetem Stand',
        area: 'gesundheit',
        expectedHash: stale,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(AREA)).toBe(between);
    expect(await vault.read(AREA)).not.toContain('Zweite Notiz auf veraltetem Stand');
  });

  it('refuses an empty note', async () => {
    await expect(
      harness.call('areas:createNote', { text: '   \n  ', area: 'gesundheit' }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  // ── The default area ───────────────────────────────────────────────────────

  it('creates the default area on first use and appends to it on the second', async () => {
    expect(await vault.exists(DEFAULT_AREA)).toBe(false);

    const created = await harness.call('areas:createNote', { text: 'Ein Gedanke ohne Zuhause' });

    expect(created.path).toBe(DEFAULT_AREA);
    expect(created.created).toBe(true);
    const first = (await vault.read(DEFAULT_AREA)) ?? '';
    expect(first).toContain('type: area');
    expect(first).toContain('title: Notizen');
    expect(first).toContain('scope: private');
    expect(first).toContain(`created: ${TODAY}`);
    expect(first).toContain('## Notizen');
    expect(first).toContain('## Todos');
    expect(first).toContain(`### ${TODAY}`);
    expect(first).toContain('Ein Gedanke ohne Zuhause');

    const second = await harness.call('areas:createNote', { text: 'Und noch einer' });

    expect(second.path).toBe(DEFAULT_AREA);
    const raw = (await vault.read(DEFAULT_AREA)) ?? '';
    expect(raw).toContain('Ein Gedanke ohne Zuhause');
    expect(raw).toContain('Und noch einer');
    /* One file, one notes section — not a second one below it. */
    expect(countOf(raw, '## Notizen')).toBe(1);
    const areas = await harness.call('areas:list', undefined);
    expect(areas.filter((area) => area.slug === 'notes')).toHaveLength(1);
    expect(areas.find((area) => area.slug === 'notes')?.noteCount).toBe(2);
  });

  // ── Creating an area ───────────────────────────────────────────────────────

  it('creates an area according to VAULT-FORMAT.md and has it in the list right away', async () => {
    const created = await harness.call('areas:create', { title: 'Haus und Garten' });

    expect(created.slug).toBe('haus-und-garten');
    expect(created.path).toBe('areas/haus-und-garten.md');
    expect(created.scope).toBe('private');
    expect(created.noteCount).toBe(0);
    expect(created.notes).toEqual([]);
    const raw = (await vault.read(created.path)) ?? '';
    expect(raw).toContain('type: area');
    expect(raw).toContain('title: Haus und Garten');
    expect(raw).toContain('lang: de');
    expect(raw).toContain('## Notizen');
    expect(raw).toContain('## Todos');
    expect(created.hash).toBe(await hashOf(created.path));
    const areas = await harness.call('areas:list', undefined);
    expect(areas.map((area) => area.slug)).toContain('haus-und-garten');
  });

  it('does not create a second area over an existing one', async () => {
    const before = await vault.read(AREA);

    await expect(harness.call('areas:create', { title: 'Gesundheit' })).rejects.toMatchObject({
      code: 'conflict',
    });

    expect(await vault.read(AREA)).toBe(before);
  });

  it('refuses an area without a title', async () => {
    await expect(harness.call('areas:create', { title: '  ' })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  // ── Moving a note ──────────────────────────────────────────────────────────

  /** A second area, plus the line of the fixture's older entry. */
  const prepareMove = async (): Promise<{ line: number; hash: string; target: string }> => {
    const target = await harness.call('areas:create', { title: 'Haus' });
    const notes = await harness.call('areas:notes', { slug: 'gesundheit' });
    const july = notes.find((note) => note.day === '2026-07-28');
    expect(july).toBeDefined();
    return { line: july?.line ?? 0, hash: await hashOf(AREA), target: target.path };
  };

  it('moves a note and leaves no copy behind', async () => {
    const { line, hash, target } = await prepareMove();
    const before = (await vault.read(AREA)) ?? '';

    const result = await harness.call('areas:moveNote', {
      from: 'gesundheit',
      to: 'haus',
      line,
      expectedHash: hash,
    });

    const source = (await vault.read(AREA)) ?? '';
    const arrived = (await vault.read(target)) ?? '';
    /* Gone from the source, exactly once in the target — and character for
       character the block that stood in the source before. */
    expect(source).not.toContain('### 2026-07-28');
    expect(source).not.toContain('Kurze Pausen alle 45 Minuten');
    expect(countOf(arrived, OLD_ENTRY)).toBe(1);
    /* The rest of the source is untouched: the other entry, the todos, the
       frontmatter. */
    expect(source).toContain('### 2026-08-04');
    expect(source).toContain('- [ ] Termin beim Physiotherapeuten machen');
    expect(source.slice(0, before.indexOf('## Notizen'))).toBe(
      before.slice(0, before.indexOf('## Notizen')),
    );
    expect(result.from.hash).toBe(await hashOf(AREA));
    expect(result.to.hash).toBe(await hashOf(target));
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [AREA, target],
      external: false,
    });
  });

  it('refuses to move on a stale hash and touches neither file', async () => {
    const { line, target } = await prepareMove();
    const source = await vault.read(AREA);
    const arrived = await vault.read(target);

    await expect(
      harness.call('areas:moveNote', {
        from: 'gesundheit',
        to: 'haus',
        line,
        expectedHash: 'von-vorgestern',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    expect(await vault.read(AREA)).toBe(source);
    expect(await vault.read(target)).toBe(arrived);
  });

  it('refuses to move into an area that does not exist', async () => {
    const notes = await harness.call('areas:notes', { slug: 'gesundheit' });
    const before = await vault.read(AREA);

    await expect(
      harness.call('areas:moveNote', {
        from: 'gesundheit',
        to: 'gibt-es-nicht',
        line: notes[0]?.line ?? 1,
        expectedHash: await hashOf(AREA),
      }),
    ).rejects.toMatchObject({ code: 'not-found' });

    expect(await vault.read(AREA)).toBe(before);
  });

  it('says no to a line that carries no note', async () => {
    await harness.call('areas:create', { title: 'Haus' });

    await expect(
      harness.call('areas:moveNote', {
        from: 'gesundheit',
        to: 'haus',
        line: 1,
        expectedHash: await hashOf(AREA),
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  /* A hand-written note without its own date heading: where it ends is a guess,
     and guessing wrong would move the wrong text out of the user's file. */
  it('says no to a note without a date heading instead of guessing its end', async () => {
    await vault.write(
      'areas/lesen.md',
      [
        '---',
        'type: area',
        'title: Lesen',
        'scope: private',
        'created: 2026-05-01',
        '---',
        '',
        '## Notizen',
        '',
        'Ein Absatz, den ich selbst hier hineingeschrieben habe.',
        '',
        '### 2026-08-01',
        '',
        'Ein datierter Eintrag.',
        '',
      ].join('\n'),
    );
    const before = await vault.read('areas/lesen.md');
    const notes = await harness.call('areas:notes', { slug: 'lesen' });
    const lead = notes.find((note) => note.heading === null);
    expect(lead?.excerpt).toBe('Ein Absatz, den ich selbst hier hineingeschrieben habe.');

    await expect(
      harness.call('areas:moveNote', {
        from: 'lesen',
        to: 'gesundheit',
        line: lead?.line ?? 0,
        expectedHash: await hashOf('areas/lesen.md'),
      }),
    ).rejects.toMatchObject({ code: 'invalid' });

    expect(await vault.read('areas/lesen.md')).toBe(before);
  });

  it('refuses a move onto the area the note already sits in', async () => {
    const notes = await harness.call('areas:notes', { slug: 'gesundheit' });

    await expect(
      harness.call('areas:moveNote', {
        from: 'gesundheit',
        to: 'gesundheit',
        line: notes[0]?.line ?? 1,
        expectedHash: await hashOf(AREA),
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('requires an open vault', async () => {
    await harness.services.closeVault();
    await expect(harness.call('areas:list', undefined)).rejects.toMatchObject({
      code: 'no-vault',
    });
  });
});

/* The rollback: the source file has to come back exactly as it was when the
   second write fails. The append is the step that has to fail for that, and it
   cannot be made to fail from outside mid-handler — so here the real store is
   used with exactly that one method replaced. Everything else in the run is the
   genuine article: real files, real hashes, the real handler. */
describe('a failed move leaves the note where it was', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-areas-fail-'));
    harness = await createHarness(userDataDir, (store) =>
      Object.assign(Object.create(store) as VaultStoreLike, {
        append: () => Promise.reject(new Error('Anhängen ist fehlgeschlagen')),
      }),
    );
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  it('takes the removal back when the target cannot be written', async () => {
    const target = await harness.call('areas:create', { title: 'Haus' });
    const notes = await harness.call('areas:notes', { slug: 'gesundheit' });
    const july = notes.find((note) => note.day === '2026-07-28');
    const source = await vault.read(AREA);
    const arrived = await vault.read(target.path);

    await expect(
      harness.call('areas:moveNote', {
        from: 'gesundheit',
        to: 'haus',
        line: july?.line ?? 0,
        expectedHash: (await vault.store.read(AREA))?.hash ?? '',
      }),
      /* The append is the failing step, so this error proves the run really got
         past the removal — and the file below proves it was taken back. */
    ).rejects.toThrow('Anhängen ist fehlgeschlagen');

    /* Character for character the file from before — the note is still there,
       exactly once, and nothing landed in the target. */
    expect(await vault.read(AREA)).toBe(source);
    expect(await vault.read(target.path)).toBe(arrived);
  });
});
