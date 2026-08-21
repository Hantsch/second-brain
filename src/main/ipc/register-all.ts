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
import { projectHandlers } from './projects';
import { reminderHandlers } from './reminders';
import { searchHandlers } from './search';
import { settingsHandlers } from './settings';
import { shellHandlers } from './shell';
import { todoHandlers } from './todos';
import { vaultHandlers } from './vault';
import { windowHandlers } from './window';

export function buildHandlers(services: Services): HandlerMap {
  return {
    ...vaultHandlers(services),
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
