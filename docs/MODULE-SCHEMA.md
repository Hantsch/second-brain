<!-- This file mirrors MODULE_SCHEMA_TEMPLATE in src/core/wiki/agents-md.ts.
     The code is authoritative; this doc is a generated-by-hand mirror kept in sync
     by tests/core/wiki/module.test.ts. Edit the constant first, then copy here. -->

# Wissens-Modul: Schema

Ein Wissens-Modul ist ein eigenständiges kleines Wiki unter `modules/<slug>/`, gepflegt nach
Andrej Karpathys LLM-Wiki-Muster. Übernommen und angepasst aus `../godot-RAG/AGENTS.md`.

Dieses Dokument wird beim Anlegen eines Moduls als `modules/<slug>/AGENTS.md` **in den Vault
kopiert** (mit eingesetztem Modulnamen). Damit kann jedes LLM — Claude Code, Copilot, ein
lokales Modell, die App selbst — das Modul pflegen, ohne diese App zu brauchen. Der Vault
bleibt selbsterklärend.

## Die drei Schichten

1. **`raw/` (im Vault-Wurzelordner) — Rohquellen, unveränderlich.**
   Was hier liegt, wird gelesen, nie geändert. Es ist der Fixpunkt, den jedes Zitat belegt.
   Ändert sich der Inhalt einer Quelle, kommt ein **neuer, datierter Ordner** dazu; der alte
   bleibt (er war damals wahr).
2. **`modules/<slug>/wiki/` — das Wiki, LLM-geführt.**
   Verdichtete Seiten: Quellen-Zusammenfassungen, Entitäten, Konzepte, Synthese, `index.md`,
   `log.md`. Diese Schicht darf die App umschreiben — mit sichtbarem Vorschlag.
3. **`modules/<slug>/AGENTS.md` — dieses Schema.**
   Konventionen und Abläufe. Mensch und LLM entwickeln es gemeinsam weiter.

## Aufbau

```
modules/<slug>/
  AGENTS.md          dieses Schema, mit eingesetztem Modulnamen
  module.md          Titel, Zweck, Abgrenzung, verknüpfte Projekte
  wiki/
    index.md         Katalog jeder Seite mit Einzeiler
    log.md           append-only Chronik (ingest | query | lint)
    overview.md      verdichtete Synthese — ändert sich nur durch eine bestätigte Verdichtung
    sources/         s-YYYY-MM-DD-<slug>.md — eine Seite je aufgenommener Quelle
    entities/        Personen, Firmen, Produkte, Systeme, Werkzeuge, Projekte
    concepts/        Muster, Verfahren, Begriffe, Techniken
```

## Seiten-Konventionen

- **Dateinamen** klein, mit Bindestrichen, sprechend: `auth0.md`,
  `rollenbasierte-zugriffskontrolle.md`.
- **Wikilinks** `[[seiten-slug]]`, über Modulgrenzen `[[modul/seiten-slug]]`. Großzügig
  verlinken — die Verbindungen sind so wertvoll wie die Seiten.
- **Frontmatter** nach [VAULT-FORMAT.md](VAULT-FORMAT.md), immer mit `type`, `title`,
  `module`, `created`, `updated`, `tags`, `sources`.
- **Zitate:** jede nicht-triviale Aussage nennt ihre Quelle:
  `(source: [[s-2026-08-10-auth0-rbac-guide]])`. Vertrauen wird aus Zitaten rekonstruiert,
  nicht behauptet.
- **Version und Kontext festhalten**, wo sie die Aussage tragen (Produktversion, Datum,
  Umgebung). Eine versionsspezifische Technik nicht zu allgemeingültigem Rat verallgemeinern.
- **Belegtes von Empfehlung trennen.** Gemessenes, Zitiertes und Erfahrenes sind
  unterschiedliche Dinge; die Bedingungen der Quelle bleiben stehen.
