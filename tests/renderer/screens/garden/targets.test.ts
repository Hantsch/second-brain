/* `targetFor` only ever sees a path string — no finding kind, no context. Story
   039 adds the area route: `areas/<slug>.md` and its condensed sibling
   `areas/<slug>.condensed.md` both have to land on the same in-app place,
   because the `condensation-due` finding lists the plain area file first
   (`FindingCard` opens `paths[0]`) while the artifact itself is named
   `areas/<slug>.condensed.md`. */

import { describe, expect, it } from 'vitest';
import { targetFor } from '@renderer/screens/garden/targets';

describe('targetFor — areas', () => {
  it('routes a condensed artifact to the area condensed tab', () => {
    expect(targetFor('areas/health.condensed.md')).toEqual({
      kind: 'route',
      to: '/notes?a=health&tab=condensed',
    });
  });

  it('routes the plain area file to the same target', () => {
    expect(targetFor('areas/health.md')).toEqual({
      kind: 'route',
      to: '/notes?a=health&tab=condensed',
    });
  });
});

describe('targetFor — regression guard', () => {
  it('still falls back to opening unrelated paths as a file', () => {
    expect(targetFor('notes/2026-01-01.md')).toEqual({
      kind: 'file',
      path: 'notes/2026-01-01.md',
    });
  });

  it('does not let the area route swallow paths outside areas/', () => {
    expect(targetFor('projects/work/example/project.md')).toEqual({
      kind: 'route',
      to: '/projects?p=example',
    });
    expect(targetFor('inbox/2026-01-01-dump.md')).toEqual({
      kind: 'route',
      to: '/notes?filter=unfiled',
    });
  });
});
