/* Zahlen, die Kern und Kachel gleich lesen müssen.

   Der Renderer darf `src/core/` nicht importieren, der Kern kennt keine
   Oberfläche. Was beide brauchen, steht deshalb hier — mit dem Vermerk, wo die
   andere Seite es festlegt. Weicht eine Seite ab, ist der Text daneben falsch,
   nicht die Zahl. */

/**
 * So viele Tage weit reicht `DashboardData.journal.moodTrend`.
 * Gegenstück: `MOOD_TREND_DAYS` in `src/core/overview/types.ts`.
 */
export const MOOD_TREND_DAYS = 14;
