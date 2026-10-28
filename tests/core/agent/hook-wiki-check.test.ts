/* The wiki check is a report, not a guard. The cheap case here proves the Stop report end to end;
 * the full table runs in the shell lane (hook-wiki-check.shell.test.ts). */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWikiCheck, TIMEOUT, validPage } from '../../helpers/hooks/wiki-check';

describe.runIf(process.platform === 'win32')('post-write wiki check', { timeout: TIMEOUT }, () => {
  const { setup, cleanup, session } = createWikiCheck();

  beforeAll(setup);

  afterAll(cleanup);

  it(
    'a wiki change without a new log entry is reported when the session stops',
    async () => {
      const s = await session();
      await s.write(s.path('concepts/habits.md'), validPage(s.module));
      const stop = await s.stop();
      expect(stop.code).toBe(2);
      expect(stop.stderr).toContain(`modules/${s.module}/wiki`);
      expect(stop.stderr).toContain('concepts/habits.md');
    },
    TIMEOUT,
  );
});
