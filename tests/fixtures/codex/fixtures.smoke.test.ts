/* Smoke test for the synthetic Codex fixtures (story 001, deliverable D3).
 *
 * This is not testing production code — `src/core/codex/` does not exist yet
 * (that is D4/D5). It only proves the fixtures themselves are shaped the way
 * the later deliverables will need: two well-formed sessions (one with an
 * ~18 KB `session_meta` line), one session broken on purpose in its last
 * line, one genuinely empty file, and a `session_index.jsonl` whose
 * `session_id`s match what the sessions carry internally.
 */
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixturePath } from '../index';

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
const SESSION_INDEX = fixturePath('codex', 'session_index.jsonl');

function linesOf(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

describe('codex fixtures (D3)', () => {
  it('session 1 (well-formed) parses line by line as JSON, and line 1 is ~18 KB', () => {
    const lines = linesOf(SESSION_1);
    expect(lines.length).toBeGreaterThan(5);
    for (const raw of lines) {
      expect(() => JSON.parse(raw)).not.toThrow();
    }

    const line1Bytes = Buffer.byteLength(lines[0]!, 'utf8');
    // The real Codex `session_meta` line is ~18 KB because of `base_instructions`;
    // this is the size stress case a later deliverable's read window is tested against.
    expect(line1Bytes).toBeGreaterThan(16_000);
    expect(line1Bytes).toBeLessThan(20_000);

    const first = JSON.parse(lines[0]!) as { type: string; payload: { session_id: string } };
    expect(first.type).toBe('session_meta');
    expect(first.payload.session_id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('session 2 (truncated) parses every line except the deliberately broken last one', () => {
    const lines = linesOf(SESSION_2);
    expect(lines.length).toBeGreaterThan(3);

    for (const raw of lines.slice(0, -1)) {
      expect(() => JSON.parse(raw)).not.toThrow();
    }

    // INTENTIONAL: the last line simulates Codex still writing the file when it
    // is read — it is cut off mid-value with no closing braces, so JSON.parse
    // on it MUST throw. A real reader is expected to skip this line, not crash.
    const lastLine = lines[lines.length - 1]!;
    expect(() => JSON.parse(lastLine)).toThrow();

    const first = JSON.parse(lines[0]!) as { type: string; payload: { session_id: string } };
    expect(first.type).toBe('session_meta');
    expect(first.payload.session_id).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('session 3 is a genuinely empty file (0 bytes)', () => {
    expect(statSync(SESSION_3_EMPTY).size).toBe(0);
  });

  it('session_index.jsonl maps session_ids that match the sessions themselves', () => {
    const indexLines = linesOf(SESSION_INDEX);
    expect(indexLines.length).toBe(2);

    const entries = indexLines.map(
      (raw) => JSON.parse(raw) as { session_id: string; thread_name: string },
    );
    const ids = entries.map((entry) => entry.session_id);

    const session1Meta = JSON.parse(linesOf(SESSION_1)[0]!) as { payload: { session_id: string } };
    const session2Meta = JSON.parse(linesOf(SESSION_2)[0]!) as { payload: { session_id: string } };

    expect(ids).toContain(session1Meta.payload.session_id);
    expect(ids).toContain(session2Meta.payload.session_id);
    for (const entry of entries) {
      expect(typeof entry.thread_name).toBe('string');
      expect(entry.thread_name.length).toBeGreaterThan(0);
    }
  });
});
