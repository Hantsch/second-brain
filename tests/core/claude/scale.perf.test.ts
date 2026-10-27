/* Perf lane: how long listing a real-sized history takes. What it reads is
   pinned byte-exact in the gate (`scale.test.ts`). */

import { describe, it } from 'vitest';
import { ClaudeSessionReader } from '@core/claude';
import { reportBudget } from '../../helpers/perf';
import { FAKE_ROOT, fakeClaudeFs, scaleFiles } from './fixtures';

describe('ClaudeSessionReader über 29 Projekte', () => {
  it('bleibt unter zwei Sekunden', async ({ annotate }) => {
    const fs = fakeClaudeFs({ files: scaleFiles().files });
    const reader = new ClaudeSessionReader({ fs, projectsDir: FAKE_ROOT });

    const started = Date.now();
    await reader.list({ limit: 87 });
    await reportBudget({ annotate }, 'list 87 sessions', Date.now() - started, 2000);
  });
});
