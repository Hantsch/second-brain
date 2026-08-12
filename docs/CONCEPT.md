# Konzept

## Warum

Zu viele Projekte, zu viel Springen zwischen ihnen. Nach dem Wechsel ist weg, wo man war
und was in welchem Status ist. Dazu Ideen, Quellen, Gelesenes, Sorgen — alles, was ein
Kopf nicht halten kann. Dieses Zeug soll aus dem Kopf raus, aber nicht verloren gehen:
**reindumpen, und die App sorgt für Struktur.**

Zweiter Antrieb: Ein Second Brain, das nur gefüllt wird, verrottet. Notizen veralten,
Seiten verwaisen, Quellen liegen unverdichtet herum, und irgendwann glaubt man dem eigenen
Archiv nicht mehr. Deshalb ist **Pflege** hier ein Screen und kein Zufall.

## Grundsätze

1. **Reindumpen kostet nichts.** Ein Hotkey, ein Textfeld, Enter. Kein Ordner wählen, kein
   Titel, keine Tags — das macht die App.
2. **Der Nutzer kümmert sich nicht um Struktur.** Ordner, Dateinamen, Frontmatter,
   Verlinkung: Aufgabe der App. Wer will, darf trotzdem alles selbst editieren.
3. **Die KI schlägt vor, der Mensch bestätigt.** Sichtbarer Vorschlag, sichtbare
   Begründung, ein Klick zum Ändern. Nichts wandert still irgendwohin.
4. **Belegt oder nicht gesagt.** Antworten kommen aus dem Vault, mit Zitat und Pfad.
5. **Autark.** Kein Server, kein Docker, keine Cloud-Pflicht. Ordner auf den Stick, fertig.
6. **Manchmal will man keine Lösung.** Der Coach hat einen Modus, der nur zuhört.

## Was die App tut

### Rein — Erfassen und Einordnen

- **Dump**: großes Feld, `Ctrl+Enter` speichert. Global per `Ctrl+Shift+Space`, auch wenn
  die App nicht im Vordergrund ist. Landet sofort als Datei in `inbox/` — nie erst nach
  erfolgreicher Klassifizierung.
- **Einordnen**: ein LLM liest den Dump und schlägt vor, wohin er gehört — in ein Projekt
  (Arbeit oder Privat), in den Tageseintrag, als Notiz in einen Bereich, als Quelle in ein
  Wissens-Modul, oder als neues Projekt. Dazu: Titel, Tags, erkannte Todos mit Fristen,
  erkannte „warte auf X".
- **Ohne LLM** greift eine Heuristik (Schlüsselwörter, Projektnamen, Datumsmuster) und der
  Dump bleibt sichtbar in der Inbox — nichts geht verloren.
- **Quellen aufnehmen**: YouTube-Videos (Pipeline aus `../yougrab`: Metadaten, Transcript
  als Prosa, Transcript mit Deep-Links), Dateien, URLs, Text aus der Zwischenablage.
  Rohquelle nach `raw/`, dann Verdichtung ins Wissens-Modul.

### Drin — Wissen, das zusammenwächst

- **Wissens-Module** sind eigenständige kleine Wikis nach Karpathys LLM-Wiki-Muster
  (übernommen aus `../godot-RAG`): Source-Seiten, Entity-Seiten, Concept-Seiten,
  `index.md`, `log.md`, `overview.md`. Wissen wird **einmal beim Ingest verdichtet**, nicht
  bei jeder Frage neu.
- **Widersprüche werden behalten und benannt**, nicht plattgebügelt.
- **Fragen** gehen gegen den ganzen Vault oder gegen ein Modul. Antwort mit Zitaten. War
  die Frage gut, wird die Antwort auf Knopfdruck als Wiki-Seite abgelegt — so füttert das
  Fragen das Second Brain, statt im Chat zu verschwinden.

### Überblick — was war, was ansteht

- **Dashboard** aus verschiebbaren Modulen, die der Nutzer nach Laune anordnet:
  - **Zuletzt gearbeitet** — aus Dateiänderungen _und_ Claude-Code-Sessions
    (`~/.claude/projects`, Leseweise aus `../claude-control`)
  - **Stagnierende Projekte** — lange nicht angefasst und nicht abgeschlossen
  - **Todos Arbeit** und **Todos Privat**, getrennt
  - **Warte auf** — wer, seit wann, bis wann die Antwort da sein sollte
  - **Anstehende Fristen** — Projekt-Deadlines und Todo-Fristen in einer Zeile
  - **Inbox**, **Journal-Serie**, **Pflege-Gesundheit**, **Schnell-Erfassen**, **Frage**
- **Projekte** tragen `next_step` — den einen Satz, der den Wiedereinstieg trägt. Fehlt er,
  ist das ein Pflege-Befund.
- **Erinnerungen** kommen als Windows-Benachrichtigung, wenn eine Frist fällt oder eine
  Antwort überfällig ist.

### Mensch — Tagebuch und Coach

- Tageseintrag pro Tag, mit optional Stimmung und Energie.
- Der Coach kennt drei Haltungen, umschaltbar pro Gespräch (Strg+1 bis Strg+3; die Vorgabe
  steht unter Einstellungen → Verhalten):
  - **Zuhören** — spiegeln, bestätigen, keine Ratschläge
  - **Tipps** — zuhören, dann konkrete Vorschläge
  - **Analysieren** — im Licht früherer Einträge Muster zeigen
