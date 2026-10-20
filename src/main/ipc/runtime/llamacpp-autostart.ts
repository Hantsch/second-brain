/* Auto-start for the llama.cpp engine (034, D6; Decisions Q2). Split out of
 * `llamacpp-lifecycle.ts` rather than added to it: that module already sits
 * at 474 lines, over the project's ~300-line soft limit, and everything here
 * is a distinct responsibility from status/plan/stop anyway — deciding
 * *whether to bother starting at all*, called from the LLM request path
 * (`createGateway`, `llm-bridge.ts`) rather than from the card.
 *
 * `'manual'` (the default) is a hard no-op: no status probe, no provider
 * check, nothing — the acceptance line requires the default to start
 * literally nothing, and the cheapest way to guarantee that is to never look
 * further once the mode itself says so. `'on-demand'` only starts what is
 * both configured (an enabled llama.cpp-shaped provider exists — otherwise
 * no task would ever route to it, so starting it would serve nobody) and
 * idle (`installed-stopped`; `'absent'` has nothing to start and `'running'`
 * — including a foreign engine — must not be started again).
 *
 * Single-flight, one level above D3's own dedup: `startLlamaEngine` already
 * refuses to spawn a second server while one of ours is tracked, but two
 * *tasks* arriving together would otherwise both reach that check
 * concurrently, before either has a handle to compare against, and could
 * both pass it. `ensureInFlight` closes that gap — the same "module state,
 * not per-call state" choice `llamacpp-lifecycle.ts` already made for
 * `ownedPort`, because this guards one physical engine, not one call.
 */

import type { HandlerMap } from '../registry';
import { defineHandlers, fail } from '../registry';
import type { Services } from '../../services';
import { createLlamaLifecycleStartPart } from './llamacpp-engine-start';
import { getLlamaEngineStatus, productionLifecycleDeps } from './llamacpp-lifecycle';
import { safeLlamaLogLine } from './llamacpp-log-safety';
import { looksLikeLlamaCppProvider } from './llamacpp-provider-port';

/** Only `status` is ever read below — `ownedByApp`/`port` are none of this
    guard's business, so the test seam doesn't have to fabricate them. */
type EngineStatus = Pick<Awaited<ReturnType<typeof getLlamaEngineStatus>>, 'status'>;

/** Test seam: production probes the real engine status and, if it starts at
    all, starts through D3's own `createLlamaLifecycleStartPart` — its dedup
    and its `baseUrl` write-back apply unchanged, nothing here re-implements
    either. A test hands in fakes for both, so the concurrency test can gate
    the fake `start` on a promise it resolves by hand, after both calls have
    already been issued — proving the overlap is actually exercised. */
export interface EnsureLlamaRunningDeps {
  getStatus?: () => Promise<EngineStatus>;
  start?: () => Promise<unknown>;
}

let ensureInFlight: Promise<void> | null = null;

/**
 * Called from `createGateway` before every task dispatch (034, D6). Never
 * throws: a skipped, failed, or still-pending auto-start must not block the
 * task that triggered it — the gateway call proceeds either way, and an
 * engine that genuinely isn't up is already reported honestly through the
 * gateway's own `unreachable` mapping (guardrail 1).
 *
 * The synchronous check-and-set on `ensureInFlight` (before any `await`) is
 * what makes this single-flight: two calls issued back to back, neither yet
 * awaited, both see the same in-flight promise rather than each starting
 * their own attempt.
 */
export function ensureLlamaRunning(
  services: Services,
  deps: EnsureLlamaRunningDeps = {},
): Promise<void> {
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = attempt(services, deps).finally(() => {
    ensureInFlight = null;
  });
  return ensureInFlight;
}

async function attempt(services: Services, deps: EnsureLlamaRunningDeps): Promise<void> {
  try {
    const mode = services.settings.snapshot().app.machine.llamaAutoStart;
    if (mode !== 'on-demand') return;

    const providers = services.settings.vault()?.providers ?? [];
    const hasEnabledLlamaProvider = providers.some(
      (provider) => provider.enabled && looksLikeLlamaCppProvider(provider),
    );
    if (!hasEnabledLlamaProvider) return;

    const getStatus =
      deps.getStatus ?? (() => getLlamaEngineStatus(productionLifecycleDeps(services)));
    const { status } = await getStatus();
    if (status !== 'installed-stopped') return;

    const start =
      deps.start ??
      (() => createLlamaLifecycleStartPart(services, productionLifecycleDeps(services)).start());
    await start();
  } catch {
    // Swallowed on purpose (guardrail 1): the caller's task attempts its
    // normal path regardless. Logged as a fixed, classification-free note —
    // never the raw error, never a path (guardrail 6). `safeLlamaLogLine`
    // (034, D7) is defensive here too: the message carries nothing dynamic
    // today, but the guarantee should survive a future edit that adds some.
    console.warn(safeLlamaLogLine('[llamacpp] automatischer Start ist fehlgeschlagen'));
  }
}

/**
 * `llm:setLlamaAutoStart` (034, D6) — the card's toggle. Machine-local, like
 * the resource budget and VRAM override next to it (`machine-scan.ts`'s own
 * setters): a dedicated channel rather than the generic `settings:setApp`,
 * because that channel's validator (`settings-validate.ts`) does not know
 * about `machine.*` fields at all — the same reason those two setters exist
 * as their own channels instead of going through it.
 */
export function llamaAutoStartHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'llm:setLlamaAutoStart': async (mode) => {
      if (mode !== 'manual' && mode !== 'on-demand') {
        throw fail('invalid', 'ungültiger Autostart-Modus');
      }
      await services.settings.patchApp({ machine: { llamaAutoStart: mode } });
    },
  });
}
