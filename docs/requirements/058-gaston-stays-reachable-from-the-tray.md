---
id: 058
title: Gaston stays reachable from the tray
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.5](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: no `Tray` is constructed anywhere in `src/main` (only comments reference one);
the app quits when the main window closes (`src/main/index.ts:89`, `:122`), taking the global
hotkey (`src/main/hotkey.ts:22`) and the hourly reminder notifier
(`src/main/reminder-notify.ts:126`) with it; `startMinimized: true` hides the window with no
tray and no `show()` in the second-instance handler (`src/main/window.ts:65`,
`src/main/index.ts:93`) — an unreachable app; `docs/ARCHITECTURE.md:16` claims a tray exists;
M13's close-during-run dialog has no live path without one (roadmap gap note).

## Requirement

The concept's first principle is that dumping costs nothing — a hotkey, a field, Enter, "even
when the app isn't in the foreground". But today the app is strictly foreground: closing the
window quits it, and with it die the global quick-capture hotkey and the reminder notifier. A
deadline that falls due in the evening is announced whenever I happen to open the app again,
not when it is due. The half of the app that is supposed to work in the background only exists
while the window is open.

Gaston should live in the tray: closing the window keeps it running — hotkey, reminders,
quick capture all stay alive — and the tray brings the window back. Quitting for real is an
explicit action. This also gives the `startMinimized` setting a legitimate meaning instead of
a soft-lock, gives M13's close-during-a-maintenance-run door its missing live path, and makes
ARCHITECTURE.md's tray claim true instead of drift.

## Acceptance Criteria

- [ ] A tray icon exists; its menu offers at least: open Gaston, quick capture, quit.
- [ ] Closing the main window keeps the app running in the tray (configurable; the behavior is
      stated where it is configured). Quit from the tray or an explicit menu action really
      quits, through the existing close-guard.
- [ ] The global quick-capture hotkey works while the main window is closed.
- [ ] The reminder notifier keeps running while the main window is closed; clicking a
      notification opens the window on the dashboard.
- [ ] `startMinimized` starts into the tray and is reachable from it; a second app start shows
      the window. The setting is either exposed in the settings UI or removed — no dormant
      toggle.
- [ ] ARCHITECTURE.md's description matches reality after this story.
- [ ] The M13 close-during-run warning is reachable through the tray quit path and covered by a
      test.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
