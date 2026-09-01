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

  // ── Der „nicht abgelegt“-Filter (Story 006) ──────────────────────────────
  /* Der Weg in den Filter, mit seiner Zahl. Steht auch bei 0 da: ein
     dauerhafter Einstieg, keine Meldung. Ein Key genügt — „1 nicht abgelegt“
     und „3 nicht abgelegt“ beugen gleich, wie bei `notes.area.openTodos`. */
  'notes.filter.unfiled': '{count} nicht abgelegt',
  'notes.unfiled.optional':
    'Ablegen ist freiwillig — ein Dump, der nie abgelegt wird, ist kein Rückstand, sondern eine Notiz.',
  /* Der Beleg (D5): ein abgelegter Dump bleibt liegen und wird hier sichtbar,
     eingeklappt, unterhalb der Arbeitsliste. */
  'notes.unfiled.filedTitle': 'Abgelegt',
  'notes.unfiled.filedCount': '{count} abgelegt',
  'notes.unfiled.filedInto': 'abgelegt in {target}',
  'notes.unfiled.show': 'Notizen zeigen',
  'notes.unfiled.hide': 'Notizen verbergen',

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
  'notes.area.show': 'Notizen zeigen',
  'notes.area.hide': 'Notizen verbergen',
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

  // ── Tabs innerhalb eines Bereichs (Story 038, D5) ────────────────────────
  'notes.area.tab.label': 'Bereichs-Tabs',
  'notes.tab.notes': 'Notizen',
  'notes.tab.todos': 'Aufgaben',
  'notes.tab.condensed': 'Verdichtet',

  // ── Der Verdichtet-Tab (Story 038, D6) ───────────────────────────────────
  'notes.condensed.empty.title': 'Noch nicht verdichtet',
  'notes.condensed.empty.body':
    'Eine Verdichtung fasst diesen Bereich zu einer Seite zusammen, die ein Modell von da an aktuell hält.',
  'notes.condensed.trigger': 'Diesen Bereich verdichten',
  'notes.condensed.triggerAgain': 'Erneut verdichten',
  'notes.condensed.running': 'Verdichtung läuft',
  'notes.condensed.meta.condensedAt': 'Verdichtet am {date}',
  'notes.condensed.meta.sources': '{count} Quellen',

  // ── Diff und Übernahme (Story 038, D7) ───────────────────────────────────
  'notes.condensed.diff.summary': '{removed} entfernt, {added} hinzugefügt',
  'notes.condensed.diff.added': 'hinzugefügt',
  'notes.condensed.diff.removed': 'entfernt',
  'notes.condensed.accept': 'Übernehmen',
  'notes.condensed.accept.conflict':
    'Die Datei für {subject} hat sich seit diesem Vorschlag geändert. Verdichtung erneut ausführen.',

  // ── Ablehnen mit Begründung (Story 038, D8) ──────────────────────────────
  'notes.condensed.reject': 'Ablehnen',
  'notes.condensed.reject.title': 'Diesen Vorschlag ablehnen',
  'notes.condensed.reject.description':
    'Eine Begründung ist erforderlich — sie bleibt beim Bereich, damit die nächste Verdichtung sie berücksichtigen kann.',
  'notes.condensed.reject.fieldLabel': 'Begründung',
  'notes.condensed.reject.placeholder': 'Was sollte sich ändern, bevor das übernommen wird?',
  'notes.condensed.reject.submit': 'Ablehnen',

  // ── Notiz verschieben ────────────────────────────────────────────────────
  'notes.moveNote.action': 'In einen anderen Bereich verschieben',
  'notes.moveNote.title': 'Notiz verschieben',
  'notes.moveNote.targetLabel': 'Zielbereich',
  'notes.moveNote.submit': 'Verschieben',
  'notes.moveNote.noOther':
    'Es gibt keinen anderen Bereich, in den sich diese Notiz verschieben ließe.',
} as const;
