/* Help pages for the first rail screens. Each claim is read from the screen's own code and
 * its English strings; a page says only what the screen does. */

import type { HelpPageDef } from './types';

export const DASHBOARD_PAGE: HelpPageDef = {
  slug: 'screen-dashboard',
  title: 'Dashboard',
  summary: 'The movable modules that show what you worked on, what is due and who you wait for.',
  body: `# Dashboard

The dashboard is the first screen. It is a grid of modules (tiles) that answers three
questions: what you worked on last, what is due, and who you are waiting for.

## What it shows

- A day summary above the grid: how many items are due today and how many answers are
  outstanding, or a line saying nothing is due and nobody is holding things up.
- An "unfiled" strip with the number of captured thoughts that have no home yet. It is absent
  when the number is zero.
- The tiles. The available modules are: quick capture, ask, recent work, deadlines, waiting on,
  todos (work and private), active projects, inbox, stale projects, journal streak, Claude
  sessions, Care (maintenance), loose ends and upcoming mentions.

## Main actions

- **Capture a thought** (top right) opens the capture overlay.
- **Modules** opens the catalogue of tiles. There you show or hide a tile and reset the
  arrangement.
- Move a tile by dragging it, or with the keyboard through the tile's move control. Each tile
  has a menu with its width (one to four columns) and a hide action. A hidden tile stays in the
  catalogue.
- The question tile asks Gaston a question from the dashboard; the capture tile saves a thought
  to the inbox.
- A deadline can be snoozed from its tile.

## Without data

With nothing in the vault the dashboard shows the card "No trace in the vault yet" and what
will appear once projects, todos and journal entries exist. If the arrangement cannot be
loaded, the screen says so instead of guessing a layout.
`,
};

export const CHATS_PAGE: HelpPageDef = {
  slug: 'screen-chats',
  title: 'Chats',
  summary: 'The history of every question you asked Gaston, readable on its own.',
  body: `# Chats

Asking Gaston is an overlay over whatever screen you are on. The Chats screen is where the
finished conversations stay reachable.

## What it shows

- A list of threads on the left, with a search field.
- The selected conversation on the right, read-only, with its answers and their citations.
  Opening a citation shows the cited passage in a panel.
- The selected chat is kept in the address, so Back and a reload land on the same chat.

## Main actions

- Pick a chat to read it.
- **Continue in chat** hands the thread to the ask overlay, which owns the composer, the
  streaming answer and filing an answer back. The read-only feed itself has no file-back
  button.

## Without data

With no chat the screen says "No chat yet" and that the first question starts the first chat.
`,
};

export const PROJECTS_PAGE: HelpPageDef = {
  slug: 'screen-projects',
  title: 'Projects',
  summary: 'Where did you leave off: the project list, its detail, and all todos.',
  body: `# Projects

The Projects screen answers "where did I leave off?". It has two views, "Projects" and "All
todos", because todos answer the same question from the other direction.

## Projects view

- A list on the left and the detail on the right. On open, the project with the most recent
  trail is selected.
- The list can be filtered by area and by status (all, or running only) and sorted.
- The detail has a head above its tabs with the title, scope, status, deadline and priority.
  Only the status shows where its value came from (set by you, accepted from a suggestion, or
  written by filing). Below it are the tabs **Overview**, **Knowledge** and **Sessions**.
  Overview holds the next step, the "waiting for" entries, the todos, the status note and the
  filed notes. Knowledge shows the project's condensed state, with an action to
  condense it. Sessions lists agent sessions for the project's working directory; the tab
  is only offered when the project has one, unless a setting always shows it.
- **Open the project file** opens the project's Markdown file.

## Main actions

- **New project** asks for a title, an area, a status and an optional first next step, then
  creates a project folder with one file.
- Edit the next step in place: Enter saves, Esc cancels. If the file changed outside the app,
  the screen offers to take the outside version or keep yours.
- **Get a suggestion** proposes a status and next step. Nothing is written until you accept
  it. Without a model the suggestion is derived from rules over what is on file.
- Add a "waiting for" entry, or mark one as answered. An answered entry stays in the file with
  "resolved: true"; the list stops showing it.
- Keyboard: j and k or the arrow keys select, Enter opens the file, n creates a project, t adds
  a todo, x checks a todo off, m adds a note, w adds a waiting-for entry.

## All todos view

All todos, split into two modules, work and private. Within each, todos are grouped by due
date with overdue first and "no deadline" last. Each row shows the name of its project as plain
text; the row does not link to the project. Todos that belong to no project are listed too. By
default only open todos show; **Show completed** adds the finished ones. You can check a todo
off, edit it, or add one. A todo added here has no project: it lands in today's journal entry,
and you attach it to a project in the project detail.
`,
};

export const JOURNAL_PAGE: HelpPageDef = {
  slug: 'screen-journal',
  title: 'Journal',
  summary: 'One file per day: write it, talk to the coach, close the day.',
  body: `# Journal

The journal holds one entry per day. A journal entry looks back on the day; a note is a
thought that stands on its own.

## What it shows

- A list of days on the left with "Today" on top and named gaps for days without an entry.
  The arrow keys change the day.
- The selected day on the right: the entry text, the timeline of the conversation, and the
  facts the day close found and you confirmed.
- Mood and energy of the day.

## Main actions

- Write the entry. This works without a model.
- **Talk to the coach** with one of three stances: Listen (filed as is, no answer), Tips (a
  short listen, then at most three small steps) and Analyse (grounded in real earlier
  entries, shown as "It sounded similar on these days"). Ctrl+1 to Ctrl+3 change the stance.
- A line above the field says whether the conversation goes to a remote provider, runs
  locally, or has no model assigned. With no model the entry is still written and the screen
  says so.
- **Close the day** finds todos, things you wait on, people, projects, areas, tags, mood and
  energy in the text of the day. It is a proposal: nothing is written until you choose
  **Apply and close**. You can edit each item, **Discard**, or **Run again**. Without a model
  the proposal is found by rules and says so.
- **Start interview** asks one question at a time; you answer, skip, or leave and write
  yourself.
`,
};
