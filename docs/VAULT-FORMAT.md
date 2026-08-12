# Vault-Format

Der Vault ist ein Ordner. Alles darin ist Markdown mit YAML-Frontmatter, in Obsidian
lesbar, mit Git versionierbar, auf einen USB-Stick kopierbar. Dieses Dokument ist der
Vertrag: Was hier nicht steht, wird nicht geschrieben.

## Ordner

```
<vault>/
  README.md                   erklärt den Ordner für alles, was kein Second Brain ist
  inbox/                      Dumps, noch nicht eingeordnet
    2026-08-10-1432-kurz-slug.md
  journal/
    2026/08/2026-08-10.md     ein Tag = eine Datei
  projects/
    work/<slug>/project.md    Projektdatei
    work/<slug>/notes/        optionale Langtexte zum Projekt
    private/<slug>/project.md
  areas/<slug>.md             laufende Verantwortungen ohne Ende
  modules/<slug>/             ein Wissens-Modul = ein Karpathy-Wiki
    module.md                 Beschreibung des Moduls
    wiki/index.md             Katalog aller Seiten
    wiki/log.md               append-only Chronik
    wiki/overview.md          Synthese über das Modul
    wiki/sources/s-<datum>-<slug>.md
    wiki/entities/<slug>.md
    wiki/concepts/<slug>.md
  raw/                        unveränderliche Quellen
    youtube/<video-id>/       Ordner aus der YouTube-Pipeline
    files/<datum>-<slug>/     hochgeladene Dateien
    web/<datum>-<slug>.md     abgerufene Seiten
    web/<datum>-<slug>.ingest.json   Protokoll als Geschwisterdatei, wenn es keinen Ordner gibt
  .secondbrain/               ableitbar, darf gelöscht werden
    vault.json                Marker: Version, Name, angelegt am
    settings.json             Vault-Einstellungen (reisen mit)
    overview.json             Ruhezeiten der Erinnerungen, schon gemeldete Fristen
    gardener.json             letzter Pflegebericht, „passt so" und erledigte Befunde
    index/index.json          Suchindex + Datei-Hashes
    chats/<id>.json           Gesprächsverläufe
    logs/                     App-Logs
    trash/                    Kopien für Rückgängig
```

Ein Ordner ist genau dann ein Vault, wenn `.secondbrain/vault.json` existiert. Der Marker
trägt `version`, `name` und `createdAt`; die App legt fehlende Ordner beim Öffnen nach, ohne
Bestand anzufassen. `README.md` schreibt sie nur, wenn keines da ist.

Zwei Dateien in `modules/` sind Struktur, nicht Wissen, und tragen deshalb **kein**
Frontmatter: `wiki/index.md` (Katalog) und `wiki/log.md` (Chronik). Links dorthin zählen
weder als eingehend noch als kaputt. `module.md` trägt `type: note` — `module` ist kein
Dokumenttyp — plus ein Feld `description`.

## Gemeinsame Regeln

- **Dateinamen** klein, mit Bindestrichen, ASCII. Umlaute werden transliteriert
  (`ä`→`ae`), Sonderzeichen entfallen.
- **Frontmatter** ist immer vorhanden und beginnt in Zeile 1 mit `---`.
- **Datumsfelder** sind `YYYY-MM-DD`, Zeitstempel ISO-8601 mit Zeitzone.
- **`updated`** wird nur von der App gesetzt, wenn sie selbst schreibt. Editiert der Nutzer
  extern, wird `updated` nicht rückwirkend verändert — die mtime der Datei zählt.
- **Wikilinks** `[[slug]]` verweisen innerhalb eines Moduls; über Modulgrenzen hinweg
  `[[modul/slug]]`. Großzügig verlinken.
- **Unbekannte Frontmatter-Felder bleiben erhalten.** Beim Schreiben wird gemergt, nie
  ersetzt: was der Nutzer selbst eingetragen hat, überlebt jeden App-Schreibvorgang.

## Dump (`inbox/`)

```markdown
---
type: dump
title: Gedanke zur Deployment-Pipeline
created: 2026-08-10T14:32:11+02:00
origin: quick-capture
status: raw
tags: []
scope: null
---

Der ganze rohe Text, unverändert wie eingegeben.
```

`status`: `raw` (unberührt) → `proposed` (Vorschlag liegt vor) → `filed` (abgelegt, Datei
wandert nach `.secondbrain/trash/` bzw. wird gelöscht) oder `kept` (bleibt bewusst liegen).

## Projekt (`projects/<scope>/<slug>/project.md`)

```markdown
---
type: project
title: Nyota Auth0 Migration
slug: nyota-auth0-migration
scope: work
status: active
priority: 2
started: 2026-06-12
deadline: 2026-09-01
next_step: Rückmeldung von Stefan zur Rollenzuordnung einarbeiten
tags: [auth0, infrastruktur]
modules: [identity-management]
repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure']
waiting_on:
  - who: Stefan
    what: Freigabe des Rollenkonzepts
    since: 2026-08-04
    due: 2026-08-12
---

## Stand

Wo das Projekt steht, in Prosa. Der erste Absatz ist das, was in Karten und Listen
auftaucht — also der Wiedereinstiegspunkt.

## Todos

- [ ] Rollen-Mapping dokumentieren @due:2026-08-15 !!
- [ ] Testmandant aufsetzen
- [x] Terraform-State migriert

## Notizen

Angehängte Dumps landen hier, jeder mit Datum als Unterüberschrift.

### 2026-08-10

Text des eingeordneten Dumps.
```

