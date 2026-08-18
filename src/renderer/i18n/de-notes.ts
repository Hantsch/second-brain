/* Deutsche Texte des Notizen-Screens: die Regel unter dem Titel, der Composer,
   der Leerzustand je Bereich, "Neuer Bereich" und "Notiz verschieben".

   Eigene Datei aus demselben Grund wie `de-projects.ts` — Kopfpaar und
   Leerzustand des ganzen Screens liegen trotzdem in `de-screens.ts`, wie bei
   jedem anderen Screen (siehe dort). Todos innerhalb eines Bereichs sind
   Projekt-Todos gleich und benutzen die vorhandenen `todos.*`/`todo.*` Keys
   aus `de-projects.ts` — hier steht nichts davon doppelt.

   Flache Keys, sentence case, keine Emoji. `en-notes.ts` trägt denselben
   Key-Satz. */

export const deNotes = {
  // ── Regel ────────────────────────────────────────────────────────────────
  'notes.rule':
    'Tagebuch ist Rückblick auf den Tag, eine Notiz ist ein Gedanke, der für sich steht.',

  // ── Composer ─────────────────────────────────────────────────────────────
  'notes.composer.placeholder': 'Ein Gedanke, der für sich steht.',
  'notes.composer.targetLabel': 'Bereich',
  'notes.composer.targetNone': 'Später entscheiden',
  'notes.composer.save': 'Speichern',
  'notes.composer.hint': 'Strg+Enter speichert die Notiz.',

  // ── Bereiche ─────────────────────────────────────────────────────────────
  'notes.list.aria': 'Bereiche',
  'notes.area.noteCount': '{count} Notizen',
  'notes.area.openTodos': '{count} offen',
  'notes.area.empty':
    'Noch keine Notiz in diesem Bereich. Die erste entsteht oben im Feld — wähle diesen Bereich als Ziel.',

  // ── Neuer Bereich ────────────────────────────────────────────────────────
  'notes.newArea.title': 'Neuer Bereich',
  'notes.newArea.description':
    'Ein Bereich ist eine Datei unter areas/. Ein Titel genügt — Notizen kommen dazu, sobald es sie gibt.',
  'notes.newArea.titleField': 'Titel',
  'notes.newArea.titlePlaceholder': 'Finanzen',
  'notes.newArea.slugPreview': 'Angelegt wird areas/{slug}.md.',
  'notes.newArea.submit': 'Anlegen',
  'notes.newArea.duplicate': 'Diesen Bereich gibt es schon — wähle einen anderen Titel.',

  // ── Notiz verschieben ────────────────────────────────────────────────────
  'notes.moveNote.action': 'In einen anderen Bereich verschieben',
  'notes.moveNote.title': 'Notiz verschieben',
  'notes.moveNote.targetLabel': 'Zielbereich',
  'notes.moveNote.submit': 'Verschieben',
  'notes.moveNote.noOther':
    'Es gibt keinen anderen Bereich, in den sich diese Notiz verschieben ließe.',
} as const;
