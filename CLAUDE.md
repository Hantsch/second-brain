# Second Brain

Eine Electron-App, die das echte Hirn entlastet. Der Nutzer dumpt Gedanken hinein — Ideen,
Arbeitsstände, Sorgen, Quellen — und die App legt sie ab, ordnet sie ein und macht sie
wiederfindbar. Sie ist Wissensbasis, Tagebuch und Worklog in einem.

Drei Fragen muss sie jederzeit beantworten können:

- „Woran habe ich zuletzt gearbeitet und wo war ich stehengeblieben?"
- „Was muss ich noch tun, bis wann, und auf wen warte ich?"
- „Was weiß ich über X?" — belegt aus den eigenen Notizen, nicht geraten.

## Die Dateien sind die Wahrheit

Der Vault ist ein Ordner mit Markdown-Dateien plus YAML-Frontmatter (Format:
[docs/VAULT-FORMAT.md](docs/VAULT-FORMAT.md)). Daraus folgt:

- **Der Index ist abgeleitet.** `.secondbrain/index/` kann jederzeit gelöscht und aus den
  Dateien neu gebaut werden. Geht er verloren, ist nichts verloren.
- **Der Nutzer darf die Dateien direkt editieren** — in Obsidian, VS Code, Notepad. Externe
  Änderungen werden per Hash erkannt und neu eingelesen. Kein Schreibpfad überschreibt
  Nutzer-Edits stillschweigend; wer mit veraltetem Hash schreibt, bekommt `conflict`.
- **Alles bleibt portabel.** Der Vault liegt auf einem USB-Stick oder einer externen Platte
  und funktioniert dort vollständig. Keine Datenbank, kein Docker, kein Server.
- **Schlüssel reisen nicht mit.** API-Keys liegen verschlüsselt in `userData` (Electron
  `safeStorage`), niemals im Vault, niemals im Repo, niemals in Logs.

## Tech Stack

| Bereich  | Wahl                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| Shell    | Electron 41, electron-vite, TypeScript strict                                          |
| Renderer | React 19, react-router, TanStack Query, Tailwind 4 + Gaston Design System              |
| Kern     | Reines TypeScript in `src/core/` — kennt Electron nicht                                |
| Suche    | MiniSearch über einen aus den Dateien gebauten Index (kein natives Modul)              |
| LLM      | Eigenes Gateway: Anthropic + OpenAI-kompatibel (Ollama, LM Studio, OpenRouter, OpenAI) |
| Tests    | Vitest (Kern + Renderer), Playwright `_electron` für Screenshots                       |

Kein Postgres, keine Embeddings, kein natives Modul. Volltextsuche plus LLM-Rerank reicht;
Vektorsuche kommt erst, wenn eine konkrete Anforderung sie braucht.

## Nicht verhandelbare Guardrails

1. **Die App startet und ist nützlich ohne LLM.** Jede LLM-Aufgabe hat einen ehrlichen
   Zustand „kein Modell konfiguriert" und, wo möglich, einen heuristischen Fallback.
   Nie ein toter Screen, nie ein stiller Fehler.
2. **Die KI schlägt vor, der Mensch bestätigt.** Ablage-Vorschläge, extrahierte Todos,
   Statuswechsel und Wiki-Änderungen sind Vorschläge mit sichtbarer Begründung, bis der
   Nutzer sie annimmt. Nichts wird still verschoben oder umgeschrieben.
3. **Keine Halluzinationen.** Antworten auf Fragen kommen ausschließlich aus dem Vault, mit
   Zitat und Dateipfad. Gibt es keinen Beleg, sagt die App das — sie rät nicht.
4. **Interface first.** `LlmGateway`, `VaultStore`, `SourceIngestor` und `SessionReader` sind
   Interfaces. Konkrete Implementierungen sind austauschbar; kein Code außerhalb dieser
   Module weiß, welche läuft.
5. **`src/core/` importiert nie Electron** (per ESLint erzwungen). Der Renderer fasst nie
   das Dateisystem an — alles über die Kanäle in [src/shared/ipc.ts](src/shared/ipc.ts).
6. **Privatsphäre ist Substanz.** Tagebuch- und Projektinhalte gehören nie ins Repo, nie in
   Logs, nie in Fehlermeldungen und nie in einen Request, der nicht dafür bestimmt ist.
   Sensible Aufgaben (`journal-chat`, `classify-dump`) empfehlen lokale Modelle.
7. **Zwei Sprachen, getrennt einstellbar.** UI-Sprache und Dokumentsprache sind unabhängig
   (`languages.ui`, `languages.documents`). Kein deutscher String hartcodiert im Renderer —
   alles über `t()` aus `src/renderer/i18n/`.

## Verzeichnisse

