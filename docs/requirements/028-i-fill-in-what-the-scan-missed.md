---
id: 028
title: I fill in what the scan could not detect
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019a-machine-scan]] and [[019b-model-recommendations]]. Repairs the one
limitation both of them shipped with. Nothing here needs an LLM, a provider or a key.

## Requirement

The machine scan says my VRAM is unknown. It is not unknown to me — the card has 16 GB and I
can read that off the box, off the task manager, off the vendor page. But because the app
cannot detect it (Windows reports a 32-bit `AdapterRAM` that lies about anything over 4 GB,
see 019a's Done section), the verdict falls back to the RAM ceiling and the recommendation
offers me smaller models than this machine actually runs.

I want to type the number in myself. Once I have, the app treats it as a fact like any other:
the verdict uses it, the model recommendation uses it, and the number does not disappear on the
next scan or the next start. It must stay visible that _I_ entered it rather than the app
measuring it — the app should not start claiming a measurement it never made.

This is about the information being _present and usable_, not about the machine card looking
richer. A number I typed in that nothing downstream reads would be worse than no field at all.

## Acceptance Criteria

- [ ] On the machine card in Settings → Models, a fact the scan reported as unknown can be
      filled in by hand, through the UI, without editing any file.
- [ ] A value I entered survives a re-scan and an app restart.
- [ ] A value I entered is visibly marked as entered by me, not as measured. The heuristic
      disclaimer from 019a stays as it is.
- [ ] The capacity verdict uses my value exactly as if it had been detected — entering 16384 MB
      of VRAM changes the limiting factor and the parameter ceiling on the card.
- [ ] The model recommendation (019b) uses the same value: after entering it, a local model that
      was previously ruled out as too big becomes recommendable.
- [ ] I can clear the value again and the fact goes back to "unknown", with the verdict falling
      back to what it said before.
- [ ] Bad input is rejected in the UI before it reaches the verdict: empty, negative, zero,
      non-numeric and absurd values (a VRAM figure larger than any real card) never produce a
      `NaN`, a wrong verdict or a thrown error.
- [ ] What I entered lives on this machine, not in the vault: carrying the vault to another
      machine does not carry a VRAM number with it, and nothing is written into the vault when
      I save the value.
- [ ] No hardcoded string in the renderer; `de*.ts` and `en*.ts` both carry every new key.
- [ ] Unit-tested against fixture facts plus a manual value — the merge of detected and entered
      facts, the verdict over the merged result, and every rejected input. No test touches real
      hardware.

## Open Questions

- **Q1 — Which facts are overridable?** VRAM only (the one fact with a documented detection
  hole), or also total RAM, CPU cores, GPU name and free disk? Every extra field is another
  input the verdict has to defend itself against.
- **Q2 — Detection versus entry.** A later scan detects a real VRAM figure that contradicts what
  I entered. Does the detected value win, does mine win until I clear it, or is it a visible
  conflict I have to resolve? (019a's win32 case means "detected" is not automatically the more
  trustworthy of the two.)
- **Q3 — Is "this GPU is not usable for inference" part of this story?** An integrated GPU that
  a local runtime will never use is a different kind of correction than a missing number, and it
  would change the verdict in the opposite direction. In scope or its own story?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
