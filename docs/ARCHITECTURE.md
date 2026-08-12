# Architektur

Drei Schichten, eine Richtung: **Renderer → Preload → Main → Core → Dateien.**
Der Renderer kennt nur [src/shared/ipc.ts](../src/shared/ipc.ts). Der Core kennt nur
Dateien und Interfaces. Nur der Main kennt beide Welten.

```
┌────────────── Renderer (React) ──────────────┐
│ screens/  components/  atoms/  i18n/  lib/   │  keine fs-, keine net-Zugriffe
└───────────────────┬──────────────────────────┘
                    │ window.sb.invoke(kanal, payload)   ← nur IPC_CHANNELS
┌───────────────────▼──────────────────────────┐
│ preload  contextIsolation, sandbox, no node  │
└───────────────────┬──────────────────────────┘
┌───────────────────▼──────────────────────────┐
│ main   Fenster · Tray · Hotkey · Secrets ·   │
│        Settings · IPC-Handler · Notifications│
└───────────────────┬──────────────────────────┘
┌───────────────────▼──────────────────────────┐
│ core   vault index llm capture wiki ingest   │  reines TypeScript, testbar
│        journal overview gardener claude      │  importiert nie 'electron'
└───────────────────┬──────────────────────────┘
                    ▼  Markdown-Dateien im Vault
```

## Die vier Interfaces

In `src/core/*/types.ts` definiert, im Main verdrahtet, überall sonst nur als Typ bekannt.

| Interface        | Aufgabe                                           | Implementierungen                                                 |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `VaultStore`     | Dateien lesen/schreiben, Hash, Konflikte, Watcher | `FsVaultStore`, `MemoryVaultStore` (Tests)                        |
| `LlmGateway`     | `complete()` / `stream()` je Aufgabe              | `RoutingGateway` → Anthropic · OpenAI-kompatibel · `FakeProvider` |
| `SourceIngestor` | Quelle → Ordner unter `raw/`                      | `YoutubeIngestor`, `FileIngestor`, `UrlIngestor`, `TextIngestor`  |
| `SessionReader`  | Arbeitsspuren einer Agenten-CLI lesen             | `ClaudeSessionReader`                                             |

Eingehängt wird jedes davon an genau einer Stelle: Store, Index und Watcher in
[core-bridge.ts](../src/main/core-bridge.ts), das Gateway in
[llm-bridge.ts](../src/main/llm-bridge.ts) (`createGateway`, pro Aufruf frisch aus Routing,
Providern und Schlüsselspeicher — sonst gäbe es eine zweite Wahrheit, die veraltet).

## Verantwortungen im Core

