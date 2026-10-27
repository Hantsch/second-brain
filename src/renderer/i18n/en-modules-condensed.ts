/* English texts of a module's condensed tab. Same key set as
   `de-modules-condensed.ts` — a test enforces that. There is no delete block:
   a module's overview page is part of the module, so the panel offers no
   delete for it. The diff and reject dialogs read the shared `notes.condensed.*`
   copy. */

export const enModulesCondensed = {
  'modules.condensed.empty.title': 'Not condensed yet',
  'modules.condensed.empty.body':
    'A condensation folds the pages of this module into one overview. It runs only when you click Condense, and you see it as a diff before anything is written.',
  'modules.condensed.trigger': 'Condense this module',
  'modules.condensed.triggerAgain': 'Condense again',
  'modules.condensed.running': 'Condensation running',
  'modules.condensed.waiting': 'Waiting for the model — queue position {position}',
  'modules.condensed.handToAgent': 'Hand to agent',
  'modules.condensed.withAgent': "This module's condensation is with the agent.",
  'modules.condensed.failed.reason': 'Reason: {reason}',
  'modules.condensed.meta.condensedAt': 'Condensed {date}',
  'modules.condensed.meta.sources': '{count} sources',
  'modules.condensed.notEvidence':
    'This condensation is not cited as evidence — answers point to its sources instead.',
  'modules.condensed.accept': 'Accept',
  'modules.condensed.accept.conflict':
    'The file for {subject} changed since this proposal was made. Run the condensation again.',
  'modules.condensed.reject': 'Reject',
} as const;
