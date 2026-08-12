---
id: 008
title: Agent sessions move inside projects
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

Agent work is part of the picture of a project, not a screen beside it. What the
agents did *is* what happened on the project — that is exactly the answer to "what
did I last work on, and where did I leave off?"

The link already exists twice, half each: the work trace in the project detail shows
that project's sessions, and the agents screen lists agent projects with a picker to
link them to a vault project. Two entry points into one subject, and neither is the
obvious one.

So: agent sessions become a tab inside Projects. The all-sessions view stays as the
entry point for agent projects that are not linked yet.

Depends on story 001 (agent session browser), which is done.

Target picture: [concepts/navigation.md](../concepts/navigation.md).

## Acceptance Criteria

- [ ] The rail entry "Agents" is gone.
- [ ] A project has a "Sessions" tab showing its agent sessions, with the transcript
      view reachable from there.
- [ ] Projects reaches an all-sessions view that lists agent projects across both
      CLIs (Claude, Codex), including ones not linked to a vault project.
- [ ] Linking an agent project to a vault project is possible from there, and the
      sessions then appear in that project's tab.
- [ ] The existing work trace and the new tab are one thing, not two views of the
      same data side by side.
- [ ] Deep links keep working: `#/agents`, `#/agents?a=codex&p=<key>&s=<id>` and
      everything in between land on the equivalent place.
- [ ] The four honest states survive the move: loading, error, "not configured"
      (with the missing directory named), and empty.
- [ ] The switch between Claude and Codex stays available in both views.
- [ ] Works without a configured model — reading sessions needs no LLM.

## Open Questions

- Where does the all-sessions view hang? A tab at the Projects top level ("All
  sessions") beside the project list, or a separate route under Projects?
- A project with no linked agent project: does the Sessions tab stay hidden, or show
  an empty state offering to link one? Hidden is calmer; visible is discoverable.
- Agent projects that will never map to a vault project (one-off directories) —
  do they need to be dismissable, or do they just stay in the list?

## Plan

<Filled by `/ai-scrum:refine 008`.>

## Deliverables

<Filled by `/ai-scrum:refine 008`.>

## Model Hints

<Filled by `/ai-scrum:refine 008`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 008`.>

## Done

<Filled by `/ai-scrum:build 008`.>
