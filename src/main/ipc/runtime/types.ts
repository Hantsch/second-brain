/* The shape every local runtime implements (033, decision "shape of the shared
 * abstraction"): the imperative half of the runtime abstraction, the half that
 * touches `fs`, `child_process` and `shell`. The pure half — descriptors, plan,
 * build selection — lives in `src/core/llm/runtime/`, because guardrail 5
 * forbids core from importing Electron or spawning anything. That is the line
 * this interface is cut along.
 *
 * One method per runtime channel that carries a `RuntimeId`, so a handler is a
 * dispatch and nothing else (see `registry.ts`):
 *
 * | channel                        | method           |
 * | ------------------------------ | ---------------- |
 * | `llm:localRuntimeStatus`       | `status`         |
 * | `llm:runtimeInstallPlan`       | `plan`           |
 * | `llm:downloadRuntime`          | `download`       |
 * | `llm:cancelRuntimeDownload`    | `cancel`         |
 * | `llm:openRuntimeInstaller`     | `openInstaller`  |
 * | `llm:startLocalRuntime`        | `start`          |
 * | `llm:pullModel`                | `pull`           |
 *
 * `cancelPull` is the one method without a `RuntimeId` channel of its own:
 * `llm:cancelPull` identifies its run by `pullId` alone (019c), so the dispatch
 * cannot pick a runtime from the request and asks all of them instead — which
 * is harmless, because "an unknown id changes nothing" is that channel's
 * documented contract either way.
 *
 * The response shapes are taken from `IpcResponse<...>` rather than restated,
 * so an implementation cannot drift from the contract in `src/shared/ipc.ts`.
 * Only `runtime` itself is left out: the channel handler echoes that back from
 * the request, so no implementation has to remember to.
 */

import type { IpcResponse } from '@shared/ipc';
import type {
  EngineBuildId,
  HfPullFile,
  LocalRuntimeStatus,
  RuntimeId,
  RuntimePlan,
} from '@shared/types';

/** What `llm:startLocalRuntime` reports, minus the echoed `runtime`. */
export type RuntimeStartOutcome = Omit<IpcResponse<'llm:startLocalRuntime'>, 'runtime'>;

/** What `llm:openRuntimeInstaller` reports — no `runtime` in that response. */
export type RuntimeOpenOutcome = IpcResponse<'llm:openRuntimeInstaller'>;

export interface RuntimeInstaller {
  readonly id: RuntimeId;
  /** Running, installed but stopped, or absent — never a throw; a failed probe
      degrades to "not found". */
  status(): Promise<LocalRuntimeStatus>;
  /** Facts → judgement, without side effect. `buildId` (033, D10) overrides the
      GPU-scan-derived engine build for a llamacpp plan; Ollama's implementation
      ignores it, since it has no build variants. */
  plan(buildId?: EngineBuildId): Promise<RuntimePlan>;
  /** Starts the engine fetch and returns immediately; progress arrives over
      `event:install-progress`. Throws `invalid` instead of starting when the
      plan is blocked right now. `buildId` (033, D10) is the same override as
      `plan`'s, so confirming a changed build downloads that build, not the
      preselected one; Ollama's implementation ignores it. */
  download(buildId?: EngineBuildId): Promise<IpcResponse<'llm:downloadRuntime'>>;
  /** Aborts a running fetch. An id this runtime doesn't know changes nothing. */
  cancel(downloadId: string): Promise<void>;
  openInstaller(): Promise<RuntimeOpenOutcome>;
  start(): Promise<RuntimeStartOutcome>;
  /** Starts a model fetch and returns immediately; progress arrives over
      `event:pull-progress`. `hfFile` (033, D7) carries the Hugging Face file
      to fetch for `'llamacpp'` — Ollama's implementation ignores the second
      argument, since its pull is a native `/api/pull` tag. */
  pull(modelId: string, hfFile?: HfPullFile): Promise<IpcResponse<'llm:pullModel'>>;
  /** Aborts a running model fetch. An id this runtime doesn't know changes
      nothing — see the note on `llm:cancelPull` above. */
  cancelPull(pullId: string): Promise<void>;
}

/**
 * One runtime's contribution to the interface. Ollama's implementation is
 * assembled from three modules that already existed before this interface did
 * (`ollama-install.ts`, `ollama-runtime.ts`, `ollama-pull.ts`), each of which
 * owns exactly the channels it owned before — so each of them provides a part
 * of a `RuntimeInstaller` and `register-all.ts` composes the whole. The `id`
 * comes along in every part: it is what the registry keys on.
 */
export type RuntimeInstallerPart<K extends keyof RuntimeInstaller> = Pick<
  RuntimeInstaller,
  'id' | K
>;

/** The least a registry entry has to be: something that knows which runtime it is. */
export interface RuntimeEntry {
  readonly id: RuntimeId;
}
