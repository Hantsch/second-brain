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
import { createLlamaCppInstallPart } from './runtime/llamacpp-install';
import { createLlamaCppPullPart } from './runtime/llamacpp-pull';
import { createLlamaCppStartPart } from './runtime/llamacpp-start';
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
 * llama.cpp as one `RuntimeInstaller` (033, D6/D7/D9). Install (plan,
 * download, cancel, status, open — D6), the model pull (D7) and the minimal
 * start (D9 — `llama-server` with the story's fixed conservative flags) are
 * all wired here.
 *
 * `status`'s server probe (D7) and `start`'s own readiness poll (D9) both
 * need an explicit `fetchImpl` to ever run at all — neither silently
 * defaults to the real network from an unconfigured caller — so the real
 * `fetch` is that explicit wiring, and this is the one place production
 * supplies it.
 */
function llamaCppInstaller(services: Services): RuntimeInstaller {
  return {
    ...createLlamaCppInstallPart(services, { statusFetchImpl: fetch }),
    ...createLlamaCppPullPart(services),
    ...createLlamaCppStartPart({ fetchImpl: fetch }),
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
