/* Reminders: deadlines, overdue replies, stagnating projects.

   The calculation happens in `core/overview/reminders`. The channel adds two
   things the core doesn't know about: the sessions (otherwise a project
   worked on yesterday in the terminal would count as stagnating) and the
   snooze state from `.secondbrain/overview.json`.

   `reminders:snooze` checks that the reminder actually exists. Snoozing a
   marker nobody knows about would be a button that reports success and does
   nothing. */

import { reminders } from '@core/overview';
import { isoDay } from '@core/vault/paths';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { claudeSessions, overviewIndex, overviewSettings, overviewStateFor } from './overview-deps';
import { OVERVIEW_STATE_FILE } from '../overview-state';
import type { Services } from '../services';

/** Snoozing for longer than a year means: forgetting. That's not snoozing. */
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
      /* The file has changed — this makes the dashboard reload the list. */
      services.sendEvent('event:vault-changed', {
        paths: [OVERVIEW_STATE_FILE],
        external: false,
      });
    },

    /* The reverse path. Setting a snooze to "today" wouldn't be one: it only
       nags again once it has expired. So the entry is removed instead.
       If there's none, the caller has nothing to undo — that's an
       error, not a silent success. */
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
