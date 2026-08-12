# Dokumentation

Vier Dokumente, vier Fragen. Wer etwas baut, liest sie in dieser Reihenfolge.

| Dokument                             | Antwortet auf                                                      |
| ------------------------------------ | ------------------------------------------------------------------ |
| [CONCEPT.md](CONCEPT.md)             | Warum die App existiert und was sie tut — Produktsicht, Abgrenzung |
| [ARCHITECTURE.md](ARCHITECTURE.md)   | Wie sie gebaut ist — Schichten, Interfaces, Screens, Bedienbarkeit |
| [VAULT-FORMAT.md](VAULT-FORMAT.md)   | Was auf der Platte liegt — verbindliches Dateiformat               |
| [MODULE-SCHEMA.md](MODULE-SCHEMA.md) | Wie ein Wissens-Modul gepflegt wird — Karpathy-Wiki-Schema         |

Die Regeln für die Arbeit am Code stehen eine Ebene höher in [../CLAUDE.md](../CLAUDE.md):
Guardrails, Quality Gates, Design-System-Pflichten, QA-Regeln.

Der Vertrag zwischen Renderer und Main ist Code, nicht Prosa:
[../src/shared/ipc.ts](../src/shared/ipc.ts) und
[../src/shared/types/](../src/shared/types/).
