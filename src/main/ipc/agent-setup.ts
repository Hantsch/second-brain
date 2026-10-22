/* The agent setup in the vault over IPC: `agent:setupStatus` reads where each
   template file stands, `agent:setupApply` writes the ones the user confirmed.

   The apply request comes from the renderer, so its shape is checked here
   before `@core/agent` sees any of it — the core trusts its input. */

import { readProtection } from '@core/agent/protection-status';
import { applySetup } from '@core/agent/setup-apply';
import { readSetupState } from '@core/agent/setup-status';
import { isSafeVaultPath } from '@core/vault/paths';
import type { AgentSetupApplyRequest } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
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

export function agentSetupHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'agent:setupStatus': async () => readSetupState(services.requireStore()),
    'agent:protectionStatus': async () => readProtection(services.requireStore()),
    'agent:setupApply': async (request) =>
      applySetup(services.requireStore(), requireApplyRequest(request)),
  });
}
