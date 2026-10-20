/* The proposal previews a heading before anything is written.
 *
 * `withAllTargets` resolves `primary.section` (and every alternative's) against
 * the target's already-indexed body — cheaply, no extra file read. This is only
 * a preview: `apply`/`filing` re-resolve against the freshly read file, so a
 * stale index here never creates a second section (`src/core/capture/sections.ts`).
 */

import { describe, expect, it } from 'vitest';
import { withAllTargets } from '../../../src/main/ipc/capture-proposal';
import type { CaptureIndex } from '@core/capture';
import type { FilingProposal } from '@shared/types';
import { makeDoc } from '../../core/index/fixtures';

const PROJECT_PATH = 'projects/work/demo/project.md';
const NOW = new Date('2026-08-22T09:00:00.000Z');

/** A `CaptureIndex` that only has to answer `index().docs` for this test. */
function fakeIndex(body: string): CaptureIndex {
  return {
    projects: () => [],
    modules: () => [],
    index: () => ({ docs: [makeDoc({ path: PROJECT_PATH, docType: 'project', body })] }),
    search: () => [],
  };
}

function baseProposal(section: string): FilingProposal {
  return {
    dumpPath: 'inbox/dump-1.md',
    title: 'Demo',
    scope: 'work',
    tags: [],
    primary: { target: 'project', path: PROJECT_PATH, section, content: 'Text' },
    extras: [],
    alternatives: [],
    confidence: 0.9,
    reason: 'Testgrund',
    todos: [],
    waitingOn: [],
    entities: [],
    heuristic: true,
    createdAt: NOW.toISOString(),
  };
}

describe('withAllTargets — die Ueberschrift der Vorschau', () => {
  it('nennt die vorhandene deutsche Ueberschrift, auch wenn die Dokumentsprache Englisch ist', () => {
    const body = ['## Notizen', '', 'Bestehender Text.', ''].join('\n');
    const proposal = withAllTargets(
      baseProposal('Notes'),
      fakeIndex(body),
      'Neuer Gedanke',
      NOW,
      'en',
    );

    expect(proposal.primary.section).toBe('Notizen');
  });

  it('faellt auf die Vorgabe der Dokumentsprache zurueck, wenn die Datei noch keinen Abschnitt hat', () => {
    const body = ['# Demo', '', 'Noch kein Abschnitt.', ''].join('\n');
    const proposal = withAllTargets(
      baseProposal('Notes'),
      fakeIndex(body),
      'Neuer Gedanke',
      NOW,
      'en',
    );

    expect(proposal.primary.section).toBe('Notes');
  });
});
