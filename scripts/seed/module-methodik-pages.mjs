/* Die verdichteten Seiten des Moduls „second-brain-methodik": Entitäten,
   Begriffe und die Synthese. Die Quellseiten stehen in module-methodik.mjs.

   Die Slugs der Quellseiten kommen herein, damit jede Aussage ihren Beleg
   als Wikilink tragen kann. */

export function methodikPages({ vergleich, werkstatt, video, video2 }) {
  return [
    // ── Entitäten ────────────────────────────────────────────────────────
    {
      type: 'entity',
      slug: 'zettelkasten',
      title: 'Zettelkasten',
      summary: 'Verlinkte Zettel statt Ordner — der Urahn',
      tags: ['methodik'],
      sources: [vergleich],
      created: -45,
      updated: -30,
      reviewed: -30,
      body: `Sammlung kurzer, verlinkter Notizen ohne Ordnerhierarchie. Jede Notiz trägt einen
Gedanken und verweist auf verwandte (source: [[${vergleich}]]).

Stärke beim Wiederfinden, Schwäche bei der Einstiegshürde (source: [[${vergleich}]]).
Der Umgang damit ist [[verdichtung-statt-sammeln]]; die moderne Umsetzung im
Werkzeug ist [[obsidian]].`,
    },
    {
      type: 'entity',
      slug: 'para-methode',
      title: 'PARA-Methode',
      summary: 'Projects, Areas, Resources, Archive — Ordnung nach Handlungsdruck',
      tags: ['methodik'],
      sources: [vergleich],
      created: -45,
      updated: -45,
      reviewed: -30,
      body: `Vier Ablagen: Projekte, Bereiche, Ressourcen, Archiv. Geordnet wird nach
Handlungsdruck, nicht nach Thema (source: [[${vergleich}]]).

Für Aufgaben tragfähig, für Wissen schwach: dasselbe Thema liegt je nach Lage in
drei verschiedenen Ablagen (source: [[${vergleich}]]). Deshalb hier nur die
Trennung Projekte/Bereiche übernommen, für Wissen [[karpathy-wiki]].`,
    },
    {
      type: 'entity',
      slug: 'obsidian',
      title: 'Obsidian',
      summary: 'Markdown-Editor auf einem Ordner — der Prüfstein für Portabilität',
      tags: ['werkzeug'],
      sources: [vergleich],
      created: -45,
      updated: -9,
      reviewed: -9,
      body: `Editor, der einen Ordner voller Markdown-Dateien als verlinktes Netz darstellt
(source: [[${vergleich}]]).

Für dieses Projekt der Prüfstein: was Obsidian nicht lesen kann, ist kein
portables Format. Wikilinks und YAML-Frontmatter sind deshalb Pflicht, siehe
[[karpathy-wiki]].`,
    },
    {
      type: 'entity',
      slug: 'karpathy-wiki',
      title: 'Karpathy-Wiki-Schema',
      summary: 'Quellen, Entitäten, Begriffe, Katalog, Chronik',
      tags: ['methodik', 'schema'],
      sources: [video],
      created: -9,
      updated: -9,
      reviewed: -9,
      body: `Schema für ein LLM-gepflegtes Wiki: Quellen belegen, Entitäten und Begriffe
verdichten, ein Katalog listet, eine Chronik protokolliert jeden Lauf
(source: [[${video}]]).

Zwei Regeln tragen es: [[belegpflicht]] und [[taegliche-chronik]]. Ohne die
verfällt es genauso wie jede andere Sammlung, siehe [[wissensverfall]].`,
    },
    {
      type: 'entity',
      slug: 'yt-dlp',
      title: 'yt-dlp',
      summary: 'Holt Metadaten und Transkripte für Videoquellen',
      tags: ['werkzeug'],
      sources: [video],
      created: -9,
      updated: -9,
      reviewed: -9,
      body: `Kommandozeilenwerkzeug, das Metadaten und Untertitel von Videoplattformen holt.
Grundlage der Rohquelle unter \`raw/youtube/\` (source: [[${video}]]).

Ohne Transkript gibt es kein Zitat mit Zeitmarke — und damit keine Aussage, die
[[belegpflicht]] übersteht.`,
    },

    // ── Begriffe ─────────────────────────────────────────────────────────
    {
      type: 'concept',
      slug: 'wissensverfall',
      title: 'Wissensverfall',
      summary: 'Drei Verfallsformen: verwaist, veraltet, doppelt',
      tags: ['pflege'],
      sources: [video, video2, werkstatt],
      created: -9,
      updated: -9,
      reviewed: -9,
      body: `Eine Sammlung verfällt in drei Formen: verwaiste Seiten, auf die niemand
verlinkt; veraltete Aussagen, die niemand nachgeprüft hat; doppelte Seiten zum
selben Begriff — wie diese Quelle selbst, versehentlich zweimal aufgenommen
(source: [[${video}]], [[${video2}]]).

Der Verfall ist kein Werkzeugproblem: er entsteht, weil Aufnehmen billiger ist
als Pflegen (source: [[${werkstatt}]]). Das Gegenmittel ist ein wiederkehrender
Pflegelauf mit sichtbaren Befunden, nicht ein besseres Programm
(source: [[${video}]]).

Praktisch heißt das [[verdichtung-statt-sammeln]] und [[belegpflicht]].`,
    },
    {
      type: 'concept',
      slug: 'verdichtung-statt-sammeln',
      title: 'Verdichtung statt Sammeln',
      summary: 'Jede Quelle wird auf zwei behaltenswerte Sätze eingekocht',
      tags: ['pflege'],
      sources: [werkstatt],
      created: -30,
      updated: -9,
      reviewed: -9,
      body: `Jede aufgenommene Quelle wird auf das eingekocht, was behalten werden soll —
zwei Sätze reichen. Bleibt nach zwei Sätzen nichts übrig, war es keine Quelle
(source: [[${werkstatt}]]).

Das Verhältnis Aufnehmen zu Verdichten lag im Werkstattbericht bei 5:1 und war
damit noch zu hoch (source: [[${werkstatt}]]). Umgesetzt wird das im Schema
[[karpathy-wiki]] über Seiten, die aus [[zettelkasten]]-Notizen entstehen.`,
    },
    {
      type: 'concept',
      slug: 'belegpflicht',
      title: 'Belegpflicht',
      summary: 'Keine Aussage ohne Quelle und Dateipfad',
      tags: ['pflege', 'qualitaet'],
      sources: [video],
      created: -9,
      updated: -9,
      reviewed: -9,
      body: `Jede nicht-triviale Aussage trägt ihre Quelle als Wikilink. Was sich nicht
belegen lässt, wird nicht behauptet (source: [[${video}]]).

Der Satz aus dem Video dazu: „If you cannot cite it, you do not know it." (11:48,
source: [[${video}]]). Technisch hängt das an [[yt-dlp]] und an
[[taegliche-chronik]]: ohne Zeitmarke und ohne Protokoll ist ein Beleg nicht
nachprüfbar.`,
    },
    {
      type: 'concept',
      slug: 'taegliche-chronik',
      title: 'Tägliche Chronik',
      summary: 'Ein Protokoll pro Tag beantwortet „woran war ich dran"',
      tags: ['pflege', 'journal'],
      sources: [werkstatt],
      created: -30,
      updated: -30,
      reviewed: -30,
      body: `Ein kurzer Eintrag pro Tag, in dem steht, woran gearbeitet wurde und wo es
stehengeblieben ist. Half im Werkstattbericht mehr als jede Ordnerstruktur
(source: [[${werkstatt}]]).

Im Wiki entspricht das der \`log.md\` jedes Moduls, im Vault dem Tageseintrag
unter \`journal/\`. Beides zusammen macht [[wissensverfall]] sichtbar, bevor er
weh tut.`,
    },
    {
      type: 'overview',
      slug: 'overview',
      title: 'Second-Brain-Methodik — Synthese',
      summary: 'Drei Aussagen, alle belegt',
      tags: ['wissen'],
      sources: [video, werkstatt, vergleich],
      created: -45,
      updated: -9,
      reviewed: -9,
      body: `## Der rote Faden

- Sammlungen verfallen in drei Formen — verwaist, veraltet, doppelt —, und zwar
  weil Aufnehmen billiger ist als Pflegen: [[wissensverfall]]
  (source: [[${video}]]).
- Das Gegenmittel ist [[verdichtung-statt-sammeln]]: zwei behaltenswerte Sätze pro
  Quelle, sonst gar keine Seite (source: [[${werkstatt}]]).
- Getragen wird das von [[belegpflicht]] und [[taegliche-chronik]] im Schema
  [[karpathy-wiki]] (source: [[${video}]]).

## Woran das hängt

- Verlinkung schlägt Hierarchie — deshalb [[zettelkasten]] statt Ordner, und
  [[para-methode]] nur für Projekte und Bereiche (source: [[${vergleich}]]).
- Portabilität wird an [[obsidian]] geprüft: Markdown, Frontmatter, Wikilinks.
- Videoquellen brauchen [[yt-dlp]], sonst gibt es kein zitierfähiges Transkript.`,
    },
  ];
}
