/* The browser-mode bridge hard-codes the managed paths because the renderer may not
 * import the core's template list; this test is where the two are kept in step. */

import { describe, expect, it } from 'vitest';
import { HELP_MODULE_VERSION } from '@core/agent/help/version';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { agentSetupNotInstalled } from '@renderer/lib/mock-agent-setup';

describe('browser-mode agent setup state', () => {
  it('lists exactly the shipped template paths and versions', () => {
    const mockPaths = agentSetupNotInstalled.files.map((file) => file.path);
    expect([...mockPaths].sort()).toEqual(SETUP_TEMPLATES.map((t) => t.path).sort());
    for (const file of agentSetupNotInstalled.files) {
      const shipped = SETUP_TEMPLATES.find((t) => t.path === file.path);
      expect(file.shippedVersion, file.path).toBe(shipped?.version);
    }
  });

  it('reports the help module as missing at the shipped version', () => {
    expect(agentSetupNotInstalled.help).toEqual({
      status: 'missing',
      installedVersion: null,
      shippedVersion: HELP_MODULE_VERSION,
    });
  });
});
