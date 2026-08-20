/* English texts of the journal's month calendar — same key set as
   `de-journal-calendar.ts` (a test checks it). Split out from
   `en-journal.ts` for the same reason: that file is already large. */

export const enJournalCalendar = {
  'journal.calendar.title': 'Month calendar',
  'journal.calendar.prevMonth': 'Previous month',
  'journal.calendar.nextMonth': 'Next month',
  'journal.calendar.today': 'Today',
  'journal.calendar.expand': 'Expand the calendar',
  'journal.calendar.collapse': 'Collapse the calendar',
  /* Deliberately not "Open the entry of {date}" — `journal.open` (the day
     list's row label) already says exactly that for the same date, and
     since 010/D2 renders both controls on the same screen, two elements
     with an identical accessible name would be indistinguishable to
     assistive tech and to `getByRole`. */
  'journal.calendar.open': 'Open the calendar day {date}',
  /* The reason the day isn't clickable — not just "disabled". */
  'journal.calendar.future': 'In the future, no entry yet',
  'journal.calendar.hasEntry': 'Has an entry',
  /* 010/D3: the visible half of the grid's keys — the month steps have their
     own buttons, the arrows inside the grid have nothing but this line. */
  'journal.calendar.keys': 'Arrow keys move in the grid, page up and down the month',
  /* 010/D4: the day is over, has a file, but `closed` is still `null` — never
     for today itself (see `isDayOpen`). */
  'journal.calendar.unfinished': 'Day not closed out yet',
} as const;
