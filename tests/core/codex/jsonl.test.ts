/* Tests for the Codex record/facts layer (story 001, deliverable D4).
 *
 * `readSessionFacts` is exercised against the real fixture files from D3
 * (tests/fixtures/codex/) via the real node filesystem adapter — the same
 * adapter `../claude/node-adapters.ts` uses, generic enough to read any file,
 * not tied to `~/.claude`. This is deliberate: the fixtures are on disk
 * exactly because they are meant to be read like real Codex rollout files,
 * not rebuilt as in-memory strings.
 */
import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeClaudeFileSystem } from '@core/claude';
import type { ClaudeFileInfo } from '@core/claude';
import { parseJsonlChunk, readSessionFacts } from '@core/codex';
import { fixturePath } from '../../fixtures';

const SESSION_1 = fixturePath(
  'codex',
  'sessions',
  '2026',
  '08',
  '12',
  'rollout-2026-08-12T09-15-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl',
);
const SESSION_2 = fixturePath(
  'codex',
  'sessions',
  '2026',
  '08',
  '12',
  'rollout-2026-08-12T11-40-00-11111111-2222-3333-4444-555555555555.jsonl',
);
const SESSION_3_EMPTY = fixturePath(
  'codex',
  'sessions',
  '2026',
  '08',
  '12',
  'rollout-2026-08-12T14-05-00-99999999-8888-7777-6666-555555555555.jsonl',
);

function fileInfo(path: string): ClaudeFileInfo {
  const stat = statSync(path);
  return { path, name: basename(path), size: stat.size, modified: stat.mtime.toISOString() };
}

describe('parseJsonlChunk (codex)', () => {
  it('skips broken lines instead of throwing', () => {
    const chunk = parseJsonlChunk('{"type":"session_meta"}\nnot json\n{"type":"turn_context"}\n', {
      dropFirstPartial: false,
      dropLastPartial: true,
    });
    expect(chunk.records).toHaveLength(2);
    expect(chunk.skipped).toBe(1);
    expect(chunk.lines).toBe(3);
  });

  it('drops a half-written last line without counting it as broken', () => {
    const chunk = parseJsonlChunk('{"type":"session_meta"}\n{"type":"turn_c', {
      dropFirstPartial: false,
      dropLastPartial: true,
    });
    expect(chunk.records).toHaveLength(1);
    expect(chunk.skipped).toBe(0);
  });

  it('drops a half-read first line when the window began mid-line', () => {
    const chunk = parseJsonlChunk('ontext"}\n{"type":"session_meta"}\n', {
      dropFirstPartial: true,
      dropLastPartial: true,
    });
    expect(chunk.records).toHaveLength(1);
    expect(chunk.skipped).toBe(0);
  });
});

describe('readSessionFacts (codex)', () => {
  it('reads cwd, branch, model, token total and context window from the well-formed session', async () => {
    const fs = nodeClaudeFileSystem();
    const facts = await readSessionFacts(fs, fileInfo(SESSION_1));

    expect(facts.sessionId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(facts.cwd).toBe('/home/user/projects/widget-app');
    expect(facts.gitBranch).toBe('feature/cart-totals');
    expect(facts.model).toBe('gpt-5-codex');
    expect(facts.contextTokens).toBe(4821);
    expect(facts.contextWindow).toBe(128000);
    expect(facts.messageCount).toBeGreaterThanOrEqual(2);
    expect(facts.messageCountExact).toBe(true);
    expect(facts.firstPrompt).toBe(
      'Add a function to compute cart totals with tax, then run the tests.',
    );
    expect(facts.skippedLines).toBe(0);
    expect(facts.records).toBeGreaterThan(5);
  });

  it('reads its own distinct facts from the second session, with its broken last line skipped, not thrown', async () => {
    const fs = nodeClaudeFileSystem();
    const facts = await readSessionFacts(fs, fileInfo(SESSION_2));

    expect(facts.sessionId).toBe('11111111-2222-3333-4444-555555555555');
    expect(facts.cwd).toBe('/home/user/projects/report-gen');
    expect(facts.gitBranch).toBe('bugfix/csv-export');
    expect(facts.model).toBe('gpt-5-codex');
    expect(facts.contextTokens).toBe(1720);
    expect(facts.contextWindow).toBe(128000);
    expect(facts.messageCount).toBeGreaterThanOrEqual(2);
    // The last line is deliberately truncated mid-JSON (D3 fixture) — it must
    // be counted as skipped, and the rest of the file must still be readable.
    expect(facts.skippedLines).toBe(1);
    expect(facts.records).toBeGreaterThan(3);
  });

  it('reports the genuinely empty file as no session', async () => {
    const fs = nodeClaudeFileSystem();
    const facts = await readSessionFacts(fs, fileInfo(SESSION_3_EMPTY));

    expect(facts.records).toBe(0);
    expect(facts.messageCount).toBe(0);
    expect(facts.cwd).toBeNull();
    expect(facts.model).toBeNull();
    expect(facts.skippedLines).toBe(0);
  });
});
