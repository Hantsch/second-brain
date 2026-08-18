---
type: project
title: Kundenportal Relaunch
slug: kundenportal-relaunch
scope: work
status: active
priority: 1
started: 2026-06-19
deadline: 2026-08-13
next_step: Abnahmeprotokoll mit Miriam durchgehen
tags: [kundenportal, frontend]
modules: []
repos: ['C:/development/demo/kundenportal-web']
waiting_on:
  - who: Jonas
    what: Fallback für abgelaufene Sitzungen
    since: 2026-08-06
    due: 2026-08-12
created: 2026-06-19
updated: 2026-08-10
lang: de
---

## Stand

Die neue Angebotsliste liegt auf dem Testsystem. Zwei Punkte blieben offen: die Liste
braucht bei 400 Angeboten über drei Sekunden, und abgelaufene Sitzungen landen auf einer
weißen Seite statt auf dem Login.

## Todos

- [ ] Ladezeiten der Angebotsliste unter 1,5 s bringen @due:2026-08-08 !!
- [ ] Abnahmeprotokoll mit Miriam durchgehen @due:2026-08-10 !!!
- [ ] Fallback für abgelaufene Sitzungen bauen @wait:Jonas @needed:2026-08-12
- [x] Bilder auf WebP umgestellt @done:2026-08-06

## Notizen

### 2026-08-09

Testlauf mit Miriam: die Suche über Kundennummern war der Knackpunkt, alles andere lief
durch.
