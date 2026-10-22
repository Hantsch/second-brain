/* Wissens-Modul „second-brain-methodik" — das jüngere Modul, sauber gepflegt.
   Es liefert den Gegenpol zu identity-management: hier sind alle Seiten im
   Katalog, alle Links gehen irgendwohin, nichts ist überholt.

   Die Quelle `s-...-ai-second-brain-rotting` gehört zum YouTube-Ordner unter
   `raw/youtube/`; die Web-Quelle unter `raw/web/` ist absichtlich nicht
   verdichtet und hat deshalb hier keine Seite.

   Eine Ausnahme von „nichts ist überholt", absichtlich (015 D9): dasselbe
   Video wurde zweimal aufgenommen — `video` und `video2` (Slug mit `-2`) tragen
   denselben Rumpf, wortgleich. Das ist genau der Fall, den [[wissensverfall]]
   selbst als eine der drei Verfallsformen nennt ("doppelte Seiten zum selben
   Begriff") — hier als reales Beispiel im Modul, nicht nur als Behauptung im
   Text. Der Gardener meldet das Paar als Beinahe-Dublette
   (`near-duplicate.ts`); die Karte im Pflege-Screen bietet Verwerfen oder
   Benennen als überholt an.

   Zweite absichtliche Ausnahme (016 D8): `interview` ist eine frisch
   verdichtete Quellenseite, die vom Rest des Moduls mit **null** Kandidaten
   verwaist ist — der genaue Fall aus der Story ("eine frisch verdichtete
   Quellenseite, die noch niemand erwähnt"), zur Abgrenzung von `scim` im
   Modul `identity-management` (dort gibt es genau eine Stelle, die den Namen
   nennt, ohne zu verlinken — der unveränderte Ein-Klick-Fix bleibt dafür der
   Regressionsfall). Titel und Rumpf von `interview` teilen absichtlich keine
   Wortfolge mit einer anderen Seite dieses Moduls, damit `singleMention`
   (`orphan.ts`) wirklich null Treffer liefert und die Karte auf den Picker
   angewiesen ist, nicht auf den Ein-Klick-Fix. Sinnvolle Ziele von Hand: die
   Modul-Übersicht (`overview`, die den Verfall schon thematisiert) oder das
   Begriff [[wissensverfall]] selbst — beides plausible Stellen für „Related:
   [[interview]]", genau das, was der Picker in 016 anbietet. */

import { methodikPages } from './module-methodik-pages.mjs';

export function methodikModule(clock) {
  const day = clock.day;
  const vergleich = `s-${day(-45)}-notizsysteme-vergleich`;
  const werkstatt = `s-${day(-30)}-zettelkasten-werkstattbericht`;
  const video = `s-${day(-9)}-ai-second-brain-rotting`;
  /* Versehentliche Zweitaufnahme derselben Quelle — der reale Fall aus 015. */
  const video2 = `${video}-2`;
  /* Frisch verdichtet, noch von keiner anderen Seite erwähnt — der
     Null-Kandidaten-Fall aus 016 D8, siehe Kommentar oben. */
  const interview = `s-${day(-2)}-notiz-communities-interview`;

  return {
    slug: 'second-brain-methodik',
    title: 'Second-Brain-Methodik',
    description: 'Wie Notizsysteme verrotten und was dagegen hilft — Belege, keine Ratgeberprosa',
    created: -45,
    updated: -2,
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
        kind: 'ingest',
        title: 'Your AI Second Brain Is Slowly Rotting (Video) — versehentlich erneut aufgenommen',
        summary: `wiki/sources/${video2}.md`,
        touched: ['[[wissensverfall]]'],
        notes:
          'Dieselbe Rohquelle raw/youtube/xOFkpf9KgKg ein zweites Mal verdichtet — ' +
          'Duplikat, keine neue Erkenntnis. Kandidat für den Pflege-Screen.',
      },
      {
        day: -9,
        kind: 'pflege',
        title: 'Synthese nachgezogen',
        touched: ['[[overview]]', 'index.md'],
        notes: 'Übersicht auf drei Aussagen gekürzt, alles ohne Beleg gestrichen',
      },
      {
        day: -2,
        kind: 'ingest',
        title: 'Interview: Warum Notiz-Communities ihre Wikis nicht pflegen',
        summary: `wiki/sources/${interview}.md`,
        touched: ['index.md'],
        notes:
          'Nur die Quellenseite selbst entstanden, kein Begriff und keine Übersicht ' +
          'nachgezogen — noch von keiner anderen Seite erwähnt. Kandidat für den ' +
          'Pflege-Screen (016 D8, Null-Kandidaten-Fall)',
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
      {
        /* Wortgleiche Zweitaufnahme derselben Quelle (015 D9) — Titel, Rumpf und
           Beleg-Origin bleiben identisch, nur der Slug trägt die `-2`, exakt wie
           im Beispiel aus der Story: „dasselbe Video, zweimal aufgenommen". */
        type: 'source',
        slug: video2,
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

      /* 016 D8: die frisch verdichtete Quellenseite mit null Mention-Kandidaten,
         siehe Erklärung im Dateikopf. Titel und Rumpf teilen absichtlich keine
         Wortfolge mit einer anderen Seite dieses Moduls — `singleMention`
         (orphan.ts) findet dadurch keine einzelne Stelle, und die Karte im
         Pflege-Screen muss auf den Picker aus 016 ausweichen. Sinnvolle
         Handauswahl: die Modul-Übersicht (`overview`) oder [[wissensverfall]]. */
      {
        type: 'source',
        slug: interview,
        title: 'Interview: Warum Notiz-Communities ihre Wikis nicht pflegen',
        summary: 'Gespräch mit einer Forums-Moderatorin über die Ursachen des Verfalls',
        /* Nicht im Katalog: eine dort gelistete Seite gilt nicht mehr als verwaist. */
        unlisted: true,
        tags: ['wissen', 'community'],
        created: -2,
        updated: -2,
        reviewed: -2,
        extra: { origin: 'https://example.org/podcast/notiz-communities-interview' },
        body: `Zwanzig Minuten mit der Moderatorin eines großen Notiz-Forums, aufgezeichnet
für die eigene Recherche zur Vault-Pflege. Noch nirgends im Modul eingeordnet —
frisch verdichtet, nur die Quellenseite selbst existiert bisher.

## Was drinsteht

- In den meisten Community-Wikis pflegt am Ende eine einzelne Person die ganze
  Struktur — fällt sie aus, verwaist der Rest binnen Wochen.
- Verlinkungsregeln werden beim Anlegen aufgeschrieben und beim Bearbeiten
  vergessen: eine neue Seite entsteht isoliert, weil das Verlinken ein
  zweiter, separater Schritt bleibt.
- Ein wiederkehrender Kontrolllauf wird in der Praxis eher akzeptiert als eine
  Verlinkungspflicht beim Schreiben selbst — Kontrolle danach schlägt Zwang
  davor.

## Wörtliche Stellen

> Wir haben Regeln fürs Verlinken aufgeschrieben. Gelesen hat sie niemand mehr
> nach der ersten Woche.

> Was am Ende zählt, ist nicht die Regel, sondern ob am Montag jemand
> nachschaut, was seit letzter Woche liegen geblieben ist.`,
      },

      ...methodikPages({ vergleich, werkstatt, video, video2 }),
    ],
  };
}
