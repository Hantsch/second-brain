/* Dashboard: die Inhalte in einem Rutsch, und die Anordnung der Module.

   Die Inhalte rechnet `core/overview/dashboard` aus dem Index und der
   Sitzungsliste. Der Kanal selbst tut drei Dinge, die der Kern nicht kann: er
   holt die Sitzungen (Einstellung `overview.useClaudeSessions`), er gibt den
   Ruhezustand aus `.secondbrain/overview.json` hinein, und er wählt die Sprache
   der Beschriftungen.

   Der Pflegewert wird nicht erfunden: solange kein Pflegelauf vorliegt, geht
   `gardener: null` hinein und `healthKnown: false` heraus. Die Kachel sagt dann
   „noch nicht geprüft" — eine 100 wäre gelogen.

   Die Anordnung liegt in den Vault-Einstellungen und reist mit dem Vault. Beide
   Wege — lesen und schreiben — laufen durch `normalizeLayout`, weil beide
   Quellen ungeprüft sind. */

import { dashboardData } from '@core/overview';
import { isoDay } from '@core/vault/paths';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { normalizeLayout } from './dashboard-layout';
import {
  SESSION_LIMIT,
  agentWorkSessions,
  gardenerSummary,
  overviewIndex,
  overviewLabels,
  overviewSettings,
  overviewStateFor,
} from './overview-deps';
import type { Services } from '../services';
import { defaultDashboardLayout } from '../settings-defaults';

export function dashboardHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'dashboard:data': async () => {
      const now = new Date();
      const today = isoDay(now);
      const state = await overviewStateFor(services, today);
      /* Erst die Sitzungen: sie schreiben `lastTouch` und `stale` fort, und der
         Index muss nachgezogen sein, bevor die Projekte gelesen werden. */
      const sessions = (await agentWorkSessions(services)).slice(0, SESSION_LIMIT);
      const index = overviewIndex(services);

      return dashboardData(index, sessions, overviewSettings(services), now, state.snoozes(), {
        labels: overviewLabels(services),
        gardener: await gardenerSummary(services),
      });
    },

    'dashboard:layout': () => {
      const stored = services.settings.vault()?.dashboard;
      const now = new Date().toISOString();
      return stored === undefined
        ? defaultDashboardLayout(now)
        : normalizeLayout(stored, stored.updated);
    },

    'dashboard:setLayout': async ({ layout }) => {
      if (!services.settings.vault()) throw fail('no-vault', 'kein Vault geöffnet');
      const next = normalizeLayout(layout, new Date().toISOString());
      await services.settings.setVaultSection('dashboard', next);
      return next;
    },
  });
}
