# Navigation

Status: **Built** — all five stories (002, 005, 006, 007, 008) are done, across sprints S01 and
S02, as of 2026-08-19. Acceptance of M1 is still the user's own call; see
[sprints/S02/review.md](../sprints/S02/review.md).

How the app is divided, and why. The target picture that the individual navigation
stories work towards, so they do not drift apart.

## Why

The rail grew to eleven flat entries. All of them look alike, so nothing about the
structure is legible:

- **Sources sits next to Knowledge** although it is its entrance. Nobody can see
  that ingesting a source feeds a knowledge module.
- **Inbox names a container, not a job.** It does not say what you do there, and it
  does not say that it is the continuation of capturing.
- **Capture exists twice.** The global window (`Ctrl+Shift+Space`) does the same
  thing, faster and from anywhere. The screen adds a place for something that is not
  a place.
- **Notes filed into `areas/` are invisible.** The vault has the folder, filing has
  the target, no screen reads it. A write path without a read path.
- **Projects and agent sessions are two screens for one subject.** The link exists
  twice, half each: the work trace in the project, the link picker in the agents
  screen.

## The distinction that orders everything

Three kinds of thing are currently in one list:

| Kind       | Test                                        | Examples                            |
| ---------- | ------------------------------------------- | ----------------------------------- |
| **Place**  | It persists. You browse it. You come back.  | Projects, Journal, Knowledge, Notes |
| **Action** | You do it, from anywhere, inside a context. | Capture, Ask                        |
| **System** | A chore. Rarely, deliberately.              | Maintenance, Settings               |

The rule that follows: **only places get a rail entry.** Actions get a hotkey and a
visible button in the shell, because you want them _out of_ a context — ask inside a
project, ask inside a module. System entries sit at the foot of the rail, visually
separated from the places.

## Target picture

Places, top of the rail:

| Key | Entry     | Contains                                                           |
| --- | --------- | ------------------------------------------------------------------ |
| 1   | Today     | Dashboard tiles, plus an "unfiled" strip when something is waiting |
| 2   | Projects  | Overview · Todos · Sessions · Project knowledge                    |
| 3   | Journal   | Daily entries and the coach, unchanged                             |
| 4   | Knowledge | Modules · Sources · Graph                                          |
| 5   | Notes     | The `areas/` — plus the "unfiled" filter that used to be the inbox |

Foot of the rail: **Maintenance**, **Settings**.

Not in the rail: **Capture** and **Ask** — shell buttons plus hotkey, with the search
scope preselected from the screen you are on.

Seven entries instead of eleven. "Sources feeds Knowledge" and "agent work belongs to
a project" become structurally visible instead of needing an explanation.

## What follows per area

**Knowledge** (was Modules). The name says what is inside; "module" named the
mechanism. Sources moves in as a tab, because it is the input side of the same thing.

**Notes** (new). The place for everything that belongs neither to a project nor to a
day — "speak your mind". It reads `areas/`, and it makes filing optional: a thought
you never file simply stays a note. The old inbox becomes a filter on it
("unfiled"), which is what finally answers "what am I supposed to do here?" —
nothing is required.

Since story 038, an opened area carries three tabs — notes, todos, condensed — and
`?tab=<notes|todos|condensed>` rides along with the existing `?a=<slug>` deep link to
seed which one opens first, the same way `?a=` itself and `?filter=unfiled` are
addressable states (`NotesScreen.tsx`).

**Projects** absorb the agent sessions. The agent workload is part of the picture of
a project, not a screen beside it. The all-sessions view stays as the entry point for
agent projects that are not linked to a vault project yet.

Since story 045, an opened project carries a knowledge tab alongside overview and
sessions, and `?tab=knowledge` rides along with the existing `?p=<slug>` deep link to
seed which one opens first, the same way an area's `?tab=condensed` is addressable
(`ProjectDetail.tsx`, `ProjectKnowledgeTab.tsx`).

**Capture and Ask** lose their rail entries and keep their screens as overlays. The
global capture window stays exactly as it is — it is already the better path.

## Rules that keep this honest

- **Renaming stops at the UI.** The vault format is untouched: `modules/`, `areas/`,
  frontmatter keys, and code identifiers keep their names. Only labels change.
- **No dead links.** Every route that disappears from the rail redirects to its new
  home, so deep links from citations, maintenance findings, and the command palette
  keep working.
- **Nothing hides behind a hotkey alone.** Every action that loses its rail entry
  gains a visible entry point in the shell and stays reachable from the command
  palette.
- **Both languages.** Every label goes through `t()`, in `de` and `en`.
- **No new emptiness.** A place that can be empty says what belongs in it and how to
  get something there.

## Not part of this

- **The dashboard tile system** stays as it is. Only the "unfiled" strip is added.
- ~~**Journal** is untouched.~~ Its place in the rail is unchanged: notes and the
  journal stay separate, dated day entries with a coach on one side, undated
  thoughts on the other. Its _inner_ structure is not untouched —
  [superseded by story 011](../requirements/011-journal-one-entry-not-two.md),
  which replaced the Day/Conversation tab split with one continuous stream.
