/* Wissens-Modul „second-brain-methodik" — das jüngere Modul, sauber gepflegt.
   Es liefert den Gegenpol zu identity-management: hier sind alle Seiten im
   Katalog, alle Links gehen irgendwohin, nichts ist überholt.

   Die Quelle `s-...-ai-second-brain-rotting` gehört zum YouTube-Ordner unter
   `raw/youtube/`; die Web-Quelle unter `raw/web/` ist absichtlich nicht
   verdichtet und hat deshalb hier keine Seite. */

import { methodikPages } from './module-methodik-pages.mjs';

export function methodikModule(clock) {
  const day = clock.day;
  const vergleich = `s-${day(-45)}-notizsysteme-vergleich`;
  const werkstatt = `s-${day(-30)}-zettelkasten-werkstattbericht`;
  const video = `s-${day(-9)}-ai-second-brain-rotting`;

  return {
    slug: 'second-brain-methodik',
    title: 'Second-Brain-Methodik',
    description: 'Wie Notizsysteme verrotten und was dagegen hilft — Belege, keine Ratgeberprosa',
    created: -45,
    updated: -9,
    tags: ['wissen', 'methodik'],
    overviewSummary: 'Der rote Faden: verdichten statt sammeln, mit Beleg',
    body: `Warum Wissenssammlungen verrotten und was dagegen hilft. Angelegt, nachdem der
alte Notizordner drei Jahre lang nur gewachsen ist und nie benutzt wurde.

Die Regel für dieses Modul: keine Aussage ohne Beleg, und lieber zwei Sätze, die
ich behalten will, als eine ganze Quelle, die niemand wieder liest.`,
    log: [
      {
        day: -45,
        kind: 'ingest',
        title: 'Vergleich von Notizsystemen',
        summary: `wiki/sources/${vergleich}.md`,
        touched: ['[[zettelkasten]]', '[[para-methode]]', '[[obsidian]]', 'index.md'],
      },
      {
        day: -30,
        kind: 'ingest',
        title: 'Werkstattbericht Zettelkasten',
        summary: `wiki/sources/${werkstatt}.md`,
        touched: ['[[verdichtung-statt-sammeln]]', '[[taegliche-chronik]]', 'index.md'],
      },
      {
        day: -9,
        kind: 'ingest',
        title: 'Your AI Second Brain Is Slowly Rotting',
        summary: `wiki/sources/${video}.md`,
        touched: ['[[wissensverfall]]', '[[belegpflicht]]', '[[karpathy-wiki]]', 'index.md'],
        notes: 'Rohquelle: raw/youtube/xOFkpf9KgKg — Transkript und Metadaten liegen dort',
      },
      {
        day: -9,
        kind: 'pflege',
        title: 'Synthese nachgezogen',
        touched: ['[[overview]]', 'index.md'],
        notes: 'Übersicht auf drei Aussagen gekürzt, alles ohne Beleg gestrichen',
      },
    ],
    pages: [
      // ── Quellen ──────────────────────────────────────────────────────────
      {
        type: 'source',
        slug: vergleich,
        title: 'Vergleich von Notizsystemen (Artikelreihe)',
        summary: 'Zettelkasten, PARA und Tagebuchansätze nebeneinander',
        tags: ['wissen', 'methodik'],
        created: -45,
        updated: -45,
        reviewed: -30,
        extra: { origin: 'https://example.org/notizsysteme-im-vergleich' },
        body: `Dreiteilige Artikelreihe, die vier Systeme an derselben Aufgabe durchspielt:
„finde in zwei Minuten, was du vor einem Jahr über X gedacht hast".

## Was drinsteht

- Ordnerbasierte Systeme scheitern an Mehrfachzuordnung; Verlinkung schlägt Hierarchie.
- PARA ordnet nach Handlungsdruck, nicht nach Thema — gut für Aufgaben, schwach für Wissen.
- Der Zettelkasten gewinnt beim Wiederfinden und verliert bei der Einstiegshürde.

## Wörtliche Stellen

> Folders answer „where does this go", links answer „what does this have to do with".`,
      },
      {
        type: 'source',
        slug: werkstatt,
        title: 'Werkstattbericht: ein Jahr Zettelkasten',
        summary: 'Erfahrungsbericht mit Zahlen: was gelesen, was verdichtet wurde',
        tags: ['wissen', 'praxis'],
        created: -30,
        updated: -30,
        reviewed: -30,
        extra: { origin: 'https://example.net/werkstattbericht-zettelkasten' },
        body: `Erfahrungsbericht mit Zahlen aus einem Jahr: 412 aufgenommene Quellen, 87
verdichtete Seiten, 12 Seiten, die tatsächlich wiederverwendet wurden.

## Was drinsteht

- Das Verhältnis Aufnehmen zu Verdichten lag bei 5:1 — und war damit noch zu hoch.
- Eine tägliche Chronik half mehr als jede Struktur: sie beantwortet „woran war ich dran".
- Wer Quellen ohne Zusammenfassung ablegt, liest sie nie wieder.

## Wörtliche Stellen

> Die Sammlung war nie das Problem. Das Wiederlesen war das Problem.`,
      },
      {
        type: 'source',
        slug: video,
        title: 'Your AI Second Brain Is Slowly Rotting (Video)',
        summary: 'Wie KI-gestützte Sammlungen verfallen, wenn niemand pflegt',
        tags: ['wissen', 'video'],
        created: -9,
        updated: -9,
        reviewed: -9,
        extra: {
          origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
          raw: 'raw/youtube/xOFkpf9KgKg',
        },
        body: `Video, 18 Minuten. Rohquelle mit Transkript liegt unter
\`raw/youtube/xOFkpf9KgKg\`; Zitate mit Zeitmarke stehen in
\`transcript.timestamped.md\`.

## Was drinsteht

- Automatisch gefüllte Sammlungen wachsen schneller, als ein Mensch sie prüfen kann.
- Drei Verfallsformen: verwaiste Seiten, veraltete Aussagen, doppelte Seiten
  zum selben Begriff.
- Gegenmittel ist kein Werkzeug, sondern ein wiederkehrender Pflegelauf mit
  sichtbaren Befunden.

## Wörtliche Stellen

> An unmaintained knowledge base is a landfill with good intentions. (07:12)

> If you cannot cite it, you do not know it. (11:48)`,
      },

      ...methodikPages({ vergleich, werkstatt, video }),
    ],
  };
}
