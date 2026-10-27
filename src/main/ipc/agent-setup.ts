/* The agent setup in the vault over IPC: `agent:setupStatus` reads where each
   template file stands, `agent:setupApply` writes the ones the user confirmed.

   The apply request comes from the renderer, so its shape is checked here
   before `@core/agent` sees any of it — the core trusts its input. */

import { readProtection } from '@core/agent/protection-status';
import { readLastRun } from '@core/agent/run-reports';
import { applySetup } from '@core/agent/setup-apply';
import { readSetupState } from '@core/agent/setup-status';
import { isSafeVaultPath, wikiLogPath } from '@core/vault/paths';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import type { AgentSetupApplyRequest, AgentSetupApplyResult } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { wikiStore } from './wiki-bridge';
import type { Services } from '../services';

const MAX_CONFIRMED = 64;
const HASH_OR_EMPTY = /^([0-9a-f]{64})?$/;

function requireApplyRequest(value: unknown): AgentSetupApplyRequest {
  const confirmed = (value as { confirmed?: unknown } | null)?.confirmed;
  if (!Array.isArray(confirmed) || confirmed.length > MAX_CONFIRMED) {
    throw fail('invalid', `confirmed: expected a list of at most ${MAX_CONFIRMED} entries`);
  }
  for (const entry of confirmed as unknown[]) {
    const { path, expectedHash } = (entry ?? {}) as { path?: unknown; expectedHash?: unknown };
    if (typeof path !== 'string' || !isSafeVaultPath(path)) {
      throw fail('invalid', 'confirmed: path is outside the vault');
    }
    if (typeof expectedHash !== 'string' || !HASH_OR_EMPTY.test(expectedHash)) {
      throw fail('invalid', 'confirmed: expectedHash must be empty or a sha-256 hex digest');
    }
  }
  return value as AgentSetupApplyRequest;
}

/** Written help pages and the module's chronicle must show in Knowledge without a restart;
    the watcher is not relied on to report the app's own writes. */
async function settle(services: Services, result: AgentSetupApplyResult): Promise<void> {
  const written = result.results.filter((r) => r.outcome === 'written').map((r) => r.path);
  const touched = written.filter((path) => path.startsWith(`modules/${HELP_MODULE_SLUG}/`));
  if (touched.length === 0) return;
  touched.push(wikiLogPath(HELP_MODULE_SLUG));
  const index = services.index();
  if (index?.refresh) {
    try {
      await index.refresh(touched);
      await services.refreshIndexState();
    } catch (error) {
      // Derived state: a failed refresh must not turn a successful write into a failure.
      console.warn('[agent-setup] Index-Nachlauf fehlgeschlagen:', error);
    }
  }
  services.sendEvent('event:vault-changed', { paths: touched, external: false });
}

export function agentSetupHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'agent:setupStatus': async () => readSetupState(services.requireStore()),
    'agent:protectionStatus': async () => readProtection(services.requireStore()),
    'agent:lastRun': async () => readLastRun(wikiStore(services)),
    'agent:setupApply': async (request) => {
      const result = await applySetup(services.requireStore(), requireApplyRequest(request));
      await settle(services, result);
      return result;
    },
  });
}
