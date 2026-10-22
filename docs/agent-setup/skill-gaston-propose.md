---
name: gaston-propose
description: Write a proposal for a change Gaston must confirm before it is applied. Use for any change outside a module wiki.
---

# Propose a change

A proposal is how you change anything you may not write directly. Gaston shows it to the
person, who accepts or rejects it. Nothing is applied silently.

## Steps

1. Read the CLAUDE.md in the vault root, and read the target file in full.
2. Compute the sha256 of the target exactly as you read it. If the target does not exist yet,
   say so instead of giving a hash.
3. Write one file per change to `.secondbrain/agent/proposals/`. Never bundle several changes
   into one file.
4. End the run with one report in `.secondbrain/agent/runs/`.

## What a proposal contains

- The target path, relative to the vault root.
- The new content, in full.
- The reasoning: why the change is right, with the sources it rests on.
- The sha256 of the target as you read it, so Gaston can tell if the file changed since.
- The run that wrote it.

## Never

- Target `journal/` or `raw/`.
- Write the target itself. Only the proposal file is written.
- Propose a change you cannot justify from the vault.

The exact proposal and report formats follow in later versions of this skill.
