# Sprint S17 testplan — manual residue

`testplan: optional` — this file lists only the criteria marked `manual residue`, because they
cannot be automated for a real reason. Every other acceptance criterion in this sprint is proven
by an automated test; see [review.md](review.md)'s acceptance table. Nothing here is a gate —
both residues are already accepted and the sprint is done regardless of whether this walk-through
happens.

Both residues are in story 058 and share one root cause: Playwright's `_electron` cannot drive
real OS-level input (a global keyboard shortcut, a Windows Action Center notification click). The
code behind each is already covered by an automated test that drives the same handler directly.

## 1 — The quick-capture hotkey while the window is hidden in the tray

**Reason it cannot be automated:** Playwright's `_electron` cannot inject an OS-level global
shortcut; doing so would also hijack the developer's real desktop while the suite runs.

**Preparation:** Build and start Gaston normally (`npm start`, or the packaged app). Confirm a
vault is configured, `closeToTray` is on (Settings → Customization).

**Steps:**

1. Close the main window (title-bar close button, not Quit). Confirm it disappears from the
   taskbar but the tray icon remains.
2. Press the configured quick-capture hotkey (default shown in Settings → Customization; do not
   change it before this check).

**Expected result:** The quick-capture window appears immediately, the same as when the main
window is open. No error, no delay, no need to first reopen the main window.

## 2 — Clicking a real reminder notification while the window is closed

**Reason it cannot be automated:** clicking a real Windows toast in Action Center is not
reachable from Playwright; the click handler itself is covered by a unit test that drives it
directly, but the OS notification round-trip is not.

**Preparation:** Same as above, main window closed, app running in the tray. Create (or wait for)
a due reminder — the fastest way is a todo with a `due:` date of today set from the app before
closing the window, so the hourly reminder check fires within the hour. Alternatively, reduce the
check interval temporarily for this walk-through only (do not commit that change).

**Steps:**

1. Wait for the Windows toast notification for the due reminder to appear (Action Center).
2. Click the toast.

**Expected result:** The main window opens (or comes to the foreground if already open) and shows
the dashboard. The reminder that was clicked is visible there.
