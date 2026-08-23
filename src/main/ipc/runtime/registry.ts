/* The registry the runtime channels dispatch through (033, D5).
 *
 * Before this file, every runtime channel was Ollama by assumption: the handler
 * *was* the Ollama implementation. With a second runtime that stops working, so
 * the channels now read `runtime` from the request, look it up here, and call
 * the matching method on the `RuntimeInstaller` they find. A handler is a
 * dispatch and nothing else — all behaviour stays in the implementations, which
 * is what makes "Ollama behaves exactly as it does today" (AC 2) checkable by
 * its existing tests.
 *
 * Two rules:
 *
 * - **An unknown runtime is a typed refusal, never a crash.** `runtime` arrives
 *   from the renderer and is unchecked at runtime, so a value the registry
 *   doesn't know — a runtime not built yet, a typo, anything — throws
 *   `IpcFailure('invalid')`, which `registry.ts`'s `register` turns into an
 *   `{ ok: false, error }` envelope like any other refusal.
 * - **One registry, three groups of channels.** The three builders below split
 *   the seven channels exactly the way the three Ollama modules already own
 *   them, so each module keeps its own test seam — but they all take the *same*
 *   registry in production (`RuntimeRegistry<RuntimeInstaller>` satisfies each
 *   of their narrower parameter types), so there is exactly one place a runtime
 *   is registered.
 */

import type { RuntimeId } from '@shared/types';
import type { HandlerMap } from '../registry';
import { defineHandlers, fail } from '../registry';
import type { RuntimeEntry, RuntimeInstallerPart } from './types';

/** Runtime implementations keyed by `RuntimeId`. Generic over the entry so a
    module that only implements part of `RuntimeInstaller` can build a registry
    of its own part for its tests. */
export interface RuntimeRegistry<T extends RuntimeEntry> {
  /** The implementation for `runtime`. Throws `invalid` when there is none —
      a runtime that isn't built yet is refused honestly, not faked. */
  get(runtime: RuntimeId): T;
  /** Every registered implementation, for the one channel that identifies its
      run without naming a runtime (`llm:cancelPull`). */
  list(): readonly T[];
}

export function createRuntimeRegistry<T extends RuntimeEntry>(
  installers: readonly T[],
): RuntimeRegistry<T> {
  const byId = new Map<RuntimeId, T>(installers.map((installer) => [installer.id, installer]));
  return {
    get: (runtime) => {
      const installer = byId.get(runtime);
      if (!installer) {
        /* Deliberately no runtime name in the message: the renderer builds its
           wording from the code, and the name came from the renderer anyway. */
        throw fail('invalid', 'für diese Laufzeitumgebung gibt es hier keine Installation');
      }
      return installer;
    },
    list: () => installers,
  };
}

/** `llm:runtimeInstallPlan` / `llm:downloadRuntime` / `llm:cancelRuntimeDownload`. */
export function installChannelHandlers(
  registry: RuntimeRegistry<RuntimeInstallerPart<'plan' | 'download' | 'cancel'>>,
): HandlerMap {
  return defineHandlers({
    'llm:runtimeInstallPlan': async ({ runtime, buildId }) => ({
      ...(await registry.get(runtime).plan(buildId)),
      runtime,
    }),
    'llm:downloadRuntime': async ({ runtime, buildId }) => registry.get(runtime).download(buildId),
    'llm:cancelRuntimeDownload': async ({ runtime, downloadId }) =>
      registry.get(runtime).cancel(downloadId),
  });
}

/** `llm:localRuntimeStatus` / `llm:openRuntimeInstaller` / `llm:startLocalRuntime`. */
export function lifecycleChannelHandlers(
  registry: RuntimeRegistry<RuntimeInstallerPart<'status' | 'openInstaller' | 'start'>>,
): HandlerMap {
  return defineHandlers({
    'llm:localRuntimeStatus': async ({ runtime }) => ({
      runtime,
      status: await registry.get(runtime).status(),
    }),
    'llm:openRuntimeInstaller': async ({ runtime }) => registry.get(runtime).openInstaller(),
    'llm:startLocalRuntime': async ({ runtime }) => ({
      runtime,
      ...(await registry.get(runtime).start()),
    }),
  });
}

/** `llm:pullModel` / `llm:cancelPull`. */
export function pullChannelHandlers(
  registry: RuntimeRegistry<RuntimeInstallerPart<'pull' | 'cancelPull'>>,
): HandlerMap {
  return defineHandlers({
    'llm:pullModel': async ({ runtime, modelId, hfFile }) =>
      registry.get(runtime).pull(modelId, hfFile),
    /* `llm:cancelPull` names its run by `pullId` alone, so there is no runtime
       to look up: the cancel goes to every registered runtime, and the ones
       that don't know the id do nothing — which is already what this channel
       promises for an unknown id. */
    'llm:cancelPull': async ({ pullId }) => {
      for (const installer of registry.list()) await installer.cancelPull(pullId);
    },
  });
}