- **Sprache:** die Dokumentsprache aus den Einstellungen (`languages.documents`). Quellen
  dürfen in jeder Sprache sein; beim Verdichten wird der Inhalt in die Dokumentsprache
  übertragen. Ein Originalzitat bleibt im Original, wenn der Wortlaut zählt (Eigenname,
  definierter Begriff, Vertragsklausel) — mit Übersetzung daneben.
- **Source-Seiten** heißen `s-YYYY-MM-DD-<slug>` und verlinken auf den Ordner unter `raw/`.

## Abläufe

### Ingest (eine Quelle kommt herein)

1. Rohquelle liegt in `raw/` und ist unverändert.
2. Source-Seite in `wiki/sources/` anlegen: worum es geht, die tragenden Aussagen, was neu
   ist gegenüber dem Bestand, wo es dem Bestand widerspricht.
3. Entitäten und Konzepte anlegen oder ergänzen. Eine Quelle berührt typisch 5–15 Seiten.
   Für jede: Neues einarbeiten, Querverweise setzen, Widersprüche und Überholtes benennen.
4. `wiki/index.md` aktualisieren (berührte Einträge neu schreiben).
5. Einen Eintrag an `wiki/log.md` anhängen.
6. `wiki/overview.md` bleibt unangetastet: Der Ingest ändert sie nie. Sie ändert sich nur,
   wenn der Nutzer im Modul eine Verdichtung bestätigt.

**Vor jeder neuen Seite im Wiki suchen.** Eine bestehende Seite ergänzen ist fast immer
besser als eine Beinahe-Dublette anzulegen.

### Query (eine Frage kommt)

1. `wiki/index.md` zuerst lesen, dann in die passenden Seiten.
2. Antwort mit Zitaten auf Wiki-Seiten und Rohquellen.
3. War die Antwort wertvoll, wird sie als Seite abgelegt — sonst verschwindet die Erkundung
   im Chatverlauf. Die App bietet das mit einem Klick an.

### Pflege (regelmäßig, siehe Screen „Pflege")

Erst die maschinellen Checks, dann das Urteil: verwaiste Seiten, kaputte Wikilinks,
Index-Drift, überholte Aussagen, häufig genannte Begriffe ohne eigene Seite, fehlende
Querverweise, unverdichtete Quellen. Befunde werden **gemeldet, nicht still korrigiert**.

## Widersprüche

Ein Widerspruch ist kein Defekt, der weggebügelt wird. Wenn zwei Quellen uneins sind:

- Beide Aussagen bleiben, jede mit ihrem Zitat.
- Eine kurze Notiz beschreibt die Art des Konflikts: `contradicts`, `supersedes`, `extends`.
- Bei sachlichen Aussagen, die eine neuere Quelle überholt: die alte als `superseded`
  markieren und datieren — nicht löschen.

## Log-Format

`wiki/log.md` ist append-only. Jeder Eintrag beginnt mit demselben Präfix, damit er
greppbar bleibt (`grep "^## \[" wiki/log.md | tail -5`):

```
## [2026-08-10] ingest | Auth0 RBAC Guide
- summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
- touched: [[auth0]], [[rollenbasierte-zugriffskontrolle]], index.md
- notes: widerspricht [[altes-rollenkonzept]] bei der Vererbung von Rollen

## [2026-08-10] query | Wie erben Rollen in Auth0?
- answered from: [[auth0]], [[rollenbasierte-zugriffskontrolle]]
- filed back: wiki/concepts/rollenvererbung.md

## [2026-08-11] lint
- findings: 2 verwaiste Seiten, 1 kaputter Link, index.md fehlt 1 Eintrag
```

## Grundsätze

- Der Mensch kuratiert und fragt; das LLM macht die Buchhaltung.
- Wissen wird **einmal beim Ingest verdichtet** und dann aktuell gehalten — nicht bei jeder
  Frage neu abgeleitet.
- Alles zitieren, Herkunft erhalten.
- Großzügig verlinken, aber bestehende Seiten ergänzen statt Dubletten anzulegen.
- Ein Wiki, das nur wächst und nie gepflegt wird, verrottet. Pflege ist Teil der Arbeit.
