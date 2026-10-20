/* Writing the started engine's port back into the llama.cpp provider (034, D3
 * — Decisions, Q3: "a configurable default port, next free port on collision,
 * baseUrl written back").
 *
 * The port a start lands on is only known after the port scan, so the address
 * the user configured once ("http://127.0.0.1:8080/v1", the preset's template)
 * would otherwise point at nothing the moment a collision moved the engine to
 * 11436. This module closes that gap, and does so through the very same path
 * `llm:updateProvider` uses — `settings.setVaultSection('providers', …)` —
 * because provider addresses live in the vault like every other provider's
 * `baseUrl`. Nothing new travels there: a loopback URL, exactly the kind of
 * value that section already holds.
 *
 * Three rules, all of them "do less rather than guess":
 *
 * - **Only an unambiguous match.** Exactly one local, OpenAI-compatible
 *   provider whose address looks like a llama.cpp one (loopback, on the old
 *   fixed 8080 or somewhere in the 11435–11444 range) gets rewritten. Zero
 *   matches or more than one: nothing happens. The app does not pick which of
 *   two local providers the user meant (guardrail 2).
 * - **Never fatal.** A start that worked is not undone by a settings write
 *   that didn't — the engine runs either way, and starting it must work long
 *   before the user has adopted it as a provider at all.
 * - **No new validation.** `llm.ts`'s `cleanBaseUrl` exists for user input;
 *   the address here is composed from a port number out of a fixed range, so
 *   there is nothing left to validate and nothing worth duplicating.
 */

import type { ProviderConfig, VaultSettings } from '@shared/types';
import { LLAMA_PORT_RANGE_END, LLAMA_PORT_RANGE_START } from './llamacpp-status';

/** The port 033 started the engine on and `PROVIDER_PRESETS`' llama.cpp entry
    still ships as its template. Recognised as "a llama.cpp provider" so the
    first start after this story finds the address the user adopted before it. */
const LEGACY_LLAMACPP_PORT = 8080;

/** The slice of `SettingsService` this write needs — narrow on purpose, so the
    unit test hands it two functions instead of a whole services container. */
export interface ProviderSettingsAccess {
  vault(): VaultSettings | null;
  setVaultSection(key: 'providers', value: ProviderConfig[]): Promise<unknown>;
}

/** Does this configured provider look like the llama.cpp engine's own entry?
    Deliberately shape-based rather than id-based: the preset id `'llamacpp'`
    is only the template's id, the provider the user actually added carries a
    UUID of its own. Exported for `llamacpp-autostart.ts` (034, D6), which
    needs the same "is this a llama.cpp provider" answer to decide whether
    there is anything worth auto-starting for — reusing this rather than a
    second, possibly diverging heuristic. */
export function looksLikeLlamaCppProvider(provider: ProviderConfig): boolean {
  if (provider.local !== true || provider.kind !== 'openai-compatible') return false;
  let url: URL;
  try {
    url = new URL(provider.baseUrl);
  } catch {
    return false;
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return false;
  const port = Number(url.port);
  if (!Number.isInteger(port)) return false;
  return (
    port === LEGACY_LLAMACPP_PORT ||
    (port >= LLAMA_PORT_RANGE_START && port <= LLAMA_PORT_RANGE_END)
  );
}

/**
 * Points the one llama.cpp provider at the port the engine actually started
 * on. Reports what it did so a test can tell "wrote it" from "left it alone";
 * the start path itself ignores the answer — see the "never fatal" rule above.
 */
export async function adoptLlamaProviderPort(
  settings: ProviderSettingsAccess | undefined,
  port: number,
): Promise<'updated' | 'skipped'> {
  const vault = settings?.vault() ?? null;
  // No vault open: providers live in it, so there is nothing to write to —
  // and the engine may legitimately be started before one is opened.
  if (!vault) return 'skipped';

  const candidates = vault.providers.filter(looksLikeLlamaCppProvider);
  const target = candidates.length === 1 ? candidates[0] : undefined;
  if (!target) return 'skipped';

  const baseUrl = `http://127.0.0.1:${port}/v1`;
  if (target.baseUrl === baseUrl) return 'skipped';

  await settings?.setVaultSection(
    'providers',
    vault.providers.map((provider) =>
      provider.id === target.id ? { ...provider, baseUrl } : provider,
    ),
  );
  return 'updated';
}
