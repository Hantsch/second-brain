/* Rohquellen unter `raw/`. Unveränderlich, Fixpunkt aller Zitate.

   Drei Quellen, drei Zustände:
   - `raw/youtube/xOFkpf9KgKg/` — verdichtet, `sourcePage` zeigt auf die
     Wiki-Seite (siehe raw-youtube.mjs).
   - `raw/files/<datum>-rollenkonzept-workshop/` — hochgeladene Mitschrift,
     ebenfalls verdichtet.
   - `raw/web/<datum>-digital-gardening-ueberblick.md` — absichtlich ohne
     `sourcePage`: unverdichtete Quelle, damit der Pflege-Screen sie meldet.

   Inhalte sind erfunden. */

import { seedYoutube } from './raw-youtube.mjs';

function seedFileSource(seeder, clock) {
  const dir = `raw/files/${clock.day(-24)}-rollenkonzept-workshop`;
  const when = clock.date(-24, '15:12');
  seeder.doc(
    `${dir}/notizen.md`,
    {
      doc_type: 'upload',
      title: 'Rollenkonzept-Workshop — Mitschrift',
      origin: 'C:/Users/demo/Downloads/rollenkonzept-workshop.md',
      captured_at: clock.at(-24, '15:12'),
      language: 'de',
    },
    `# Rollenkonzept-Workshop

Teilnehmende: Tobias (Kunden-Architekt), zwei Kolleginnen aus der Fachabteilung, ich.
Dauer: zwei Stunden.

## Ergebnisse

1. Drei Rollen: Lesen, Bearbeiten, Verwalten. Keine weiteren.
2. Feinere Abstufungen laufen über Gruppen.
3. Neue Mitarbeitende werden beim ersten Anmelden automatisch angelegt.

## Zitate aus dem Raum

> Wenn wir für jede Abteilung eine Rolle bauen, pflegt das in einem Jahr niemand mehr.
> — Tobias

## Offen geblieben

- Erben Unterorganisationen die Rollen der Elternorganisation?
- Wer räumt Konten von Ausgetretenen auf?`,
    when,
  );

  seeder.json(
    `${dir}/.ingest.json`,
    {
      kind: 'file',
      origin: 'C:/Users/demo/Downloads/rollenkonzept-workshop.md',
      ingestedAt: clock.at(-24, '15:12'),
      title: 'Rollenkonzept-Workshop — Mitschrift',
      sourcePage: `s-${clock.day(-24)}-rollenkonzept-workshop`,
      modules: ['identity-management'],
      provenance: { content: 'upload' },
    },
    when,
  );
  seeder.bump('raw');
  seeder.bump('rawProcessed');
}

/** Die unverdichtete Quelle: liegt da, hat keine Wiki-Seite. Absicht. */
function seedWebSource(seeder, clock) {
  const base = `raw/web/${clock.day(-4)}-digital-gardening-ueberblick`;
  const when = clock.date(-4, '22:08');
  seeder.doc(
    `${base}.md`,
    {
      doc_type: 'web',
      title: 'Digital Gardening: ein Überblick',
      origin: 'https://example.org/digital-gardening-ueberblick',
      fetched_at: clock.at(-4, '22:08'),
      language: 'de',
    },
    `# Digital Gardening: ein Überblick

Abgerufener Artikel, noch nicht verdichtet.

Der Text stellt „digitale Gärten" gegen Blogs: kein Datum, keine Chronologie, sondern
Seiten, die wachsen und sich gegenseitig verlinken. Drei Pflegestufen werden
unterschieden — Setzling, Wachsend, Ausgewachsen —, jede mit einem eigenen Anspruch an
Belege.

Interessant für dieses Projekt ist die dritte Stufe: erst dort verlangt der Autor
Quellenangaben. Das wäre eine schwächere Regel als die Belegpflicht, die hier gilt —
und genau deshalb wäre ein Vergleich lohnend.

> Ein Garten ist kein Archiv. Was nicht gepflegt wird, verschwindet unter dem, was
> nachwächst.`,
    when,
  );

  /* Ordnerlose Quelle: das Protokoll liegt als Geschwisterdatei daneben. */
  seeder.json(
    `${base}.ingest.json`,
    {
      kind: 'url',
      origin: 'https://example.org/digital-gardening-ueberblick',
      ingestedAt: clock.at(-4, '22:08'),
      title: 'Digital Gardening: ein Überblick',
      sourcePage: null,
      modules: [],
      provenance: { content: 'fetch', metadata: 'fetch' },
    },
    when,
  );
  seeder.bump('raw');
  seeder.bump('rawUnprocessed');
}

export function seedRaw(seeder, clock) {
  seedYoutube(seeder, clock);
  seedFileSource(seeder, clock);
  seedWebSource(seeder, clock);
}
