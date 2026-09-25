/**
 * Realistic-scale perf test with real persistence (D7, story 054).
 *
 * Uses a real folder under `os.tmpdir()` and real disk I/O throughout — no
 * `MemoryVaultStore`, no fakes. This is what `tests/core/index/build.test.ts`'s
 * 5,000-doc test does not cover: it never persists, so it says nothing about
 * `IndexService.open()`'s warm-start skip or a path-scoped `refresh()`'s actual
 * write volume. Both are pinned here against a vault shaped like a real one:
 * a year of journal days, two hundred longer transcripts, a few hundred notes
 * and todos.
 *
 * Budgets are ~3x the locally measured numbers (see the comment next to each) —
 * enough headroom for a slower CI box without hiding a real regression.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyBucket } from '@core/index/persist';
import { IndexService } from '@core/index/service';
import { byteLength, ensureStructure, FsVaultStore } from '@core/vault';
import type { WriteResult } from '@shared/types';
import type { WriteTextOptions } from '@core/vault/types';

// measured locally: 15 046ms
const COLD_OPEN_BUDGET_MS = 45_000;
// measured locally: 540ms
const WARM_OPEN_BUDGET_MS = 1_700;
// measured locally: 33ms
const REFRESH_BUDGET_MS = 150;
// measured locally: 8 276ms
const MAX_EVENT_LOOP_GAP_BUDGET_MS = 25_000;

const JOURNAL_DAYS = 365;
const TRANSCRIPTS = 200;
const NOTES = 300;

/** `FsVaultStore` that counts the bytes every `writeText` call actually writes. */
class CountingFsVaultStore extends FsVaultStore {
  writtenBytes = 0;

  override async writeText(
    path: string,
    content: string,
    options?: WriteTextOptions,
  ): Promise<WriteResult> {
    this.writtenBytes += byteLength(content);
    return super.writeText(path, content, options);
  }

  resetCounters(): void {
    this.writtenBytes = 0;
  }
}

