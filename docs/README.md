# Documentation

Four documents, four questions. Anyone building something reads them in this order.

| Document                             | Answers                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| [CONCEPT.md](CONCEPT.md)             | Why the app exists and what it does — product view, scope   |
| [ARCHITECTURE.md](ARCHITECTURE.md)   | How it's built — layers, interfaces, screens, usability     |
| [VAULT-FORMAT.md](VAULT-FORMAT.md)   | What's on disk — the binding file format                    |
| [MODULE-SCHEMA.md](MODULE-SCHEMA.md) | How a knowledge module is maintained — Karpathy wiki schema |

The rules for working on the code live one level up in
[../CLAUDE.md](../CLAUDE.md): guardrails, quality gates, design-system
requirements, QA rules.

The contract between renderer and main is code, not prose:
[../src/shared/ipc.ts](../src/shared/ipc.ts) and
[../src/shared/types/](../src/shared/types/).

## AI Scrum

Process and status tracking for ongoing development: [ROADMAP.md](ROADMAP.md)
(status, milestones, unprioritized items), [requirements/](requirements/)
(stories), [sprints/](sprints/) (sprint planning/review), [concepts/](concepts/)
(planned systems), [systems/](systems/) (reference for already-built systems).
Workflow in [requirements/README.md](requirements/README.md) and
[sprints/README.md](sprints/README.md).