- Tagesabschluss extrahiert Fakten, Todos und Fristen — als Vorschläge.
- **Das Gespräch steht im Tageseintrag**, als Blockquote mit Sprecher und Uhrzeit
  (docs/VAULT-FORMAT.md), nicht in einer Ablage daneben. Wer die Datei in Obsidian
  aufschlägt, liest denselben Faden.
- **Ohne Modell wird keine Antwort erfunden.** Die eigene Runde steht trotzdem in der
  Datei — sie wird geschrieben, bevor gefragt wird. In der Haltung „Analysieren" nennt die
  App dann die früheren Tage, die sie wirklich gefunden hat, wörtlich und mit Datum:
  Belege statt gespielter Empathie.

### Pflege — gegen das Verrotten

Deterministische Checks (verwaiste Seiten, kaputte Wikilinks, Index-Drift, angestaubte
Seiten, Quellen ohne Verdichtung, Dumps, die zu lange liegen, Projekte ohne nächsten
Schritt) plus optionale LLM-Deutung (Widersprüche, häufig genannte Begriffe ohne Seite,
Beinahe-Dubletten). Ergebnis: ein Gesundheitswert, eine Liste mit Ein-Klick-Korrekturen und
höchstens drei Sätze Rat, was als Nächstes zu tun ist.

Drei Zusagen, die den Unterschied machen:

- **Der Gesundheitswert wird nicht erfunden.** Ohne Lauf und ohne Bestand gibt es keinen
  Wert, keine 100. Der Screen sagt, _warum_ der Wert so ist.
- **Eine Korrektur zeigt vorher die Zeile, die sie schreibt** — wortwörtlich. Was nichts
  schreibt (zwei Seiten vergleichen, zum Einordnen springen), heißt „öffnen" und nicht
  „zusammenführen". Jeder Schreibvorgang hat ein Rückgängig; der Eintrag in der Chronik des
  Moduls bleibt, weil `log.md` append-only ist.
- **Widersprüche werden benannt, nicht geglättet.** Und sie brauchen ein Modell: ohne Route
  behauptet die App keinen. Der Screen sagt an der Stelle, was ein Modell zusätzlich fände.

## LLM: kategorisiert, wählbar, ehrlich

Jede LLM-Aufgabe der App ist eine Kategorie (`TaskKind`). Der Nutzer ordnet jeder Kategorie
Provider und Modell zu — im Admin-Screen, mit Vorschlag pro Kategorie:

| Aufgabe                  | Empfehlung  | Warum                                                  |
| ------------------------ | ----------- | ------------------------------------------------------ |
| Titel und Tags           | klein/lokal | Ein Satz Ausgabe. Ein großes Modell wäre Verschwendung |
| Dump einordnen           | klein/lokal | Persönlicher Inhalt, einfache Entscheidung             |
| Todos und Fristen ziehen | klein/lokal | Strukturierte Extraktion                               |
| Frage beantworten        | mittel      | Muss Belege korrekt zusammenführen                     |
| Quelle verdichten        | mittel      | Länger, aber geradeaus                                 |
| Wiki-Seiten schreiben    | groß        | Verknüpfen, Widersprüche erkennen, Bestand verändern   |
| Pflegelauf deuten        | groß        | Urteil über den ganzen Bestand                         |
| Tagebuch-Gespräch        | lokal       | Das Sensibelste, was es hier gibt                      |

Provider werden im Admin-Screen angelegt (Anthropic, OpenAI, OpenRouter, Ollama,
LM Studio, beliebige OpenAI-kompatible URL), mit Verbindungstest und Modell-Liste.
Schlüssel liegen verschlüsselt auf der Maschine, nie im Vault.

**Ohne konfiguriertes Modell bleibt die App vollständig benutzbar**: erfassen, ablegen,
suchen, Projekte, Todos, Fristen, Journal schreiben, Pflege-Checks. Was ein Modell
bräuchte, sagt das an der Stelle, an der es fehlt — mit direktem Weg in die Einstellung.

## Abgrenzung

Nicht in dieser Fassung: Mehrbenutzer, Sync-Dienst, Mobile, Embeddings/Vektorsuche,
Kalender- und Mail-Anbindung, Sprach-Eingabe, Web-Oberfläche. Der Vault ist ein Ordner —
Sync macht, wer will, mit Git, OneDrive oder einem Stick.

Und was beim Bauen ausdrücklich **nicht** entstanden ist, obwohl es geplant war:

- **Kein automatisches Ablegen.** Eine Schwelle, ab der ein Ablage-Vorschlag ohne Rückfrage
  ausgeführt wird, war einmal eine Einstellung. Sie widerspricht Grundsatz „die KI schlägt
  vor, der Mensch bestätigt", also konnte niemand sie lesen — und ein Schieber, den niemand
  liest, ist eine Behauptung. Er ist weg.
- **Kein Vorab-Abschalten des Tagesabschlusses.** Der Abschluss schlägt vor, was im Text
  steht; anhaken tut der Mensch. Schalter, die einzelne Vorschlagsarten vorab unterdrücken,
  verschweigen nur, was er ohnehin ablehnen kann.
- **Kein Widerspruch quer über den ganzen Bestand.** Die Deutung sieht die von Befunden
  berührten Seiten plus die mit benannter Beziehung, höchstens 24 — aus Kosten- und
  Privatsphäregründen. Ein Widerspruch zwischen zwei sonst unauffälligen Seiten bleibt
  unentdeckt; die Grenze steht im Kopf von `core/gardener/audit.ts`.
