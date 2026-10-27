/* Every progressbar in the renderer comes from the ProgressBar atom, so the
   ARIA attributes cannot drift between hand-rolled copies. This reads the
   sources instead of rendering screens, so a new copy fails on `npm test`.
   Sources come in through `import.meta.glob`: the renderer tsconfig has no
   Node types, so `node:fs` is not available here. */

import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('../../src/renderer/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const ATOM = '../../src/renderer/atoms/ProgressBar.tsx';
// JSX attribute form only; block comments that mention the role are stripped first.
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const JSX_ROLE = /\brole=(?:"progressbar"|\{\s*['"]progressbar['"]\s*\})/;

describe('progress bars', () => {
  it('role=progressbar is only rendered by the ProgressBar atom', () => {
    expect(Object.keys(sources)).toContain(ATOM);
    const offenders = Object.entries(sources)
      .filter(([file, source]) => file !== ATOM && JSX_ROLE.test(withoutComments(source)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
    expect(sources[ATOM]).toMatch(JSX_ROLE);
  });
});
