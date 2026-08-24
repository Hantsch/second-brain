/* Alle Bereiche zu einer Handler-Karte zusammensetzen.
   `buildHandlers` ist absichtlich ohne Nebenwirkung: der Test prüft damit, dass
   für jeden Kanal aus `IPC_CHANNELS` ein Handler existiert. */

import type { HandlerMap } from './registry';
import { register } from './registry';
import type { Services } from '../services';
import { agentHandlers } from './agents';
import { appHandlers } from './app';
import { areaHandlers } from './areas';
import { captureHandlers } from './capture';
import { chatHandlers } from './chat';
import { claudeHandlers } from './claude';
import { dashboardHandlers } from './dashboard';
import { gardenerHandlers } from './gardener';
import { indexHandlers } from './index';
import { ingestHandlers } from './ingest';
import { journalHandlers } from './journal';
import { llmHandlers } from './llm';
import { machineScanHandlers } from './machine-scan';
import { moduleHandlers } from './modules';
import { createInstallerPathTracker, createOllamaInstallPart } from './ollama-install';
import { createOllamaPullPart } from './ollama-pull';
import { createOllamaRuntimePart } from './ollama-runtime';
import { projectHandlers } from './projects';
import { reminderHandlers } from './reminders';
import { hfSearchHandlers } from './runtime/hf-search';
import { llamaAutoStartHandlers } from './runtime/llamacpp-autostart';
import { createLlamaLifecycleStartPart } from './runtime/llamacpp-engine-start';
import { createLlamaCppInstallPart } from './runtime/llamacpp-install';
import { llamaLifecycleHandlers, productionLifecycleDeps } from './runtime/llamacpp-lifecycle';
import { createLlamaCppPullPart } from './runtime/llamacpp-pull';
import type { RuntimeRegistry } from './runtime/registry';
import {
  createRuntimeRegistry,
  installChannelHandlers,
  lifecycleChannelHandlers,
  pullChannelHandlers,
} from './runtime/registry';
import type { RuntimeInstaller } from './runtime/types';
import { searchHandlers } from './search';
import { sectionMigrationHandlers } from './section-migration';
import { settingsHandlers } from './settings';
import { shellHandlers } from './shell';
import { todoHandlers } from './todos';
import { vaultHandlers } from './vault';
import { windowHandlers } from './window';

/**
 * llama.cpp as one `RuntimeInstaller` (033, D6/D7; 034, D3). Install (plan,
 * download, cancel, status, open — 033 D6), the model pull (033 D7) and the
 * start are all wired here. Since 034, D3 the start is the machine-derived,
 * tracked one from `llamacpp-engine-start.ts` — 033's fixed-flag
 * `llamacpp-start.ts` is gone, and the engine it starts is stopped again
 * through `llm:stopLlamaEngine` and on `will-quit`.
 *
 * `status`'s server probe and `start`'s port scan and readiness poll all need
 * an explicit `fetchImpl` to ever run at all — none of them silently defaults
 * to the real network from an unconfigured caller — so the real `fetch` is
 * that explicit wiring (`productionLifecycleDeps`), and this is the one place
 * production supplies it.
 */
function llamaCppInstaller(services: Services): RuntimeInstaller {
  return {
    ...createLlamaCppInstallPart(services, { statusFetchImpl: fetch }),
    ...createLlamaCppPullPart(services),
    ...createLlamaLifecycleStartPart(services, productionLifecycleDeps(services)),
    id: 'llamacpp',
  };
}

/**
 * Ollama as one `RuntimeInstaller` (033, D5), assembled from the three modules
 * that own its channels — this is the only place the parts come together, and
 * the only place a runtime is registered. Since D6 llama.cpp is the second
 * entry in the array below.
 */
function runtimeRegistry(services: Services): RuntimeRegistry<RuntimeInstaller> {
  // Shared between D2's download part and D3's runtime-lifecycle part so both
  // see the same "installer just downloaded" fact.
  const installerPathTracker = createInstallerPathTracker();
  const ollama: RuntimeInstaller = {
    ...createOllamaInstallPart(services, { installerPathTracker }),
    ...createOllamaRuntimePart(services, installerPathTracker),
    ...createOllamaPullPart(services),
    // Every part carries it; stated once here so the key this is registered
    // under doesn't depend on spread order.
    id: 'ollama',
  };
  return createRuntimeRegistry<RuntimeInstaller>([ollama, llamaCppInstaller(services)]);
}

export function buildHandlers(services: Services): HandlerMap {
  const runtimes = runtimeRegistry(services);
  return {
    ...vaultHandlers(services),
    ...sectionMigrationHandlers(services),
    ...indexHandlers(services),
    ...searchHandlers(services),
    ...captureHandlers(services),
    ...projectHandlers(services),
    ...areaHandlers(services),
    ...todoHandlers(services),
    ...journalHandlers(services),
    ...moduleHandlers(services),
    ...chatHandlers(services),
    ...ingestHandlers(services),
    ...llmHandlers(services),
    ...machineScanHandlers(services),
    ...installChannelHandlers(runtimes),
    ...lifecycleChannelHandlers(runtimes),
    ...pullChannelHandlers(runtimes),
    ...llamaLifecycleHandlers(services),
    ...llamaAutoStartHandlers(services),
    ...hfSearchHandlers(services),
    ...dashboardHandlers(services),
    ...reminderHandlers(services),
    ...gardenerHandlers(services),
    ...claudeHandlers(services),
    ...agentHandlers(services),
    ...settingsHandlers(services),
    ...windowHandlers(services),
    ...shellHandlers(services),
    ...appHandlers(services),
  };
}

export function registerAllHandlers(services: Services): void {
  register(buildHandlers(services));
}
