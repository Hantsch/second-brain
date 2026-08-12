# Second Brain

Eine Electron-App, die das echte Hirn entlastet. Gedanken, Arbeitsstände, Sorgen und Quellen
werden hineingedumpt; die App legt sie ab, ordnet sie ein und macht sie wiederfindbar —
Wissensbasis, Tagebuch und Worklog in einem.

Drei Fragen muss sie jederzeit beantworten können:

- „Woran habe ich zuletzt gearbeitet und wo war ich stehengeblieben?"
- „Was muss ich noch tun, bis wann, und auf wen warte ich?"
- „Was weiß ich über X?" — belegt aus den eigenen Notizen, nicht geraten.

Lokal, portabel, ohne Server. Sprachmodelle sind optional: ohne Modell bleibt die App
benutzbar, jede LLM-Aufgabe hat einen ehrlichen Zustand „kein Modell konfiguriert".

## Der Vault

Ein **Vault** ist ein gewöhnlicher Ordner mit Markdown-Dateien plus YAML-Frontmatter — in
Obsidian oder VS Code editierbar, mit Git versionierbar, auf einen USB-Stick kopierbar.
Die Dateien sind die Wahrheit; alles andere ist daraus abgeleitet:

```
<vault>/
  inbox/          Dumps, noch nicht eingeordnet
  journal/        ein Tag = eine Datei
  projects/       work/<slug>/project.md · private/<slug>/project.md
  areas/          laufende Verantwortungen ohne Ende
  modules/        Wissens-Module, je ein kleines Wiki
  raw/            unveränderliche Quellen (YouTube, Dateien, Webseiten)
  .secondbrain/   Marker, Einstellungen, Suchindex — darf gelöscht werden
```

Ein Ordner ist genau dann ein Vault, wenn `.secondbrain/vault.json` existiert. Der Suchindex
unter `.secondbrain/index/` wird beim Öffnen geladen und inkrementell nachgezogen; geht er
verloren, wird er aus den Dateien neu gebaut. Externe Änderungen erkennt ein Watcher, und
kein Schreibvorgang überschreibt Nutzer-Edits stillschweigend — wer mit veraltetem Hash
schreibt, bekommt `conflict`. API-Keys liegen verschlüsselt in `userData`, nie im Vault.

Das verbindliche Dateiformat steht in [docs/VAULT-FORMAT.md](docs/VAULT-FORMAT.md).

## npm-Skripte

| Skript                 | Was es tut                                                           |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run dev`          | Electron mit Hot Reload starten                                      |
| `npm run build`        | Typprüfung und `electron-vite build` nach `out/`                     |
| `npm run package`      | Portable Windows-EXE nach `dist/second-brain-<version>-portable.exe` |
| `npm test`             | Vitest (Kern, Main, Renderer)                                        |
| `npm run typecheck`    | `tsc` für Node-Seite und Renderer                                    |
| `npm run lint`         | ESLint über das ganze Repo                                           |
| `npm run format:check` | Prettier prüfen (`npm run format` schreibt)                          |
| `npm run verify`       | format:check → lint → typecheck → test → build. Muss grün sein.      |
| `npm run seed`         | `.demo-vault/` mit realistischen Beispielinhalten anlegen            |
| `npm run shot`         | App über Playwright starten, PNGs nach `.screenshots/`               |
| `npm run a11y`         | axe-core über jeden Screen laufen lassen                             |
| `npm run verify:ui`    | seed → build → shot → a11y, für jede Oberflächenarbeit               |

`npm run shot` und `npm run a11y` starten den gebauten Stand auf dem Demo-Vault. Sie
brauchen vorher `npm run build`, und sie fassen die echte Installation nicht an: der Vault
kommt über `SB_VAULT`, die Einstellungen liegen in einem eigenen `--user-data-dir`.
`SB_DEMO=1` markiert den Lauf als Demo-Modus.

## Stand

**Alle zehn Screens der Rail sind gebaut, und jeder Kanal aus `IPC_CHANNELS` ist echt
implementiert.** Es gibt keinen Platzhalter-Bereich mehr, keine „noch nicht gebaut"-Karte
und keinen Schalter in den Einstellungen, den niemand liest — ein Test über `IPC_CHANNELS`
duldet keinen Handler, der nur eine Absage wirft.

- **Fertig und echt:** Vault (Pfade, Layout, Frontmatter, atomares Schreiben mit
  Konflikterkennung, Papierkorb mit Rückgängig, Watcher), Index (Aufbau, inkrementelles
  Nachziehen, MiniSearch mit Snippets, Todo- und Projekt-Ableitung), LLM-Gateway
  (Routing pro Aufgabe, Anthropic und OpenAI-kompatibel, Retry, Abort, Fake-Provider),
  Einordnen (Dump → Vorschlag → Ablage mit Rückgängig), Wissens-Module (Ingest, Seiten,
  Graph, Fragen mit geprüften Belegen), Quellen-Aufnahme (YouTube, Datei, URL, Text),
  Projekte und Todos (anlegen, ändern, abhaken, Warte-auf auflösen, Stand vorschlagen),
  Überblick (Dashboard mit verschiebbaren Modulen, Erinnerungen mit Ruhezeit,
  Claude-Code-Sessions als Arbeitsspur), **Tagebuch und Coaching** (Tageseintrag als
  Editor mit eingefrorenem Hash, drei Haltungen des Coachs, Gespräch als Blockquote im
  Tageseintrag, Stimmung, Tagesabschluss mit Bestätigung und Rückgängig), **Pflege gegen
  das Verrotten** (neun Prüfungen über den Index, Gesundheitswert mit ehrlichem
  „unbekannt", Fixes mit wortwörtlicher Vorschau und Rückweg, Widersprüche nur mit
  Modell), App-Hülle (rahmenloses Fenster, Rail mit zehn Screens, Befehlspalette,
  Schnell-Erfassen-Fenster, Onboarding, Einstellungen, Schlüsselspeicher).
- **Verdrahtete IPC-Bereiche:** `vault:*`, `index:*`, `search:*`, `capture:*`,
  `projects:*`, `todos:*`, `journal:*`, `modules:*`, `chat:*`, `ingest:*`, `llm:*`,
  `dashboard:*`, `reminders:*`, `gardener:*`, `claude:*`, `settings:*`, `window:*`,
  `shell:*`, `app:info`.
- **Was ein Modell braucht:** Widersprüche, Beinahe-Dubletten und Begriffe ohne Seite in
  der Pflege; Prosa-Antworten mit Zitat beim Fragen; die Coaching-Antwort. Alles andere
  läuft deterministisch, und wo ein Modell fehlt, sagt der Screen es an der Stelle, an der
  es fehlt — statt einen leeren Bereich zu zeigen.

### Claude-Code-Sessions

Liegt eine Claude-Code-Sitzung in einem Verzeichnis, das im `repos` eines Projekts steht,
zählt sie als Arbeitsspur: sie erscheint in „zuletzt gearbeitet", hält `lastTouch` frisch
und bewahrt das Projekt vor dem Stagnieren. Gelesen wird nur Kopf und Ende jeder
Verlaufsdatei, streng lesend, ohne die mtime anzufassen. Abschaltbar unter
Einstellungen → Verhalten; der Ort ist dort einstellbar (`overview.claudeProjectsDir`).
Der Demo-Vault bringt eine **eigene** Verlaufsablage mit — die Prüfläufe lesen nie das
echte `~/.claude`.

Konzept, Architektur und Format: [docs/](docs/README.md). Die Regeln für die Arbeit am Code
stehen in [CLAUDE.md](CLAUDE.md).
