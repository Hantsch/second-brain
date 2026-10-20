---
type: concept
title: Token-Lebensdauer
module: identity-management
created: 2026-07-17
updated: 2026-08-04
reviewed: 2026-08-04
tags: [auth, token]
sources: [s-2026-08-04-token-lifetimes-blog]
contradicts: [altes-token-konzept]
lang: de
---

Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei jeder
Nutzung (source: [[s-2026-08-04-token-lifetimes-blog]]). Ausgestellt werden die Tokens
über [[oauth2]].

## Widersprüche

- Der Stand aus dem Erstprojekt nannte 12 Stunden. Beide Fassungen bleiben stehen; die
  ältere ist als `superseded` markiert.