/** Pads `base` with filler words until the text reaches roughly `targetBytes`. */
function padTo(base: string, targetBytes: number): string {
  let text = base;
  let word = 0;
  while (byteLength(text) < targetBytes) {
    text += ` wort${word} zum thema und seinen einzelheiten und randbemerkungen`;
    word += 1;
  }
  return text;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function journalDate(dayIndex: number): { iso: string; year: string; month: string } {
  const start = new Date(Date.UTC(2025, 0, 1));
  const date = new Date(start.getTime() + dayIndex * 86_400_000);
  return {
    iso: `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    year: String(date.getUTCFullYear()),
    month: pad2(date.getUTCMonth() + 1),
  };
}

function journalPathFor(dayIndex: number): string {
  const { iso, year, month } = journalDate(dayIndex);
  return `journal/${year}/${month}/${iso}.md`;
}

function journalContent(dayIndex: number): string {
  const { iso } = journalDate(dayIndex);
  const todo =
    dayIndex % 3 === 0 ? `\n- [ ] Rueckmeldung zu Tag ${dayIndex} einholen @due:2026-12-31\n` : '';
  return [
    '---',
    'type: journal',
    `date: ${iso}`,
    'tags: [perf]',
    '---',
    '',
    '## Day',
    '',
    padTo(`Eintrag fuer ${iso}. `, 2_800),
    todo,
    '',
  ].join('\n');
}

function transcriptPath(index: number): string {
  const id = String(index).padStart(4, '0');
  return `raw/files/2025-06-01-transcript-${id}/transcript.md`;
}

function transcriptContent(index: number): string {
  return [
    '---',
    'type: note',
    `title: Transkript ${index}`,
    '---',
    '',
    padTo(`Transkript-Inhalt Nummer ${index}. `, 250_000),
    '',
  ].join('\n');
}

function notePath(index: number): string {
  const id = String(index).padStart(4, '0');
  return `notes/notiz-${id}.md`;
}

function noteContent(index: number): string {
  const todo = `\n- [ ] Notiz ${index} durchsehen @due:2026-12-31\n`;
  return [
    '---',
    'type: note',
    `title: Notiz ${index}`,
    '---',
    '',
    padTo(`Notizinhalt Nummer ${index}. `, 900),
    todo,
    '',
  ].join('\n');
}

async function writeDirect(root: string, path: string, content: string): Promise<void> {
  const absolute = join(root, ...path.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, 'utf8');
}

/**
 * A journal path whose body bucket is otherwise as light as possible — bodies of
 * every document sharing a bucket get rewritten together (persist.ts groups by
 * `bodyBucket`), so picking one at random risks landing next to a large transcript
 * purely by hash coincidence and measuring that collision instead of the refresh
 * path itself.
 */
function lightestBucketJournalPath(docs: readonly { path: string; body: string }[]): string {
  const bucketBytes = new Map<string, number>();
  for (const doc of docs) {
    const bucket = bodyBucket(doc.path);
    bucketBytes.set(bucket, (bucketBytes.get(bucket) ?? 0) + byteLength(doc.body));
  }
  let best: string | null = null;
  let bestBytes = Number.POSITIVE_INFINITY;
  for (const doc of docs) {
    if (!doc.path.startsWith('journal/')) continue;
    const bytes = bucketBytes.get(bodyBucket(doc.path)) ?? Number.POSITIVE_INFINITY;
    if (bytes < bestBytes) {
      bestBytes = bytes;
      best = doc.path;
    }
  }
  if (best === null) throw new Error('no journal document found');
  return best;
}

describe('IndexService: realistic perf budget', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'sb-perf-'));
    const setupStore = new FsVaultStore(root);
    await ensureStructure(setupStore, { name: 'Perfvault', now: new Date('2025-01-01T08:00:00Z') });

    for (let i = 0; i < JOURNAL_DAYS; i += 1) {
      await writeDirect(root, journalPathFor(i), journalContent(i));
    }
    for (let i = 0; i < TRANSCRIPTS; i += 1) {
      await writeDirect(root, transcriptPath(i), transcriptContent(i));
    }
    for (let i = 0; i < NOTES; i += 1) {
      await writeDirect(root, notePath(i), noteContent(i));
    }
  }, 120_000);

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('a realistic vault stays within the index budget', async () => {
    // ── Cold open: build + persist, with a max-event-loop-gap probe. ────────
    let lastTick = Date.now();
    let maxGap = 0;
    const probe = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick;
      if (gap > maxGap) maxGap = gap;
      lastTick = now;
    }, 10);

    const coldStore = new CountingFsVaultStore(root);
    const coldStart = Date.now();
    const coldService = await IndexService.open(coldStore);
    const coldOpenMs = Date.now() - coldStart;
    clearInterval(probe);

    const totalBodyBytes = coldService
      .index()
      .docs.reduce((sum, doc) => sum + byteLength(doc.body), 0);
    expect(totalBodyBytes).toBeGreaterThan(0);

    // ── Warm open: unchanged vault, must write nothing. ─────────────────────
    const warmStore = new CountingFsVaultStore(root);
    const warmStart = Date.now();
    const warmService = await IndexService.open(warmStore);
    const warmOpenMs = Date.now() - warmStart;
    expect(warmStore.writtenBytes).toBe(0);

    // ── Scoped refresh of one edited journal day. ───────────────────────────
    const editedJournalPath = lightestBucketJournalPath(coldService.index().docs);
    const absoluteEdited = join(root, ...editedJournalPath.split('/'));
    const original = await readFile(absoluteEdited, 'utf8');
    await writeFile(
      absoluteEdited,
      `${original}\n- [ ] Neu nach der Bearbeitung @due:2026-12-31\n`,
      'utf8',
    );
    warmStore.resetCounters();

    const refreshStart = Date.now();
    await warmService.refresh([editedJournalPath]);
    const refreshMs = Date.now() - refreshStart;
    const refreshBytes = warmStore.writtenBytes;

    await coldService.dispose();
    await warmService.dispose();

    // ── Assertions ───────────────────────────────────────────────────────────
    expect(coldOpenMs).toBeLessThan(COLD_OPEN_BUDGET_MS);
    expect(warmOpenMs).toBeLessThan(WARM_OPEN_BUDGET_MS);
    expect(refreshMs).toBeLessThan(REFRESH_BUDGET_MS);
    expect(maxGap).toBeLessThan(MAX_EVENT_LOOP_GAP_BUDGET_MS);
    expect(refreshBytes).toBeGreaterThan(0);
    expect(refreshBytes).toBeLessThan(totalBodyBytes * 0.01);
  }, 120_000);
});
