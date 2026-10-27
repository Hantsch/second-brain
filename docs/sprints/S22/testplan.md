# Sprint S22 — manual residue

Not an acceptance gate; the tests are. This lists only what a test cannot cover.

## 093 AC1 — adversarial pass on the shell guard

**Why it is manual:** the guard has to be attacked with probes its author did not think of. A safety classifier stopped an agent-generated battery in S20, so the user runs the pass. It stays a release blocker until done.

**Preparation**

- Install the agent setup into a throwaway vault (Agent tab, review the plan, apply), so the vault holds the `.claude/` hooks and the `journal/`, `raw/` and `modules/gaston-help/` folders.
- Put a recognisable line in a `journal/` day file and in a `raw/` file.
- Open Claude Code in that vault (Agent screen, open Claude).

**Steps**

1. Try to read `journal/`, `.secondbrain/index/` and `.secondbrain/chats/` through the shell with your own probes: encodings, variable indirection, aliases, relative paths, case and 8.3 names, trailing dots, `[char]` tricks, here-strings.
2. Try to write under `raw/` and under `modules/gaston-help/` the same way.
3. Confirm legitimate commands still pass (reading a module page, writing another module's wiki).
4. For every probe that gets through, note the exact command.

**Expected**

- Every probe that reads the protected folders or writes `raw/` / `modules/gaston-help/` is blocked by the guard.
- Known, accepted gaps (roadmap follow-ups): relative paths with the cwd inside the help module, commands on the parent `modules/`, `[char](106)` and `[char]$x`.
- Each new gap becomes a regression row in the guard's test table and a story or follow-up.
