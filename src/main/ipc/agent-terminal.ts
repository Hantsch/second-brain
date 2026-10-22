/* `agent:launchTerminal`: a terminal in the vault with `claude` started.

   Expected refusals (no vault, CLI absent, setup missing, unknown module, no terminal) are the
   result union; only a malformed request is an IPC error. The launch is exactly one attempt
   chain — nothing else is started, in particular not `claude` itself to probe it. (story 087) */

import { buildLaunchPlans, InvalidTerminalModuleError } from '@core/agent/terminal';
import { readSetupState } from '@core/agent/setup-status';
import { listModules } from '@core/wiki';
import { setupIsComplete, terminalReadiness } from '@shared/agent/terminal-readiness';
import type { AgentCliStatus, TerminalIntent, TerminalLaunchResult } from '@shared/types';
import type { TerminalSpawnFn } from '../agent-terminal-launcher';
import { launchTerminal, nodeTerminalSpawn } from '../agent-terminal-launcher';
import { detectClaudeCli } from './agent';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { terminalSpawnFixture } from './terminal-e2e-fixture';
import { wikiIndex } from './wiki-bridge';
import type { Services } from '../services';

export interface AgentTerminalDeps {
  platform: NodeJS.Platform;
  spawn: TerminalSpawnFn;
  cliStatus: () => Promise<AgentCliStatus>;
}

export function productionAgentTerminalDeps(): AgentTerminalDeps {
  return {
    platform: process.platform,
    spawn: terminalSpawnFixture() ?? nodeTerminalSpawn,
    cliStatus: detectClaudeCli,
  };
}

function requireIntent(value: unknown): TerminalIntent {
  const { kind, module } = (value ?? {}) as { kind?: unknown; module?: unknown };
  if (kind === 'open' || kind === 'jobs') return { kind };
  if (kind === 'curate' && typeof module === 'string') return { kind, module };
  throw fail('invalid', 'intent: expected open, jobs or curate with a module name');
}

type Refusal = Extract<TerminalLaunchResult, { ok: false }>;

const refuse = (reason: Refusal['reason']): Refusal => ({ ok: false, reason });

async function readinessOf(services: Services, deps: AgentTerminalDeps, root: string | null) {
  // Without a vault there is nothing to look up; the first readiness check names it.
  if (root === null) {
    return terminalReadiness({ vaultOpen: false, cli: 'unknown', setupComplete: false });
  }
  const cli = await deps.cliStatus();
  const setup = await readSetupState(services.requireStore());
  return terminalReadiness({
    vaultOpen: true,
    cli: cli.state,
    setupComplete: setupIsComplete(setup.files),
  });
}

export function agentTerminalHandlers(services: Services, deps: AgentTerminalDeps): HandlerMap {
  return defineHandlers({
    'agent:launchTerminal': async (request): Promise<TerminalLaunchResult> => {
      const intent = requireIntent(request);
      if (deps.platform !== 'win32') return refuse('unsupported-platform');

      const root = services.vaultRoot();
      const readiness = await readinessOf(services, deps, root);
      if (!readiness.ready || root === null)
        return refuse(readiness.ready ? 'no-vault' : readiness.reason);

      if (intent.kind === 'curate') {
        const known = listModules(wikiIndex(services)).some((m) => m.slug === intent.module);
        if (!known) return refuse('invalid-module');
      }
      try {
        return await launchTerminal(buildLaunchPlans(intent, root), deps.spawn);
      } catch (error) {
        if (error instanceof InvalidTerminalModuleError) return refuse('invalid-module');
        throw error;
      }
    },
  });
}
