/* Projekte und Bereiche in Dateien schreiben. Aufbau der Projektdatei nach
   docs/VAULT-FORMAT.md: Frontmatter, `## Stand`, `## Todos`, `## Notizen` mit
   Datum als Unterüberschrift. */

import { privateProjects } from './projects-private.mjs';
import { workProjects } from './projects-work.mjs';

function projectBody(project, clock) {
  const parts = [`## Stand`, '', project.stand.trim(), ''];
  parts.push('## Todos', '');
  parts.push(...project.todos);
  parts.push('');
  parts.push('## Notizen', '');
  if (project.notes.length === 0) {
    parts.push('Noch keine eingeordneten Dumps.');
  } else {
    for (const note of project.notes) {
      parts.push(`### ${clock.day(note.day)}`, '', note.text.trim(), '');
    }
  }
  return parts.join('\n');
}

/** Zählt die Checkboxen eines fertigen Rumpfs — gezählt wird, was auch dasteht. */
export function countTodos(seeder, body) {
  for (const line of body.split('\n')) {
    if (!/^\s*- \[[ x]\]/.test(line)) continue;
    seeder.bump('todos');
    seeder.bump(line.includes('- [x]') ? 'todosDone' : 'todosOpen');
    if (line.includes('@wait:')) seeder.bump('todosWaiting');
    if (line.includes('@due:')) seeder.bump('todosDue');
  }
}

/** Schreibt ein Projekt samt optionaler Langtexte unter `notes/`. */
function writeProject(seeder, clock, project) {
  const dir = `projects/${project.scope}/${project.slug}`;
  const body = projectBody(project, clock);
  seeder.doc(
    `${dir}/project.md`,
    {
      type: 'project',
      title: project.title,
      slug: project.slug,
      scope: project.scope,
      status: project.status,
      priority: project.priority,
      favorite: project.favorite,
      started: project.started,
      deadline: project.deadline,
      next_step: project.next_step,
      tags: project.tags,
      modules: project.modules,
      repos: project.repos,
      waiting_on: project.waiting_on,
      created: project.created,
      updated: project.updated,
      lang: 'de',
    },
    body,
    clock.date(project.touch[0], project.touch[1]),
  );
  seeder.bump('projects');
  seeder.bump(`projects.${project.scope}`);
  if (project.waiting_on) seeder.bump('waitingOn', project.waiting_on.length);
  countTodos(seeder, body);

  for (const note of project.extraNotes ?? []) {
    seeder.doc(
      `${dir}/${note.path}`,
      {
        type: 'note',
        title: note.title,
        created: clock.day(note.created),
        updated: clock.day(note.updated),
        scope: project.scope,
        project: project.slug,
        tags: [],
        lang: 'de',
      },
      note.body,
      clock.date(note.touch[0], note.touch[1]),
    );
    seeder.bump('notes');
  }
}

