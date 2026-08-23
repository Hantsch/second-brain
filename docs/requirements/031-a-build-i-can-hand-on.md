---
id: 031
title: A build I can hand on
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Depends on [[030-the-app-is-called-guston]] — the artifact name, the readme in the package and
the window the recipient sees all have to carry the final name.

## Requirement

I want to give this app to someone. Right now the only thing standing between the repo and
another person's machine is `npm run package`, which drops a portable `.exe` into `dist/` and
says nothing about what to do with it.

I want one command that produces a ZIP I can copy onto a USB stick and hand over. The person who
gets it unpacks it, starts it, and has a usable app — without Node, without a checkout, without
me on the phone. And I want to be able to hand it over without worrying: nothing of mine may be
in that file, not a key, not a vault, not a screenshot of my own journal.

One thing is already decided (user, 2026-08-23): **settings and keys stay on the recipient's
machine**, in `userData` with `safeStorage` as today. The stick carries the application, not the
data. A truly portable "everything next to the .exe" mode is a different story, and one with a
key-encryption problem attached.

## Acceptance Criteria

- [ ] One documented command builds and produces a single ZIP under `dist/`, named from the app
      name and the version in `package.json` — no second place where a version is maintained.
- [ ] The ZIP unpacked on a Windows machine with no Node and no repository starts: the app comes
      up, lets the recipient create or pick a vault, and is usable with no model configured
      (guardrail 1) — every LLM surface shows its honest "no model configured" state instead of
      failing.
- [ ] The ZIP contains a short readme for the recipient: how to start it, what a vault is, where
      their data lives, and what needs an API key. Language per Q2.
- [ ] The ZIP contains nothing of mine: no API key, no `.secondbrain` from a real vault, no
      `.demo-vault`, no `.screenshots`, no `.env`, no source checkout. Verified by an automated
      check in the build script over the produced archive's file list, not by looking at it once.
- [ ] The command runs from a clean checkout after `npm ci` with no manual step in between, and
      re-running it replaces the previous artifact instead of piling up.
- [ ] The build fails loudly rather than shipping something wrong: if the verify gate is red or
      the content check finds an unexpected file, no ZIP is produced.
- [ ] `README.md` documents the command and what the recipient gets.
- [ ] The story records what is deliberately _not_ covered — code signing (SmartScreen will warn
      the recipient), auto-update, and any platform not named in Q1 — instead of leaving it to be
      discovered on the stick.

## Open Questions

- **Q1 — Which platforms?** Windows only (today's `--win portable` target), or a mac/linux
  artifact too? Every extra target needs a machine that can build and test it.
- **Q2 — Which language is the recipient readme in?** German, English, or both. The app itself
  ships both UI languages; the readme is the first thing the recipient reads, before any setting
  exists.
- **Q3 — Does the ZIP carry a starter vault?** An empty vault with the folder skeleton and a
  first page inside the archive, or does the app create one on first start when the recipient
  picks a folder?
- **Q4 — Does a handed-on copy need a first-start screen of its own?** The existing onboarding
  was written for me, on a machine that already had a vault. Choosing a language, choosing a
  vault folder and understanding "no model configured" is a different first minute. In scope, or
  its own story once someone has actually tried the stick?
- **Q5 — Unsigned, knowingly?** Shipping unsigned means a SmartScreen warning on every recipient
  machine. Accept and document it, or is obtaining and wiring a signing certificate part of this
  story?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
