/* Numbers that the core and the tile need to read identically.

   The renderer isn't allowed to import `src/core/`, and the core knows nothing
   about the UI. What both need lives here instead — with a note on where the
   other side defines it. If one side drifts, the comment next to it is wrong,
   not the number. */

/**
 * How many days `DashboardData.journal.moodTrend` spans.
 * Counterpart: `MOOD_TREND_DAYS` in `src/core/overview/types.ts`.
 */
export const MOOD_TREND_DAYS = 14;
