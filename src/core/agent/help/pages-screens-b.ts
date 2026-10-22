/* Help pages for the remaining rail screens; see pages-screens-a.ts. */

import type { HelpPageDef } from './types';

export const KNOWLEDGE_PAGE: HelpPageDef = {
  slug: 'screen-knowledge',
  title: 'Knowledge',
  summary: 'Knowledge modules (wikis) and the sources that feed them.',
  body: `# Knowledge

Knowledge is the root of everything about the vault's knowledge. It has two tabs: **Modules**
and **Sources**.

## Modules

- A module is a small wiki under \`modules/<slug>/\`. The overview lists modules with their
  counts of sources, entities and concepts and when each was last condensed.
- **Create module** asks for a title and a purpose.
- Opening a module shows its own tabs: **Pages**, **Graph**, **Sources**, **Chronicle** and
  **Condensed**.
- **Condensed** folds the pages of a module into one overview. It runs only when you click
  **Condense this module**, and you see it as a diff before anything is written. You accept
  or reject it. A condensation is not cited as evidence; answers point to its sources.

## Sources

- **Take in a source** accepts a YouTube link, a web page URL, a file, or pasted text. The
  kind is recognised on its own.
- Choose a target module, or "File later". Without a target module the source rests unchanged
  in \`raw/\` and waits to be condensed.
- Condensing a source needs a model. The list shows the jobs and the sources taken in; a
  source already in the vault is not imported twice.

## Related routes

The search results (\`#/search\`) and the reader (\`#/read\`) belong to this area and have no
rail entry of their own.
`,
};

export const NOTES_PAGE: HelpPageDef = {
  slug: 'screen-notes',
  title: 'Notes',
  summary: 'Notes sorted by area, the unfiled inbox, and condensed areas.',
  body: `# Notes

A journal entry looks back on the day; a note is a thought that stands on its own. Notes are
grouped in areas, which are ongoing responsibilities with no end, one file each under
\`areas/\`.

## What it shows

- A composer at the top: a field for the note and an area to file it under, or "Decide later".
  Ctrl+Enter saves.
- The areas, each with its number of notes and open todos. An area can be expanded to show its
  notes.
- An "unfiled" filter listing captured dumps that have no home. For every dump Gaston proposes
  a target and says why; filing is optional. Filed dumps are listed collapsed below.
- Inside an area, three tabs: **Notes**, **Todos** and **Condensed**.

## Main actions

- Save a note. Move a note to another area.
- **New area** takes a title and creates \`areas/<slug>.md\`.
- **Condense this area** folds the area into one page. You see a diff, then **Accept**, or
  **Reject** with a required reason that is kept with the area for the next condensation. If
  the file changed since the proposal was made, accepting reports a conflict and you run the
  condensation again.
`,
};

export const TASKS_PAGE: HelpPageDef = {
  slug: 'screen-tasks',
  title: 'Tasks',
  summary: 'The queue of background work Gaston runs: running, waiting and finished.',
  body: `# Tasks

The Tasks screen is the queue of work that runs in the background, not the list of your
todos. Todos live in a project (Projects, "All todos"), in an area's Todos tab and in the
dashboard todo tiles.

## What it shows

Three groups, in a fixed order:

- **Running**, with a progress indication and the model used.
- **Waiting**, with the queue position.
- **Finished**, with the outcome: done, failed or cancelled.

A task is one of these kinds: condense, close day, maintenance, take in source, interview
plan. A running maintenance check appears as a row of its own.

## Main actions

What a row offers depends on its state:

- A running row has **Stop**, except the running maintenance check, which has no button here
  (it is stopped with **Cancel check**, see Care).
- A waiting row has **Remove**.
- A finished row has no Remove. A failed one has **Retry** only when it can be retried; a
  maintenance check or a source taken in that failed is resumed or retried from its own screen
  instead. **View result** appears only on a done condense or close-day task.

## Without data

With an empty queue the screen shows an empty state. It does so only after the queue has
answered once, so it never claims "nothing" before it knows.
`,
};

export const GARDEN_PAGE: HelpPageDef = {
  slug: 'screen-garden',
  title: 'Care (garden)',
  summary: 'Maintenance against knowledge rot: checks, a health score, and findings.',
  body: `# Care (garden)

The rail entry is called "Care"; its route is \`#/garden\`. It runs maintenance checks over the
vault and lists what they find.

## What it shows

- A **health** score out of 100, with "Where the score comes from". Before the first complete
  check it says "Not checked yet".
- The findings, filterable by kind, module, weight and status (open, "Not a problem" or "Not
  now"). The kinds are: orphaned pages, broken
  wikilinks, catalogue drift, stale pages, contradictions, terms without a page, near
  duplicates, dumps left lying around, undistilled sources, projects without a next step,
  loose ends and condensations due.
- Whether the last check was interpreted with a model or ran machine checks only. Without a
  model the contradiction and loose-end stages are not checked, and the screen says so.
- Results you excluded can be shown again with "Show excluded results".

## Main actions

- **Check now** (or **Check again**) starts a run; progress shows the current check and the
  steps still to come. **Cancel check** stops it; **Continue check** resumes.
- Check only one kind, or only one module.
- On a finding, **This is not a problem** hides the finding and it stops counting against the
  health score. **Not now** hides it until a day you pick, then it comes back. Both can be
  undone.
`,
};

export const SETTINGS_PAGE: HelpPageDef = {
  slug: 'screen-settings',
  title: 'Settings',
  summary: 'Vault, languages, models, behaviour, customization, agent and about.',
  body: `# Settings

Settings has seven tabs. The open tab is kept in the address (\`#/settings?tab=models\`).

- **Vault**: the vault the app is working on.
- **Languages**: the interface language, the document language and the conversation language
  (the language the app answers in when asking and in the journal) are set separately. A
  switch translates foreign-language sources while distilling. A migration offers to update
  old-language headings.
- **Models**: providers, which model handles which task (task routing), the resource budget of
  this machine and a model recommendation. With no model set up, the tab offers a local model
  (Ollama), an API key (Anthropic, OpenAI, OpenRouter) or carrying on without a model.
- **Behaviour**: further switches for how the app acts.
- **Customization**: background, app icon and tray.
- **Agent**: whether Claude Code is on this machine, the agent setup and its protection. See
  the agent page of this module.
- **About**: the app version, the vault format, release notes and updates.

API keys are stored encrypted in the app's user data, never in the vault.
`,
};
