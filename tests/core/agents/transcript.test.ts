/* Tests for the paged transcript assembly (story 001, deliverable D8).
 *
 * Three things are being proven here, and the third is the reason this module
 * exists at all:
 *   1. both formats map onto the same `TranscriptEntry` rows, split correctly
 *      (text vs. collapsed tool call vs. tool result) and with reasoning,
 *      bookkeeping and duplicate event records absent;
 *   2. walking the cursor to its end yields exactly the entries the file holds,
 *      in order, no matter where the page boundaries fell;
 *   3. **no page ever asks the filesystem for more than the page budget.** A
 *      naive `readFile()`-then-`split('\n')` implementation would satisfy 1 and 2
 *      on small fixtures and still freeze the app on a multi-megabyte session —
 *      so the read log of the fake filesystem is asserted directly.
 */

import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRANSCRIPT_PAGE_BYTES, readTranscriptPage } from '@core/agents';
import type { TranscriptSource } from '@core/agents';
import { nodeClaudeFileSystem } from '@core/claude';
import type { ClaudeFileInfo, ClaudeRecord } from '@core/claude';
import type { TranscriptEntry, TranscriptPage } from '@shared/types';
import { fixturePath } from '../../fixtures';
import {
  assistant,
  bookkeeping,
  fakeClaudeFs,
  jsonl,
  prompt,
  toolResult,
} from '../claude/fixtures';
import type { FakeClaudeFs } from '../claude/fixtures';

const DIR = 'c--development-Hantsch-second-brain';
const NAME = 'session.jsonl';
const PATH = `/claude/projects/${DIR}/${NAME}`;

/** A single in-memory session file plus the read-logging adapter over it. */
function claudeSession(text: string): { fs: FakeClaudeFs; source: TranscriptSource } {
  const fs = fakeClaudeFs({
    files: [{ dir: DIR, name: NAME, text, modified: '2026-08-12T10:00:00.000Z' }],
  });
  return {
    fs,
    source: {
      agent: 'claude',
      file: {
        path: PATH,
        name: NAME,
        size: Buffer.byteLength(text, 'utf8'),
        modified: '2026-08-12T10:00:00.000Z',
      },
    },
  };
}

function fileInfo(path: string): ClaudeFileInfo {
  const stat = statSync(path);
  return { path, name: basename(path), size: stat.size, modified: stat.mtime.toISOString() };
}

/** The shape entries are compared by — ids carry a page offset, so they are checked separately. */
interface Row {
  kind: string;
  text: string | null;
  toolName: string | null;
}

function rows(entries: readonly TranscriptEntry[]): Row[] {
  return entries.map((item) => ({ kind: item.kind, text: item.text, toolName: item.toolName }));
}

/** Walk every page, following the cursor exactly as a caller would. */
async function walk(
  fs: FakeClaudeFs,
  source: TranscriptSource,
  pageBytes?: number,
): Promise<{ pages: TranscriptPage[] }> {
  const pages: TranscriptPage[] = [];
  let cursor: string | null = null;
  // Guard against a paging bug turning the test itself into the freeze it hunts.
  for (let guard = 0; guard < 500; guard += 1) {
    const page = await readTranscriptPage(
      fs,
      source,
      cursor,
      pageBytes === undefined ? {} : { pageBytes },
    );
    pages.push(page);
    if (page.nextCursor === null) return { pages };
    cursor = page.nextCursor;
  }
  throw new Error('paging did not terminate');
}