/** Zwei laufende Verantwortungen ohne Ende — der Scope steht im Frontmatter. */
function seedAreas(seeder, clock) {
  const day = clock.day;
  const gesundheit = `## Worum es geht

Rücken, Schlaf, Bewegung. Kein Programm, nur zwei Dinge, die nicht ausfallen dürfen:
dreimal pro Woche zwanzig Minuten Rückentraining und vor Mitternacht ins Bett.

## Todos

- [ ] Termin beim Physiotherapeuten machen @due:${day(4)}
- [x] Schlafzeiten zwei Wochen mitgeschrieben @done:${day(-6)}

## Notizen

### ${day(-6)}

Zwei Wochen Protokoll: im Schnitt 6 h 40 min. An den drei Tagen mit Training war es
eine halbe Stunde mehr.`;
  seeder.doc(
    'areas/gesundheit.md',
    {
      type: 'area',
      title: 'Gesundheit',
      scope: 'private',
      created: day(-180),
      updated: day(-6),
      tags: ['routine'],
      lang: 'de',
    },
    gesundheit,
    clock.date(-6, '21:15'),
  );
  seeder.bump('areas');
  countTodos(seeder, gesundheit);

  /* Ein bestehendes verdichtetes Artefakt (Story 038, D9): die Area wurde schon
     einmal kondensiert, und der Nutzer hat danach eine eigene Direktive
     hinterlassen — genau der Zustand, den `AreaCondensedTab.tsx` ohne Modell
     lesbar zeigen muss (Guardrail 1) und in dem eine Direktive schon steht,
     bevor je wieder kondensiert wird. Pfadform nach
     `src/core/condense/paths.ts` (`condensedAreaPath`): `areas/<slug>.condensed.md`,
     hier als Literal, da die Seed-Skripte bewusst nicht aus `@core/*` importieren. */
  seeder.doc(
    'areas/gesundheit.condensed.md',
    {
      type: 'condensed',
      title: 'Gesundheit',
      condensed_at: clock.at(-2, '08:00'),
      sources: ['areas/gesundheit.md'],
      lang: 'de',
    },
    `## Stand

Der Rücken hält sich, solange die kurzen Pausen alle 45 Minuten eingehalten werden;
das Rückentraining läuft an drei Tagen die Woche. Beim Schlaf steht ein Zweiwochen-
Protokoll mit im Schnitt 6 h 40 min.
Aus: areas/gesundheit.md

## Muster

An den drei Trainingstagen fällt der Schlaf im Schnitt eine halbe Stunde länger aus
als an den übrigen — Bewegung und Schlafdauer hängen sichtbar zusammen.
Aus: areas/gesundheit.md

## Offen

Der Termin beim Physiotherapeuten steht noch aus. Ob sich das Muster aus Training
und Schlaf über einen längeren Zeitraum hält, ist mit zwei Wochen Protokoll noch
nicht gesichert.
Aus: areas/gesundheit.md

## Direktiven

Keine offenen Finanz-Themen hier aufnehmen.`,
    clock.date(-2, '08:00'),
  );

  const team = `## Worum es geht

Die laufende Arbeit an Beziehungen, die kein Projekt sind: Wochenrückblick an Miriam,
monatliches Gespräch mit Jonas, und einmal im Quartal ein ehrlicher Blick darauf, welche
Kunden Energie kosten statt bringen.

## Todos

- [ ] Wochenrückblick schreiben und an Miriam schicken @due:${day(2)} #work
- [ ] Quartalsrunde vorbereiten @due:${day(21)}

## Notizen

### ${day(-4)}

Jonas möchte mehr Verantwortung im Frontend. Nächster Schritt: er übernimmt den
Sitzungs-Fallback im Kundenportal allein, ich schaue nur das Ergebnis an.`;
  seeder.doc(
    'areas/kunden-und-team.md',
    {
      type: 'area',
      title: 'Kunden und Team',
      scope: 'work',
      created: day(-200),
      updated: day(-4),
      tags: ['kommunikation'],
      lang: 'de',
    },
    team,
    clock.date(-4, '09:05'),
  );
  seeder.bump('areas');
  countTodos(seeder, team);

  /* Eine dritte, gerade erst angelegte Fläche ohne eine einzige Notiz — sonst
     zeigt keine Aufnahme, wie der Leerlauf einer aufgeklappten Sektion
     aussieht (`notes.area.empty`). Bewusst ohne "Worum es geht": eine Fläche,
     die noch nichts als ihre Todos trägt. */
  const finanzen = `## Todos

- [ ] Kontoauszüge der letzten drei Monate sortieren @due:${day(10)}

## Notizen
`;
  seeder.doc(
    'areas/finanzen.md',
    {
      type: 'area',
      title: 'Finanzen',
      scope: 'private',
      created: day(-3),
      updated: day(-3),
      tags: [],
      lang: 'de',
    },
    finanzen,
    clock.date(-3, '19:40'),
  );
  seeder.bump('areas');
  countTodos(seeder, finanzen);
}

export function seedProjects(seeder, clock) {
  for (const project of [...workProjects(clock), ...privateProjects(clock)]) {
    writeProject(seeder, clock, project);
  }
  seedAreas(seeder, clock);
}
