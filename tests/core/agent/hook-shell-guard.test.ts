/* The pre-tool guard is the barrier between a cloud model and the user's journal. Every case
 * runs the installed script through Windows PowerShell exactly as Claude Code starts it, with
 * the hook input on stdin: exit 2 blocks, exit 0 allows. A false block costs the agent one
 * retry; a false allow leaks, so the block tables are the long ones. */

import { afterAll, beforeAll, describe, it } from 'vitest';
import { createShellGuard, ps, TIMEOUT } from '../../helpers/hooks/shell-guard';

// The hook runtime is Windows PowerShell (powershell.exe), and the CI runner is Windows.
describe.runIf(process.platform === 'win32')('pre-tool guard', { timeout: TIMEOUT }, () => {
  const { setup, cleanup, expectBlockedWith } = createShellGuard();

  beforeAll(setup);

  afterAll(cleanup);

  it.concurrent.each([
    ps('$p = -join [char[]](106,111,117,114,110,97,108); gc $p'),
    ps('-join [ CHAR [ ] ](106,111)'),
    ps('[System.Char[]]"journal" -join ""'),
  ])(
    'a char array cast is blocked as a dynamic command: $name',
    expectBlockedWith('encoded or dynamic'),
    TIMEOUT,
  );
});
