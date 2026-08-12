/* Erinnerungen: Fristen, überfällige Antworten, stagnierende Projekte.

   Gerechnet wird in `core/overview/reminders`. Der Kanal gibt zwei Dinge dazu,
   die der Kern nicht kennt: die Sitzungen (sonst gilt ein Projekt als
   stagnierend, an dem gestern im Terminal gearbeitet wurde) und den Ruhezustand
   aus `.secondbrain/overview.json`.

   `reminders:snooze` prüft, dass es die Erinnerung wirklich gibt. Eine Marke
   ruhig zu stellen, die niemand kennt, wäre ein Knopf, der Erfolg meldet und
   nichts tut. */

import { reminders } from '@core/overview';
import { isoDay } from '@core/vault/paths';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { claudeSessions, overviewIndex, overviewSettings, overviewStateFor } from './overview-deps';
import { OVERVIEW_STATE_FILE } from '../overview-state';
import type { Services } from '../services';

/** Länger als ein Jahr ruhig zu stellen heißt: vergessen. Das ist kein Ruhen. */
const MAX_SNOOZE_DAYS = 365;

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function reminderHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'reminders:list': async () => {
      const now = new Date();
      const today = isoDay(now);
      const state = await overviewStateFor(services, today);
      await claudeSessions(services);
      return reminders(overviewIndex(services), overviewSettings(services), now, state.snoozes());
    },

    'reminders:snooze': async ({ id, days }) => {
      const count = Math.trunc(Number(days));
      if (!Number.isFinite(count) || count < 1 || count > MAX_SNOOZE_DAYS) {
        throw fail('invalid', `days: erwartet 1 bis ${MAX_SNOOZE_DAYS}`);
      }
      const now = new Date();
      const today = isoDay(now);
      const state = await overviewStateFor(services, today);
      await claudeSessions(services);
      const current = reminders(
        overviewIndex(services),
        overviewSettings(services),
        now,
        state.snoozes(),
      );
      if (!current.some((reminder) => reminder.id === id)) {
        throw fail('not-found', 'diese Erinnerung gibt es nicht');
      }
      await state.snooze(id, shiftDay(today, count));
      /* Die Datei hat sich geändert — damit lädt das Dashboard die Liste neu. */
      services.sendEvent('event:vault-changed', {
        paths: [OVERVIEW_STATE_FILE],
        external: false,
      });
    },

    /* Der Rückweg. Eine Ruhezeit auf „heute" zu setzen wäre keiner: gemahnt wird
       erst wieder, wenn sie abgelaufen ist. Also wird der Eintrag entfernt.
       Ist keiner da, hat der Aufrufer nichts zurückzunehmen — das ist ein
       Fehler, nicht ein stiller Erfolg. */
    'reminders:unsnooze': async ({ id }) => {
      const state = await overviewStateFor(services, isoDay(new Date()));
      if (state.snoozedUntil(id) === null) {
        throw fail('not-found', 'diese Erinnerung ruht nicht');
      }
      await state.unsnooze(id);
      services.sendEvent('event:vault-changed', {
        paths: [OVERVIEW_STATE_FILE],
        external: false,
      });
    },
  });
}
