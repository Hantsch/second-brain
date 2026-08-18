---
type: overview
title: Identitätsmanagement — Synthese
module: identity-management
created: 2026-04-14
updated: 2026-08-04
reviewed: 2026-08-04
tags: [auth]
sources: [s-2026-08-04-token-lifetimes-blog]
lang: de
---

## Was entschieden ist

- Tokens leben kurz: 15 Minuten Access, 8 Stunden Refresh, siehe
  [[token-lebensdauer]] (source: [[s-2026-08-04-token-lifetimes-blog]]).
- Technisch setzt alles auf [[oauth2]] auf.

## Was offen ist

- Erben Unterorganisationen die Rollen der Elternorganisation? Die Frage liegt beim
  Kunden.