describe('readTranscriptPage — Claude', () => {
  it('splits a record with text and a tool call into separate rows, skips bookkeeping', async () => {
    const meta: ClaudeRecord = {
      type: 'user',
      uuid: 'meta-1',
      timestamp: '2026-08-12T09:59:00.000Z',
      isMeta: true,
      message: { role: 'user', content: [{ type: 'text', text: 'Caveat: local command output' }] },
    };
    const text = jsonl([
      meta,
      prompt('Read the transcript module and tell me what it does.', {
        at: '2026-08-12T10:00:00.000Z',
      }),
      assistant('Reading it now.', {
        at: '2026-08-12T10:00:05.000Z',
        file: 'c:\\development\\Hantsch\\second-brain\\src\\core\\agents\\transcript.ts',
      }),
      toolResult('2026-08-12T10:00:06.000Z', 'a-2026-08-12T10:00:05.000Z'),
      bookkeeping('2026-08-12T10:00:07.000Z'),
    ]);
    const { fs, source } = claudeSession(text);

    const page = await readTranscriptPage(fs, source, null);

    expect(rows(page.entries)).toEqual([
      {
        kind: 'user',
        text: 'Read the transcript module and tell me what it does.',
        toolName: null,
      },
      { kind: 'assistant', text: 'Reading it now.', toolName: null },
      { kind: 'tool-call', text: null, toolName: 'Read' },
      { kind: 'tool-result', text: null, toolName: null },
    ]);
    // The collapsed call keeps its target and the full block for expanding later.
    expect(page.entries[2]?.toolTarget).toBe(
      'c:\\development\\Hantsch\\second-brain\\src\\core\\agents\\transcript.ts',
    );
    expect(page.entries[2]?.raw).toMatchObject({ type: 'tool_use', name: 'Read' });
    expect(page.entries[2]?.at).toBe('2026-08-12T10:00:05.000Z');
    // One page covered the file, so the total is honestly known.
    expect(page.nextCursor).toBeNull();
    expect(page.totalKnown).toBe(true);
  });

  it('keeps reading past a line that is not JSON', async () => {
    const text = [
      JSON.stringify(prompt('First', { at: '2026-08-12T10:00:00.000Z' })),
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","te',
      JSON.stringify(assistant('Second', { at: '2026-08-12T10:00:09.000Z' })),
      '',
    ].join('\n');
    const { fs, source } = claudeSession(text);

    const page = await readTranscriptPage(fs, source, null);

    expect(rows(page.entries)).toEqual([
      { kind: 'user', text: 'First', toolName: null },
      { kind: 'assistant', text: 'Second', toolName: null },
    ]);
  });
});

describe('readTranscriptPage — Codex', () => {
  const SESSION = fixturePath(
    'codex',
    'sessions',
    '2026',
    '08',
    '12',
    'rollout-2026-08-12T09-15-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl',
  );

  it('reads the D3 fixture: reasoning dropped, tool traffic typed, no duplicated prompt', async () => {
    const fs = nodeClaudeFileSystem();
    const source: TranscriptSource = { agent: 'codex', file: fileInfo(SESSION) };

    const page = await readTranscriptPage(fs, source, null);

    expect(rows(page.entries)).toEqual([
      {
        kind: 'user',
        text: 'Add a function to compute cart totals with tax, then run the tests.',
        toolName: null,
      },
      { kind: 'tool-call', text: null, toolName: 'shell' },
      { kind: 'tool-result', text: null, toolName: null },
      { kind: 'tool-call', text: null, toolName: 'apply_patch' },
      { kind: 'tool-result', text: null, toolName: null },
      {
        kind: 'assistant',
        text:
          'Added computeCartTotal() in src/cart/totals.ts with an 8% tax rate applied to the ' +
          'subtotal, and confirmed the cart test suite still passes (5 passed).',
        toolName: null,
      },
    ]);
    // The fixture's `reasoning` record and its `event_msg`/`user_message` echo of
    // the prompt are both absent above — exactly one user row, no thinking row.
    expect(page.entries.filter((item) => item.kind === 'user')).toHaveLength(1);
    expect(page.entries.map((item) => item.text).join(' ')).not.toContain('Plan: add');
    // Tool calls collapse to one readable line and pair by `call_id`.
    expect(page.entries[1]?.toolTarget).toBe('bash -lc npm test -- cart');
    expect(page.entries[1]?.id).toBe('call_1');
    expect(page.entries[2]?.id).toBe('call_1:out');
    expect(page.entries[3]?.toolTarget).toContain('src/cart/totals.ts');
    expect(page.nextCursor).toBeNull();
    expect(page.totalKnown).toBe(true);
  });

  it('reports the empty fixture as nothing, not as an error', async () => {
    const empty = fixturePath(
      'codex',
      'sessions',
      '2026',
      '08',
      '12',
      'rollout-2026-08-12T14-05-00-99999999-8888-7777-6666-555555555555.jsonl',
    );
    const page = await readTranscriptPage(nodeClaudeFileSystem(), {
      agent: 'codex',
      file: fileInfo(empty),
    });

    expect(page).toEqual({ entries: [], nextCursor: null, totalKnown: true });
  });
});

/**
 * The multi-page walk. The expected rows are built by the generator below, in the
 * same loop that writes the file — an oracle independent of the module under
 * test, so the comparison proves equivalence rather than self-consistency.
 */
interface Generated {
  text: string;
  expected: Row[];
}