| Modul       | Verantwortung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vault/`    | `paths` (Vault-relative Pfade, Slugs), `layout` (Struktur anlegen/prüfen), `frontmatter` (parsen/mergen/serialisieren, unbekannte Felder erhalten), `store` (atomar schreiben: tmp + rename, sha256, Konflikt), `watch` (chokidar, 250 ms trailing debounce)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `index/`    | `build` (Vault durchlaufen → Dokumente), `search` (MiniSearch, Snippets), `todos` (Checkboxen + Inline-Marker parsen), `projects` (Frontmatter + Ableitungen: lastTouch, stale, Zählungen), `persist` (`.secondbrain/index/index.json`, Hash-Invalidierung, inkrementell)                                                                                                                                                                                                                                                                                                                                                                                       |
| `llm/`      | `gateway` (Routing, Retry, Timeout, Abort), `providers/*` (nur HTTP, kein SDK), `registry` (Provider-CRUD, Modell-Liste, Probe), `tasks` (Katalog, Vorschläge, Tier), `prompts/*` (eine Datei pro Aufgabe, Dokumentsprache als Parameter)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `capture/`  | `dump` (Text → Inbox-Datei), `context` (Ablageziele, klein gehalten), `heuristic` (Einordnen ohne Modell — die Untergrenze, nicht der Notfall), `classify` (LLM → `FilingProposal`, hart gegen den Kontext geprüft), `actions` (Pfade und Markdown — die einzige Stelle), `apply`/`undo` (ausführen und zurücknehmen, Protokoll im Papierkorb), `tasks` (Todos aus Text)                                                                                                                                                                                                                                                                                        |
| `wiki/`     | `ingest` (Rohquelle → Source-Seite → Entity-/Concept-Seiten → index.md → log.md), `pages` (lesen/schreiben, Wikilink-Graph), `ask` (Retrieval → Antwort mit Zitaten → optional zurückschreiben)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ingest/`   | Provider-Kette pro Quellenart, schreibt nur nach `raw/`, `.ingest.json` als Protokoll                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `journal/`  | `day` (Tagesdatei anlegen/lesen/anhängen — `ensureDay` ist der **einzige** Weg, auf dem ein Tageseintrag entsteht; auch `todos:create` geht ihn), `sections` (nimmt die vorhandene Überschrift, legt keine zweite an), `dialog` (Runden als Blockquote parsen und anhängen), `coach` (drei Haltungen; die eigene Runde ist geschrieben, **bevor** ein Modell gefragt wird), `facts`/`close` (Tagesabschluss als Vorschlag — schreibt nichts), `streak` (Serien, Stimmungsverlauf), `labels` über `CloseLabels`                                                                                                                                                  |
| `overview/` | `reminders` (Fristen, Warte-auf, stagnierend — `waiting-overdue` nur, wenn es wirklich vorbei ist), `recent` (Dateien + Sessions + Journal + Ingest, je Projekt und Tag gruppiert), `dashboard` (alles für einen Rutsch), `status` (Status und nächster Schritt als **Vorschlag**; Heuristik zuerst, `heuristic: true` sagt der Oberfläche, dass kein Modell beteiligt war), `labels` (einsetzbare Beschriftungen — der Kern kennt die UI-Sprache nicht)                                                                                                                                                                                                        |
| `gardener/` | `checks/*` (neun deterministische Prüfungen, jede synchron und nur über den Index: verwaiste Seite, kaputter Wikilink, Katalog-Drift, angestaubte Seite, liegengebliebener Dump, unverdichtete Quelle, Projekt ohne nächsten Schritt, Beinahe-Dublette, Begriff ohne Seite), `audit` (optionale LLM-Deutung: Widersprüche — nur unter den von Befunden berührten Seiten, höchstens 24), `health` (0–100 **plus `healthKnown`**: ein leerer Vault hat keinen Wert, keine 100), `fixes`/`undo` (Vorschau ist wortwörtlich die geschriebene Zeile; `merge` und `open-*` schreiben nachweislich nichts und heißen deshalb „öffnen"), `labels` über `GardenerLabels` |
| `claude/`   | `~/.claude/projects/*/**.jsonl` lesen (nur Kopf und Ende, nie ganze Dateien, nur mit `'r'` geöffnet — die mtime ist die Sortiergrundlage), Session → `ClaudeSession`, Zuordnung über `repos` im Projekt-Frontmatter. Der Ordnername ist verlustbehaftet; Wahrheit ist `cwd` aus den Records                                                                                                                                                                                                                                                                                                                                                                     |

## Der Überblick, verdrahtet

Drei Kanalgruppen hängen am selben Bündel und werden deshalb an genau einer Stelle
verdrahtet ([ipc/overview-deps.ts](../src/main/ipc/overview-deps.ts)): `dashboard:*`,
`reminders:*` und `claude:*`. Vier Dinge, die dort und nirgends sonst entschieden werden:

- **`externalTouches` ist eine lebende `Map`.** `core-bridge` gibt sie beim
  `IndexService.open` mit; nach dem Sitzungslauf wird sie gefüllt und der Index zieht
  **ohne Ereignis** nach — ein `event:vault-changed` würde das Dashboard invalidieren,
  das gerade fragt. So kennen `lastTouch` und `stale` die Sitzungen.
- **Sitzungen werden Sekunden gepuffert.** Dashboard, Erinnerungen und die Sessions-Kachel
  fragen fast gleichzeitig; `~/.claude` dreimal zu lesen wäre Verschwendung. Nach
  `claude:link` ist der Puffer weg.
- **Ruhezeiten liegen in `.secondbrain/overview.json`**, nicht in den Einstellungen: eine
  wachsende Karte gehashter Erinnerungs-IDs ist Bedienzustand, keine Konfiguration. Die
  Datei darf gelöscht werden — dann mahnt alles wieder, und das ist der ehrliche Verlust.
- **Der Pflegewert wird nicht erfunden.** Ohne Pflegelauf geht `gardener: null` hinein und
  `healthKnown: false` heraus.

`projects:suggestStatus` rechnet in `core/overview/status` — dieselbe Fassung, die auch
Tageseinträge und Arbeitsspuren mitliest. Geschrieben wird der Vorschlag nie; das tut
`projects:patch` nach der Bestätigung.

## Tagebuch und Pflege, verdrahtet

Die zwei letzten Bereiche. Fünf Entscheidungen, die man im Code sonst nicht findet:

- **Es gibt genau eine Streaming-Mechanik.** `chat:ask` und `journal:coach` gehen beide
  über [ipc/llm-stream.ts](../src/main/ipc/llm-stream.ts): eine Marke, ein
  `event:llm-stream`, ein `abort`. Der Wrapper garantiert, dass **jede** Runde endet —
  auch die, die wirft. Zwei Fassungen liefen beim ersten Sonderfall auseinander, und der
  Renderer wartet dann für immer.
- **Der Gesprächsfaden des Tagebuchs ist die Datei**, nicht `.secondbrain/chats/`. Eine
  Kopie ausgerechnet des Sensibelsten wäre eine zweite Wahrheit; die Stream-Marke ist
  deshalb `journal-<datum>`, kein Gesprächs-Objekt.
- **Die eigene Runde steht in der Datei, bevor ein Modell gefragt wird.** Deshalb zieht
  auch der Fehlerweg den Index nach: der Satz des Menschen ist da, auch wenn die Antwort
  ausfiel — und ohne Modell wird keine Antwortrunde erfunden.
- **Der Tagesabschluss schreibt nichts.** `journal:close` liefert einen Vorschlag,
  `journal:applyClose` führt aus, was bestätigt wurde, und gibt den Rückweg als Liste von
  `vault:write`-Aufträgen zurück (jeder mit dem Hash des Stands, den er zurückdreht).
  `capture:apply` taugt hier nicht — es würde den „Dump", hier also den Tageseintrag,
  am Ende löschen.
- **Der Pflegebericht liegt roh in `.secondbrain/gardener.json`.** „Passt so" und erledigte
  Fixes filtern erst beim Lesen und rechnen die Gesundheit neu — deshalb ist beides
  zurücknehmbar, ohne neu zu prüfen. Ein neuer Lauf leert nur die Erledigt-Liste.

## Screens

Ein Ordner pro Screen unter `src/renderer/screens/`. Die Rail links führt in dieser
Reihenfolge; jeder Screen hat einen Tastaturweg.

| Screen      | Zweck                                                                    | Hotkey                          |
| ----------- | ------------------------------------------------------------------------ | ------------------------------- |
| `dashboard` | Verschiebbare Module: was war, was ansteht, worauf gewartet wird         | `1`                             |
| `capture`   | Reindumpen. Großes Textfeld, nichts sonst. Auch als eigenes Mini-Fenster | `2` / global `Ctrl+Shift+Space` |
| `inbox`     | Dumps mit Ablage-Vorschlag: annehmen, ändern, verwerfen                  | `3`                             |
| `ask`       | Fragen an das Second Brain, Antwort mit Belegen                          | `4`                             |
| `projects`  | Liste + Detail: Stand, nächster Schritt, Todos, Warte-auf                | `5`                             |
| `journal`   | Tageseintrag und Coaching-Dialog                                         | `6`                             |
| `modules`   | Wissens-Module: Seiten, Graph, Quellen                                   | `7`                             |
| `sources`   | Quellen aufnehmen (YouTube, Datei, URL) und Fortschritt sehen            | `8`                             |
| `garden`    | Pflege: Befunde, Gesundheit, Ein-Klick-Korrekturen                       | `9`                             |
| `settings`  | Sprachen, Provider/Modelle, Aufgaben-Routing, Vault, Verhalten           | `0`                             |

Dazu: `onboarding` (kein Vault offen), `quick-capture` (eigenes rahmenloses Fenster).

## Zustand im Renderer

- **TanStack Query** für alles, was über IPC kommt. Ein Hook pro Kanal in
  `src/renderer/lib/queries/`, Keys als Konstanten.
- **Invalidierung über Events**: `event:vault-changed` und `event:index-progress`
  invalidieren betroffene Query-Keys zentral in `src/renderer/lib/events.ts`.
  Kein Polling.
- **Kein globaler Store.** Was nicht Serverzustand ist (offene Panels, Entwürfe), lebt
  lokal oder in `localStorage`.
- **Streams**: `event:llm-stream` schreibt in einen lokalen Puffer pro `messageId`; erst
  am Ende wird die Query invalidiert. Es gibt **ein** Ereignis und einen Puffer für alle
  streamenden Aufgaben (`lib/llm-stream.ts`); wer eine neue baut, nimmt denselben Weg.

## Fehler und leere Zustände

Jeder Screen behandelt vier Zustände ausdrücklich — das ist Teil der Definition of Done:

1. **Kein Vault offen** → Onboarding-Karte mit einem Knopf.
2. **Leer** → erklärt, was hier erscheinen wird, plus die Aktion, die es füllt.
   Nie ein leerer Kasten, nie „keine Daten".
3. **Kein LLM konfiguriert** → sagt, welche Aufgabe ein Modell bräuchte, und verlinkt
   direkt in die Routing-Einstellung. Alles, was ohne Modell geht, bleibt benutzbar.
4. **Fehler** → `IpcError.code` bestimmt die Formulierung; technische Details hinter
   „Details anzeigen", nie als roher Stacktrace.

Einen fünften Zustand gab es: „dieser Bereich wird noch gebaut". **Er ist weg**, und er
darf nicht zurückkommen. Jeder Kanal aus `IPC_CHANNELS` ist echt implementiert; ein Test
(`tests/main/ipc-coverage.test.ts`) duldet keinen Handler, der nur eine Absage wirft, und
der Helfer, der solche Absagen gebaut hat, ist gelöscht. Dasselbe gilt für Einstellungen:
**ein Schalter, den niemand liest, wird entfernt, nicht stillgelegt** — im Verhalten-Tab
steht neben jedem der Ort, der ihn liest.

## Bedienbarkeit (verbindlich)

- **Tastatur zuerst.** `Ctrl+K` Befehlspalette, `Ctrl+Enter` abschicken, `Esc` schließt,
  Ziffern wechseln Screens. Jeder Fokus ist sichtbar (`:focus-visible`, Teal-Ring).
- **Ein Fokuspunkt pro Screen.** Genau eine primäre Aktion in Teal.
- **Latenz sichtbar machen:** alles über 200 ms bekommt einen Skeleton, alles über 2 s
  einen Fortschritt mit abbrechbarer Aktion.
- **Kein Dialog ohne Fluchtweg**, keine Aktion ohne Rückgängig (`undoToken`).
- **Zahlen und Zeitstempel in Mono**, Text in Sans.
- A11y: jede interaktive Fläche ≥ 32 px, Kontrast ≥ 4.5:1, `aria-label` an Icon-Buttons,
  `axe-core` läuft in den Renderer-Tests ohne Verstoß.

## Verifikation der Oberfläche

`npm run seed` legt `.demo-vault/` mit realistischen deutschen Beispielinhalten an (mehrere
Projekte in beiden Scopes, Todos mit und ohne Frist, Warte-auf, zwei Module mit
Wiki-Seiten, Tageseinträge, Inbox-Dumps, Pflege-Befunde) — **plus eine eigene Ablage
erfundener Claude-Code-Sitzungen** unter `.secondbrain/claude-demo/projects`, auf die
`overview.claudeProjectsDir` zeigt. Ohne sie läse der Demo-Lauf das echte `~/.claude`, und
fremde Sitzungstitel landeten in den Aufnahmen.

`npm run shot` startet die App darauf über Playwrights `_electron`, fährt jeden Screen an
und schreibt PNGs nach `.screenshots/`. Geprüft wird breit (1440×900) **und** eng
(1152×720), letzteres auch für Zustände hinter der Adresse (`NARROW_DEEP_STATES`), weil ein
Rail-Screen im Leerlauf nichts über eine Detailspalte verrät. Was höher ist als das
Fenster, wird zusätzlich bis zum Ende gerollt fotografiert — rollt nichts, entsteht kein
zweites Bild, statt denselben Ausschnitt zweimal „bis zum Ende" zu nennen.

Damit ist die Oberfläche prüfbar, ohne dass jemand die App von Hand startet — und ohne
echten Vault-Inhalt.
