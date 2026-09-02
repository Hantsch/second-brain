# Sprint S12 review — A project gathers itself

## Overview

**Goal:** a project can be condensed into one file the same way an area already can (M12): the
run reads state, notes, todos/waiting-on, agent sessions and journal mentions and writes _state_,
_next step_, _waiting on_ and _learned_; the Project knowledge tab shows the diff, accepts it
hash-guarded or rejects it with a reason; and Maintenance says when a project's condensation is
due or missing.

| Story | Status | Commit |
| ----- | ------ | ------ |
| [044 — A project can be condensed into one file](../../requirements/done/044-a-project-can-be-condensed-into-one-file.md) | done | `044: a project can be condensed into one file` |
| [045 — I see what a project's condensation changes before it's written](../../requirements/done/045-i-see-what-a-projects-condensation-changes-before-its-written.md) | done | `045: Project knowledge tab — diff, accept, reject-with-reason, delete` |
| [046 — Maintenance says a project's condensation is due](../../requirements/done/046-maintenance-says-a-projects-condensation-is-due.md) | done | `046: maintenance flags a project's due or missing condensation` |

All three stories done, all on branch `sprint/S12`, cut from `dev`. No stories blocked.

## Implemented stories

**044 — A project can be condensed into one file.** Generalised `src/core/condense/` from
area-only to level-aware: a parameterised section set, the `condense-project` task kind
(sensitive, `in: 8000 / out: 1200`), the `agent:<kind>/<pathKey>` citation form for a linked Claude
session, deterministic project input selection over four bounded groups (notes, todos incl.
`waiting_on`, day mentions within a 90-day window, session transcript tails), the four-section
prompt (_state_ · _next step_ · _waiting on_ · _learned_), and the hash-guarded run + write.
Backend only — no IPC, no screen yet.

**045 — I see what a project's condensation changes before it's written.** Generalised the five
existing `condense:*` IPC channels with a required `unit: 'area' | 'project'` discriminator (path
resolution moved server-side, out of the renderer). Extracted the area tab's body into a shared
`CondensedUnitPanel`, added an unconditional "Knowledge" tab to the project screen with the diff/
accept/reject-with-reason/delete flow, mirroring story 043's delete for areas. Also wired the
missing shell dependency (`claudeTranscriptTail()`) that 044 needed but shipped without, since 044
was backend-only.

**046 — Maintenance says a project's condensation is due.** Extended the existing area-only
`condensation-due` gardener check with a project arm: "condensation due" (stale input hash) or
"condensation missing" (no artifact at all), informational severity, no fix action, routed from
Maintenance to the new Knowledge tab. Confirmed the project artifact already gets the same
orphan/near-duplicate exemption and searchability as other condensed docs, with no source change
needed.

## Findings & decisions

Aggregated from `## Decisions (Sprint)` across the three stories, the build feedback, and the
review findings — input for the next sprint planning.

- **User decisions taken at the clarification round (2026-09-02), all binding, all followed
  as-is:** `condense-project` is sensitive like `condense-area`; the agent-session citation
  (`agent:<kind>/<pathKey>`) is click-through to the session view; the project artifact reuses the
  area's soft cap (~2000 words/12k chars), token budget (8000 in/1200 out) and 90-day input
  window; contradictions are written into _state_ as prose, not a dedicated section; a human edit
  is flagged in the diff, no new protection machinery; delete is in scope this sprint (mirroring
  043); the IPC channels were **generalised with a `unit` discriminator** rather than duplicated
  into a `condense:project:*` family; the due-ness finding surfaces in Maintenance only, no
  project-overview badge this sprint.
- **The concept's §7 reversal trigger (per-level vs. uniform sections) did not flip.** 044's
  refine explicitly checked: the project prompt carries rules the area prompt does not (a fourth
  input group, the session citation form, `waiting_on`), so per-level sections stay the right
  call rather than collapsing into one shared shape.
- **044 shipped one real gap: no shell wiring for reading an agent session's transcript.** It
  designed `CondenseProjectSources.readTranscriptTail` but left the implementation for whoever
  built the caller; 045 had to add `claudeTranscriptTail()` to make agent-session input actually
  reach a run, rather than citing sessions with zero real content. Worth flagging for future
  cross-story handoffs: a story that defines an interface a later story implements should say so
  explicitly in its Done section, not leave it to be discovered.
- **Two review-hard findings in 044 (F1, F5) were real correctness bugs caught only by the second
  review round**, not the first: a POSIX-session citation crash and a project's condensed artifact
  polluting its own todo list / freshness signal. Both fixed; worth noting that a single review
  pass did not suffice for this story's risk tier, consistent with the `deliverable-hard` model
  hint it carried.
- **One accepted, documented risk carried forward, not new to this sprint:** new `SectionKind`
  values (`next-step`, `waiting-on`, `learned`) are recognised vault-wide by the document-language
  migration scanner, the same precedent story 037 already set for the area's own section names.
  Not a new class of risk, but it does raise the probability of an unrelated human heading being
  folded, since "Next step"/"Learned" are more common free-form prose headings than "Direktiven"/
  "Muster". No action taken this sprint; worth a note for whoever next touches
  `section-migration.ts`.
- **A raw-YAML-frontmatter rendering issue in the condensed panel is pre-existing**, confirmed
  identical in the area tab before this sprint's refactor — filed as a future finding, not fixed
  here (correctly out of scope for 045).
- **Full sprint cut ahead of any live acceptance of M12** (and M4/M6/M9/M10/M11), by direct user
  decision at the roadmap cut. This sprint adds more write-path surface into the real vault on top
  of that same accepted, not-yet-reduced risk — named again here since it is now one condensation
  mechanism deeper.

## Blocked / open

None. All three stories are done; no story required a user decision it could not get from the
clarification round or the recorded binding decisions.

**Carried forward, not decided this sprint (deliberately deferred, per binding decisions):**
project condensation delete is now in scope and shipped (045), but a project-overview "possibly
outdated" badge (046-Q1) was explicitly deferred — a candidate follow-up story if the user wants
due-ness visible outside Maintenance.

**Live acceptance still pending** for all of M14 (044/045/046), same as M4/M6/M9/M10/M11/M12 — see
"built, live acceptance pending" in the roadmap update below. `testplan.md` in this folder is the
guide for that walkthrough.