function longClaudeSession(targetBytes: number): Generated {
  const base = Date.parse('2026-08-12T10:00:00.000Z');
  const filler = 'Working through the vault format, section by section, with care.'.repeat(6);
  const lines: string[] = [];
  const expected: Row[] = [];
  let bytes = 0;
  for (let turn = 0; bytes < targetBytes; turn += 1) {
    const at = new Date(base + turn * 1000).toISOString();
    const askedAt = new Date(base + turn * 1000 + 1).toISOString();
    const question = `Question ${turn}. ${filler}`;
    const answer = `Answer ${turn}. ${filler}`;
    const records = [
      prompt(question, { at }),
      assistant(answer, {
        at: askedAt,
        file: `c:\\development\\Hantsch\\second-brain\\src\\core\\file-${turn}.ts`,
      }),
      toolResult(new Date(base + turn * 1000 + 2).toISOString(), `a-${askedAt}`),
      bookkeeping(new Date(base + turn * 1000 + 3).toISOString()),
    ];
    expected.push(
      { kind: 'user', text: question, toolName: null },
      { kind: 'assistant', text: answer, toolName: null },
      { kind: 'tool-call', text: null, toolName: 'Read' },
      { kind: 'tool-result', text: null, toolName: null },
    );
    const block = jsonl(records);
    lines.push(block);
    bytes += Buffer.byteLength(block, 'utf8');
  }
  return { text: lines.join(''), expected };
}