`status`: `idea` · `active` · `waiting` · `paused` · `done` · `dropped`.
`repos` verbindet das Projekt mit Claude-Code-Sessions: liegt eine Session in diesem
Verzeichnis, zählt sie als Arbeitsspur des Projekts.

## Todos

Ein Todo ist eine GFM-Checkbox in einer beliebigen Vault-Datei — kein eigenes Format,
damit Obsidian und jeder Editor damit arbeiten können. Optionale Inline-Marker:

| Marker               | Bedeutung                            |
| -------------------- | ------------------------------------ |
| `@due:2026-08-15`    | Fällig am                            |
| `@wait:Stefan`       | Warten auf eine Person               |
| `@needed:2026-08-20` | Antwort muss spätestens dann da sein |
| `!` `!!` `!!!`       | Priorität 1–3                        |
| `#tag`               | Tag                                  |
| `@done:2026-08-09`   | Wird beim Abhaken gesetzt            |

Der Scope kommt aus der Datei: Todos in `projects/work/...` sind Arbeit, in
`projects/private/...` privat. In `journal/` und `areas/` entscheidet `scope` im
Frontmatter, sonst ein `#work`/`#privat`-Tag, sonst gilt privat.

## Tageseintrag (`journal/YYYY/MM/YYYY-MM-DD.md`)

```markdown
---
type: journal
title: Montag, 10. August 2026
date: 2026-08-10
mood: 3
energy: 2
people: [Stefan, Anna]
projects: [nyota-auth0-migration]
tags: [stress]
---

## Tag

Was passiert ist, in Prosa.

## Gespräch

> **Ich** — 18:40
> Der Sprint fühlt sich unmöglich an.

> **Second Brain** — 18:40
> ...

## Fakten

- [ ] Stefan wegen Rollenkonzept nachfassen @due:2026-08-12
```

Der Abschnitt `Gespräch` ist der Coaching-Dialog, wortwörtlich protokolliert. `Fakten`
enthält, was der Tagesabschluss extrahiert hat — Vorschläge, die der Nutzer bestätigt hat.

## Wiki-Seiten (`modules/<slug>/wiki/`)

Schema nach Karpathys LLM-Wiki, übernommen aus `../godot-RAG/AGENTS.md`:

```markdown
---
type: concept # source | entity | concept | overview
title: Rollenbasierte Zugriffskontrolle
module: identity-management
created: 2026-07-02
updated: 2026-08-10
reviewed: 2026-08-10
tags: [auth, rbac]
sources: [s-2026-07-02-auth0-rbac-guide]
---

Aussage, die belegt ist (source: [[s-2026-07-02-auth0-rbac-guide]]).

## Widersprüche

- [[s-2026-08-01-neues-whitepaper]] widerspricht dem oben Gesagten zu X. Beide Fassungen
  bleiben stehen, die ältere ist als `superseded` markiert.
```

- Jede nicht-triviale Aussage trägt `(source: [[s-...]])`. Ohne Beleg keine Aussage.
- Source-Seiten heißen `s-YYYY-MM-DD-<slug>`.
- Widersprüche werden **behalten und benannt**, nicht plattgebügelt: `contradicts`,
  `supersedes`, `extends`.
- `wiki/index.md` listet jede Seite mit einem Einzeiler. `wiki/log.md` ist append-only:

```
## [2026-08-10] ingest | Auth0 RBAC Guide
- summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
- touched: [[auth0]], [[rollenbasierte-zugriffskontrolle]], index.md
- notes: widerspricht [[altes-rollenkonzept]] bei der Vererbung
```

## Rohquellen (`raw/`)

**Unveränderlich.** Eine einmal aufgenommene Quelle wird nie überschrieben — sie ist der
Fixpunkt, den Zitate belegen. Neue Fassung = neuer, datierter Ordner. Jede Quelle trägt
`.ingest.json`:

```json
{
  "kind": "youtube",
  "origin": "https://www.youtube.com/watch?v=xOFkpf9KgKg",
  "ingestedAt": "2026-08-10T14:40:00+02:00",
  "title": "Your AI Second Brain Is Slowly Rotting",
  "sourcePage": "s-2026-08-10-ai-second-brain-rotting",
  "modules": ["second-brain-methodik"],
  "provenance": { "transcript": "yt-dlp", "metadata": "yt-dlp" }
}
```

YouTube-Ordner folgen dem Aufbau aus `../yougrab`: `metadata.md`, `metadata.json`,
`transcript.md` (Prosa, für den Ingest), `transcript.timestamped.md` (zitierfähig, mit
Deep-Links).

## Was die App niemals tut

- Eine Datei unter `raw/` verändern oder löschen.
- Eine Nutzerzeile in einer Markdown-Datei umschreiben, die sie nicht selbst erzeugt hat.
- Frontmatter-Felder entfernen, die sie nicht kennt.
- Schreiben, ohne vorher den Hash zu prüfen.
- Einen API-Key in eine Vault-Datei schreiben.
