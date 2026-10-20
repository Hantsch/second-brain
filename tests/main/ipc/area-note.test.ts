/* The two halves of moving a note, in isolation: finding the block and writing
 * it across two files.
 *
 * The integration test (`tests/main/areas-ipc.test.ts`) drives this through the
 * real store on real files. What is only reachable here is the rollback and the
 * one case above it: the rollback itself failing. That has to be said out loud —
 * it is the only situation in which the note really is in no file.
 */

import { describe, expect, it } from 'vitest';
import { areaNoteBlock } from '@core/areas';
import { filingBlock } from '@core/capture';
import type { WriteResult } from '@shared/types';
import { applyNoteMove, noteAt, requireNoteBlock } from '../../../src/main/ipc/area-note';
import type { NoteMoveStore } from '../../../src/main/ipc/area-note';

const FIXED_DATE = new Date(2026, 7, 18);

/** A body with two dated entries, as the filing path writes them. */
const BODY = [
  '## Notizen',
  '',
  filingBlock('Erster Eintrag,\nüber zwei Zeilen.', FIXED_DATE),
  '',
  '### 2026-08-19',
  '',
  'Zweiter Eintrag.',
  '',
  '## Todos',
  '',
  '- [ ] Etwas tun',
  '',
].join('\n');

/* Frontmatter of six lines plus the `---` pair: the body starts on line 8. */
const BODY_LINE = 8;

interface Recorder extends NoteMoveStore {
  readonly writes: { path: string; body?: string; expectedHash?: string }[];
  readonly appends: { path: string; section: string; content: string; expectedHash?: string }[];
}

/** A store that only records — plus the failures the move has to survive. */
function recorder(options: { appendFails?: boolean; secondWriteFails?: boolean } = {}): Recorder {
  const writes: Recorder['writes'] = [];
  const appends: Recorder['appends'] = [];
  return {
    writes,
    appends,
    write: (input) => {
      writes.push(input);
      if (options.secondWriteFails === true && writes.length > 1) {
        return Promise.reject(new Error('Zurückschreiben ist fehlgeschlagen'));
      }
      const result: WriteResult = {
        path: input.path,
        hash: `hash-${writes.length}`,
        created: false,
      };
      return Promise.resolve(result);
    },
    append: (path, section, content, appendOptions) => {
      appends.push({ path, section, content, ...appendOptions });
      if (options.appendFails === true) return Promise.reject(new Error('Anhängen fehlgeschlagen'));
      return Promise.resolve({ path, hash: 'hash-target' });
    },
  };
}

const source = (body: string) => ({
  path: 'areas/gesundheit.md',
  body,
  previous: BODY,
  hash: 'hash-source',
});

const target = (block: string) => ({
  path: 'areas/haus.md',
  section: 'Notizen',
  hash: 'hash-before',
  block,
});

describe('noteAt', () => {
  it('slices the entry out of the file exactly as it stands there', () => {
    const found = noteAt({ body: BODY, bodyLine: BODY_LINE }, BODY_LINE + 2);

    expect(found).toEqual({
      kind: 'entry',
      block: filingBlock('Erster Eintrag,\nüber zwei Zeilen.', FIXED_DATE),
    });
  });

  /* The point of the whole exercise: what comes back out is what the write path
     put in, so `removeBlock` finds it — a note written by the app can always be
     moved again. */
  it('gives back a block that the write path itself would have written', () => {
    const written = areaNoteBlock('Erster Eintrag,\nüber zwei Zeilen.', FIXED_DATE);
    const found = noteAt({ body: BODY, bodyLine: BODY_LINE }, BODY_LINE + 2);

    expect(found.kind === 'entry' && found.block).toBe(written);
    expect(BODY.includes(written)).toBe(true);
  });

  it('stops at the next entry and does not take its heading along', () => {
    const found = noteAt({ body: BODY, bodyLine: BODY_LINE }, BODY_LINE + 7);

    expect(found).toEqual({ kind: 'entry', block: '### 2026-08-19\n\nZweiter Eintrag.' });
  });

  it('names a note without a date heading as such instead of guessing its end', () => {
    const body = [
      '## Notizen',
      '',
      'Von Hand geschrieben.',
      '',
      '### 2026-08-19',
      '',
      'X',
      '',
    ].join('\n');

    expect(noteAt({ body, bodyLine: 1 }, 3)).toEqual({ kind: 'lead' });
    expect(() => requireNoteBlock({ body, bodyLine: 1 }, 3, 'areas/x.md')).toThrow(
      /Datums-Überschrift/,
    );
  });

  it('finds nothing on a line that carries no note', () => {
    expect(noteAt({ body: BODY, bodyLine: BODY_LINE }, BODY_LINE)).toEqual({ kind: 'missing' });
    /* A todo is not a note, even though it is a line in the same file. */
    expect(noteAt({ body: BODY, bodyLine: BODY_LINE }, BODY_LINE + 10)).toEqual({
      kind: 'missing',
    });
    expect(() =>
      requireNoteBlock({ body: BODY, bodyLine: BODY_LINE }, BODY_LINE, 'areas/x.md'),
    ).toThrow(/keine Notiz/);
  });
});

describe('applyNoteMove', () => {
  it('writes the source first and the target second, both with a hash', async () => {
    const store = recorder();
    const block = '### 2026-08-19\n\nZweiter Eintrag.';

    const result = await applyNoteMove(store, source('## Notizen\n'), target(block));

    expect(store.writes).toEqual([
      { path: 'areas/gesundheit.md', body: '## Notizen\n', expectedHash: 'hash-source' },
    ]);
    expect(store.appends).toEqual([
      {
        path: 'areas/haus.md',
        section: 'Notizen',
        content: block,
        expectedHash: 'hash-before',
      },
    ]);
    expect(result.from.path).toBe('areas/gesundheit.md');
    expect(result.to).toEqual({ path: 'areas/haus.md', hash: 'hash-target', created: false });
  });

  it('puts the source back and reports the original error when the target fails', async () => {
    const store = recorder({ appendFails: true });

    await expect(
      applyNoteMove(store, source('## Notizen\n'), target('### 2026-08-19\n\nZweiter Eintrag.')),
    ).rejects.toThrow('Anhängen fehlgeschlagen');

    /* The second write is the rollback: the body from before, guarded with the
       hash of the removal — nobody else's change gets overwritten by it. */
    expect(store.writes).toEqual([
      { path: 'areas/gesundheit.md', body: '## Notizen\n', expectedHash: 'hash-source' },
      { path: 'areas/gesundheit.md', body: BODY, expectedHash: 'hash-1' },
    ]);
  });

  it('says it out loud when the rollback fails too, without the note text', async () => {
    const store = recorder({ appendFails: true, secondWriteFails: true });

    const failure = await applyNoteMove(
      store,
      source('## Notizen\n'),
      target('### 2026-08-19\n\nZweiter Eintrag.'),
    ).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'io' });
    const message = failure instanceof Error ? failure.message : '';
    expect(message).toContain('areas/gesundheit.md');
    expect(message).toContain('areas/haus.md');
    /* The note's text belongs in no error message and in no log. */
    expect(message).not.toContain('Eintrag');
  });
});