describe('readTranscriptPage — paging', () => {
  it('walks a multi-page Claude session and yields exactly the file’s entries', async () => {
    const { text, expected } = longClaudeSession(400 * 1024);
    const { fs, source } = claudeSession(text);
    expect(source.file.size).toBeGreaterThan(3 * TRANSCRIPT_PAGE_BYTES);

    const { pages } = await walk(fs, source);

    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(rows(pages.flatMap((page) => page.entries))).toEqual(expected);
    // Every page but the last continues; no page claims a total it never counted.
    for (const page of pages.slice(0, -1)) expect(page.nextCursor).not.toBeNull();
    expect(pages[pages.length - 1]?.nextCursor).toBeNull();
    for (const page of pages) expect(page.totalKnown).toBe(false);
    // Ids stay unique across page boundaries — the view keys rows by them.
    const ids = pages.flatMap((page) => page.entries.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    // One read per page, each within the budget, and no byte read twice.
    expect(fs.reads).toHaveLength(pages.length);
    for (const read of fs.reads) expect(read.length).toBeLessThanOrEqual(TRANSCRIPT_PAGE_BYTES);
    expect(fs.bytesRequested()).toBeLessThanOrEqual(source.file.size + TRANSCRIPT_PAGE_BYTES);
  });

  it('pages a Codex session the same way, at a page size the fixture outgrows', async () => {
    const base = Date.parse('2026-08-12T09:15:00.000Z');
    const records: Record<string, unknown>[] = [];
    const expected: Row[] = [];
    for (let turn = 0; turn < 12; turn += 1) {
      const at = new Date(base + turn * 1000).toISOString();
      const question = `Question ${turn}, with enough words in it to make the line realistic.`;
      const answer = `Answer ${turn}, likewise long enough that a small page cannot hold two.`;
      records.push(
        {
          timestamp: at,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: question }],
          },
        },
        { timestamp: at, type: 'reasoning', payload: { summary: [`Thinking about ${turn}.`] } },
        {
          timestamp: at,
          type: 'function_call',
          payload: {
            call_id: `call_${turn}`,
            name: 'shell',
            arguments: JSON.stringify({ command: ['bash', '-lc', `npm test -- part-${turn}`] }),
          },
        },
        {
          timestamp: at,
          type: 'function_call_output',
          payload: { call_id: `call_${turn}`, output: 'ok' },
        },
        {
          timestamp: at,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: answer }],
          },
        },
      );
      expected.push(
        { kind: 'user', text: question, toolName: null },
        { kind: 'tool-call', text: null, toolName: 'shell' },
        { kind: 'tool-result', text: null, toolName: null },
        { kind: 'assistant', text: answer, toolName: null },
      );
    }
    const text = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
    const { fs, source } = claudeSession(text);
    const codex: TranscriptSource = { agent: 'codex', file: source.file };

    const { pages } = await walk(fs, codex, 1024);

    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(rows(pages.flatMap((page) => page.entries))).toEqual(expected);
    for (const read of fs.reads) expect(read.length).toBeLessThanOrEqual(1024);
  });

  it('keeps the cursor byte-exact across multi-byte characters', async () => {
    // The cursor is a byte offset, a JS string index is not: with `text.length`
    // instead of a UTF-8 byte count, every page boundary behind an umlaut would
    // resume inside a line and silently lose that record. Page windows here are
    // small enough that several of them end inside a multi-byte character.
    const lines: string[] = [];
    const expected: Row[] = [];
    for (let turn = 0; turn < 40; turn += 1) {
      const at = new Date(Date.parse('2026-08-12T10:00:00.000Z') + turn * 1000).toISOString();
      // Deliberately multi-byte-heavy: `€` costs three bytes but one string
      // index, so a page's cursor computed from `text.length` would land roughly
      // a third of a page too early and hand back records already delivered.
      const question = `Übertrag ${turn}: ${'€'.repeat(84)} — Ende? 🧾`;
      lines.push(JSON.stringify(prompt(question, { at })));
      expected.push({ kind: 'user', text: question, toolName: null });
    }
    const body = `${lines.join('\n')}\n`;
    const { fs, source } = claudeSession(body);
    expect(source.file.size).toBeGreaterThan(body.length * 1.3);

    const { pages } = await walk(fs, source, 8 * 1024);

    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(rows(pages.flatMap((page) => page.entries))).toEqual(expected);
  });

  it('does not read a large file whole — one bounded window per page', async () => {
    // The proof this deliverable exists for: a `readFile()`-then-`split('\n')`
    // implementation would request all ~5 MB here and fail both assertions below.
    const { text } = longClaudeSession(5_000_000);
    const { fs, source } = claudeSession(text);
    expect(source.file.size).toBeGreaterThan(5_000_000);

    const page = await readTranscriptPage(fs, source, null);

    expect(fs.reads).toHaveLength(1);
    expect(fs.reads[0]?.length).toBeLessThanOrEqual(TRANSCRIPT_PAGE_BYTES);
    expect(fs.bytesRequested()).toBeLessThan(source.file.size / 30);
    expect(page.entries.length).toBeGreaterThan(0);
    expect(page.nextCursor).not.toBeNull();
    expect(page.totalKnown).toBe(false);

    // The second page continues where the first stopped, still within the budget.
    const second = await readTranscriptPage(fs, source, page.nextCursor);
    expect(fs.reads).toHaveLength(2);
    expect(fs.reads[1]?.start).toBe(Number.parseInt(page.nextCursor!, 10));
    expect(fs.reads[1]?.length).toBeLessThanOrEqual(TRANSCRIPT_PAGE_BYTES);
    expect(second.entries[0]?.id).not.toBe(page.entries[0]?.id);
  });

  it('steps over a single line wider than the budget instead of loading it', async () => {
    const huge = assistant(`Pasted file: ${'x'.repeat(4000)}`, { at: '2026-08-12T10:00:00.000Z' });
    const text = jsonl([
      huge,
      prompt('And now the next question.', { at: '2026-08-12T10:01:00.000Z' }),
      assistant('And the answer.', { at: '2026-08-12T10:01:05.000Z' }),
    ]);
    const { fs, source } = claudeSession(text);

    const { pages } = await walk(fs, source, 512);

    // The overlong record is skipped — honestly absent, never half-parsed — and
    // the records behind it still arrive.
    expect(rows(pages.flatMap((page) => page.entries))).toEqual([
      { kind: 'user', text: 'And now the next question.', toolName: null },
      { kind: 'assistant', text: 'And the answer.', toolName: null },
    ]);
    for (const read of fs.reads) expect(read.length).toBeLessThanOrEqual(512);
    // Scanning pages carry no entries but a cursor: "still scanning", not "done".
    expect(pages.filter((page) => page.entries.length === 0).length).toBeGreaterThan(0);
  });
});

describe('readTranscriptPage — nothing to show', () => {
  it('answers an empty file with an empty page', async () => {
    const { fs, source } = claudeSession('');

    const page = await readTranscriptPage(fs, source, null);

    expect(page).toEqual({ entries: [], nextCursor: null, totalKnown: true });
    expect(fs.reads).toHaveLength(0);
  });

  it('answers a path that does not exist with an empty page, not an error', async () => {
    const { fs } = claudeSession('irrelevant');
    const missing: TranscriptSource = {
      agent: 'claude',
      file: {
        path: '/claude/projects/gone/session.jsonl',
        name: 'session.jsonl',
        size: 4096,
        modified: '2026-08-12T10:00:00.000Z',
      },
    };

    const page = await readTranscriptPage(fs, missing, null);

    expect(page).toEqual({ entries: [], nextCursor: null, totalKnown: true });
  });

  it('treats a cursor past the end of the file as the end', async () => {
    const { fs, source } = claudeSession(
      jsonl([prompt('Only one turn.', { at: '2026-08-12T10:00:00.000Z' })]),
    );

    const page = await readTranscriptPage(fs, source, '999999');

    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
