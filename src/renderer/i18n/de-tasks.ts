/* German UI texts for the tasks screen (story 072). D1 only needs the header
   pair and the empty state — no action key: work never starts from an empty
   task queue, it always starts from a project, a day, or an area (see
   TasksScreen.tsx). D2+ add the group and row vocabulary here.

   Flat keys, sentence case, no emoji. `en-tasks.ts` carries the same key
   set — a test checks that. */

export const deTasks = {
  'screen.tasks.overline': 'Was ansteht',
  'screen.tasks.title': 'Aufgaben',
  'screen.tasks.empty.title': 'Noch keine Aufgabe in Sicht',
  'screen.tasks.empty.body':
    'Aufgaben entstehen in einem Projekt, einem Tageseintrag oder einem Bereich — nicht hier. Sobald welche offen sind, stehen sie an dieser Stelle.',

  // ── Die drei Gruppen (Story 072, D4) ─────────────────────────────────────
  'tasks.group.running': 'Läuft',
  'tasks.group.waiting': 'Wartet',
  'tasks.group.finished': 'Abgeschlossen',
  'tasks.group.agent': 'Beim Agenten',

  'tasks.kind.condense': 'Verdichten',
  'tasks.kind.close-day': 'Tag abschließen',
  'tasks.kind.gardener': 'Pflege',
  'tasks.kind.ingest': 'Quelle aufnehmen',
  'tasks.kind.interview-plan': 'Interviewplan',

  'tasks.outcome.done': 'Erledigt',
  'tasks.outcome.failed': 'Fehlgeschlagen',
  'tasks.outcome.cancelled': 'Abgebrochen',

  'tasks.waiting.position': 'Platz {position} in der Warteschlange',
  'tasks.row.progress': 'Fortschritt für {subject}',
  'tasks.row.model': 'Modell: {model}',

  'tasks.action.stop': 'Stoppen',
  'tasks.action.remove': 'Entfernen',
  'tasks.action.retry': 'Erneut versuchen',
  'tasks.action.viewResult': 'Ergebnis ansehen',

  // ── Die Aufträge des Agenten (Story 090) ─────────────────────────────────
  'tasks.agent.kind.condense-source': 'Quelle verdichten',
  'tasks.agent.state.skipped': 'Übersprungen',
  'tasks.agent.state.withdrawn': 'Zurückgezogen',
  'tasks.agent.reason': 'Grund: {reason}',
} as const;