```
src/
├─ core/        reines TypeScript, ohne Electron — hier liegt die Logik
│  ├─ vault/      Pfade, Layout, Frontmatter, atomares Schreiben, Watcher
│  ├─ index/      Index-Aufbau, Suche, Todo-/Projekt-Ableitung
│  ├─ llm/        Gateway, Provider, Aufgaben-Routing, Prompts
│  ├─ capture/    Dump → Vorschlag → Ablage
│  ├─ wiki/       Karpathy-Wiki: Ingest, Seitenpflege, Lint
│  ├─ ingest/     YouTube, Dateien, URLs → raw/
│  ├─ journal/    Tageseinträge, Coaching-Modi
│  ├─ overview/   Projekte, Todos, Erinnerungen, Recent Work
│  ├─ gardener/   Pflege gegen Knowledge-Rot
│  └─ claude/     Claude-Code-Sessions aus ~/.claude/projects
├─ main/        Electron: Fenster, Tray, Hotkey, IPC-Handler, Secrets, Settings
├─ preload/     die einzige Brücke; lässt nur Kanäle aus IPC_CHANNELS durch
├─ renderer/    React; reine Ansicht
│  ├─ atoms/      Gaston-Atome (gs-*-Wrapper) — nie ad-hoc-Markup
│  ├─ components/ zusammengesetzte Bausteine
│  ├─ screens/    ein Ordner pro Screen
│  ├─ i18n/       de.ts / en.ts, flache Keys
│  └─ lib/        api.ts (typisierter IPC-Client), Hooks, Formatierung
└─ shared/      Typen und IPC-Vertrag — von beiden Seiten benutzt
```

Ergänzend: `docs/` (Konzept, Architektur, Vault-Format), `scripts/` (Seed, Screenshots,
Launcher), `tests/` (Vitest, Fixtures).

## Design System: Gaston

Verbindlich für jede Frontend-Arbeit. Vendored unter
[src/renderer/styles/gaston/](src/renderer/styles/gaston/) (Tokens + `components.css`) und
[src/renderer/atoms/](src/renderer/atoms/) (die `gs-*`-Wrapper).

- Dark-first: Ink-Flächen (`#0A0F16` Seite), Fog-Text, **ein** Teal-Akzent (`#4FD1C5`), der
  dem Fokuspunkt gehört. Nicht zwei Akzente auf einem Screen.
- Typo: IBM Plex Sans für UI, IBM Plex Mono für Daten (Zahlen, IDs, Zeitstempel, Overlines).
- **Sentence case überall. Keine Emoji.**
- Farben, Abstände, Radien **nur** über Tokens — keine rohe Tailwind-Palette
  (`bg-slate-800` ist ein Fehler, `bg-[--gs-surface]` bzw. die `gs-*`-Klasse ist richtig).
- Ton: technisch, präzise, ruhig. Aussagen statt Enthusiasmus („Quelle aufgenommen. 243
  Abschnitte indiziert." statt „Super! 🎉").

Vor jedem neuen Screen oder Component `src/renderer/styles/gaston/README.md` lesen.

## Quality Gates

`npm run verify` muss grün sein, bevor eine Arbeit als fertig gilt:

```
npm run format:check   # prettier
npm run lint           # eslint
npm run typecheck      # tsc für Node-Seite und Renderer
npm test               # vitest
npm run build          # electron-vite build
```

Dazu für jede UI-Arbeit:

```
npm run seed           # baut .demo-vault/ mit realistischen Beispielinhalten
npm run shot           # startet die App über Playwright und legt PNGs in .screenshots/
```

Pflicht-Tests:

- **Datei-Roundtrip**: schreiben → extern editieren → neu einlesen, ohne Datenverlust.
- **Konflikt**: Schreiben mit veraltetem Hash schlägt fehl, statt zu überschreiben.
- **Ohne LLM**: jeder LLM-Pfad hat einen Test mit dem Fake-Provider _und_ einen mit
  „kein Modell konfiguriert".
- **Antworten ohne Beleg**: die Antwort sagt ehrlich, dass nichts gefunden wurde.
- Tests rufen **nie** echte LLM-APIs oder das Netz. Fakes liegen in `tests/fakes/`.

## QA-Regeln (nicht verhandelbar)

- Tests nie löschen, überspringen oder abschwächen, um grün zu werden. Schlägt ein Test
  fehl: Code reparieren, oder erklären, warum der Test falsch ist.
- Kein `// @ts-expect-error`, `eslint-disable` oder `any` ohne begründenden Kommentar in
  derselben Zeile.
- Kein `console.log` im Produktionscode (`no-console` ist an; `warn`/`error` erlaubt).

## Code-Qualität

- **Soft Limit ~300 Zeilen pro Datei.** Darüber prüfen, ob die Datei mehr als eine
  Verantwortung hat, und aufteilen.
- Eine Datei, eine Verantwortung. Keine God-Module.
- Wiederverwenden statt kopieren. Vor einem neuen Helper prüfen, ob es ihn schon gibt.
- Lesbarkeit schlägt Cleverness. Kommentare erklären **warum**, nicht was.
- Kommentare und Dokumentation auf Deutsch, Code-Identifier auf Englisch.

## Herkunft

Nachbar-Repos, aus denen bewusst geschöpft wird:

- `../ai-diary` — Gaston-Atome, LLM-Gateway-Aufbau, Dialog-Ideen, Frontmatter-Denkweise
- `../ai-assisted-knowledge-tool` — Chat-UI, Zitate, Ingest-Pipeline
- `../godot-RAG` — das Karpathy-Wiki-Schema (`AGENTS.md`) für die Wissens-Module
- `../yougrab` — YouTube-Pipeline (yt-dlp + Fallback-Provider, Transcript-Aufbereitung)
- `../claude-control` — Lesen der Claude-Code-Sessions aus `~/.claude/projects`
