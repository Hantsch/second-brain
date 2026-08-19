/* 15 Tageseinträge über die letzten drei Wochen — mit Lücken, weil niemand
   jeden Tag schreibt. Drei Tage tragen einen Coaching-Dialog: der stressige
   Tag (offset -2) bleibt bewusst im alten, nicht mehr geschriebenen, aber
   weiter lesbaren `## Gespräch`-Format (Legacy, 011) — genau er zeigt im
   Screenshot am klarsten ein Gespräch, das sichtbar getrennt von der
   Tagesprosa steht, und damit auch die "Gespräch in den Eintrag holen"-
   Aktion. Offset -9 webt denselben Dialog direkt in `## Tag` ein, im neuen,
   verschachtelten Stream-Format. Offset -6 ist das Interview (012): dieselbe
   Blockquote-dann-Prosa-Form, aber mit den fünf echten Interview-Fragen aus
   `src/core/journal/interview.ts#INTERVIEW_QUESTIONS.de` statt frei
   formulierter Coaching-Sätze, und ohne einleitenden freien Absatz davor —
   siehe `streamBlock` und den Kommentar an diesem Eintrag.

   Aufbau nach docs/VAULT-FORMAT.md: `## Tag` (mit optional eingewobenen
   Antwort-Blöcken), optional die Legacy-Überschrift `## Gespräch`, optional
   `## Fakten`. Personen sind erfunden, Projekte sind dieselben Slugs wie
   unter `projects/`. */

import { countTodos } from './projects.mjs';

function entries(clock) {
  const day = clock.day;
  return [
    {
      offset: 0,
      mood: 3,
      energy: 3,
      people: ['Miriam', 'Jonas'],
      projects: ['kundenportal-relaunch'],
      tags: [],
      time: '18:20',
      tag: `Vormittag im Testsystem, nachmittags Abnahmeprotokoll vorbereitet. Miriam hat drei
Punkte nachgereicht, zwei davon sind Textänderungen. Jonas hat den Sitzungs-Fallback
angefangen und dabei gemerkt, dass der Interceptor zwei Stellen hat, die dasselbe tun.

Die Ladezeiten sind das einzige echte Risiko für die Abnahme in drei Tagen.`,
      facts: [`- [ ] Doppelten Interceptor im Kundenportal zusammenlegen @due:${day(7)} #work`],
    },
    {
      offset: -1,
      mood: 4,
      energy: 3,
      people: ['Miriam'],
      projects: ['kundenportal-relaunch', 'rechnungsautomatisierung'],
      tags: [],
      time: '17:55',
      tag: `Testlauf mit Miriam lief besser als erwartet. Die Suche über Kundennummern war der
einzige Stolperstein — sie hatte erwartet, dass die Nummer ohne Präfix funktioniert.

Nebenbei die Zahlen der Rechnungsautomatisierung angeschaut: 214 Belege, drei
Fehlgriffe. Das ist gut genug, um das Projekt abzuschließen.`,
    },
    {
      offset: -2,
      mood: 2,
      energy: 1,
      people: ['Tobias', 'Miriam'],
      projects: ['orbit-sso-migration', 'kundenportal-relaunch', 'finanzen-aufraeumen'],
      tags: ['stress'],
      time: '21:40',
      tag: `Zäher Tag. Tobias hat auf die dritte Nachfrage zum Rollenkonzept nicht geantwortet,
gleichzeitig kam die Abnahme im Kundenportal näher, und abends fiel mir ein, dass die
Belege für Svenja auch noch liegen.

Drei Baustellen, an keiner bin ich weitergekommen. Um 20 Uhr habe ich aufgehört und
eine Liste gemacht, statt weiter zwischen den Fenstern zu springen.`,
      /* Bleibt im alten `## Gespräch`-Format (011): der einzige seeded Tag,
         der noch zeigt, wie ein Legacy-Tag aussieht und wie sich "Gespräch in
         den Eintrag holen" verhält. */
      legacyDialogue: true,
      dialogue: [
        {
          who: 'ich',
          time: '21:05',
          text: 'Der Sprint fühlt sich unmöglich an. Drei Sachen gleichzeitig, und alle warten auf mich.',
        },
        {
          who: 'brain',
          time: '21:05',
          text: `Zwei der drei warten nicht auf dich, sondern auf andere: das Rollenkonzept liegt bei
Tobias, die Kilometerpauschale bei Svenja. Was heute wirklich an dir hing, war die
Abnahmevorbereitung — und die ist fertig.`,
        },
        {
          who: 'ich',
          time: '21:12',
          text: 'Stimmt. Es fühlt sich trotzdem nach zu viel an.',
        },
        {
          who: 'brain',
          time: '21:12',
          text: `Weil du drei offene Enden im Kopf hältst statt auf Papier. Trag die zwei Warte-auf
mit Frist ein, dann darf der Kopf sie loslassen. Bleibt eine Sache für morgen: die
Ladezeiten der Angebotsliste.`,
        },
      ],
      facts: [
        `- [ ] Ladezeiten der Angebotsliste messen und Ursache eingrenzen @due:${day(-2)} !! #work`,
      ],
    },
    {
      offset: -4,
      mood: 3,
      energy: 4,
      people: ['Nico'],
      projects: ['hochbeet-bauen'],
      tags: [],
      time: '20:15',
      tag: `Holz geholt. Lärche, unbehandelt, 18 mm — der Zuschnitt im Baumarkt war zu, also
sägt Nico am Wochenende. Abends noch die Bildkompression im Kundenportal auf WebP
umgestellt, das war eine ruhige halbe Stunde.`,
    },
    {
      offset: -5,
      mood: 3,
      energy: 3,
      people: ['Kerstin'],
      projects: ['angebot-praxisnetz', 'finanzen-aufraeumen'],
      tags: [],
      time: '18:40',
      tag: `Angebotsentwurf für das Praxisnetz steht. Kerstin sitzt auf den Lizenzkosten des
Terminmoduls; ohne die Zahl kann ich keinen Preis nennen. Nachgefragt und mit Frist
notiert.

Danach eine Stunde Belege sortiert. 2025 ist zur Hälfte durch.`,
      facts: [`- [ ] Belege 2025 zu Ende sortieren @due:${day(-3)} !!`],
    },
    {
      offset: -6,
      mood: 3,
      energy: 2,
      people: ['Miriam'],
      projects: ['kundenportal-relaunch', 'orbit-sso-migration'],
      tags: [],
      time: '19:20',
      /* Kein `tag`: dieser Tag ist ein reines Interview (012, D7) — kein
         freier Absatz davor, nur die beantworteten Fragen, damit der
         Screenshot die Q&A-Form so klar wie möglich zeigt. Die Fragen sind
         wortwörtlich aus `src/core/journal/interview.ts#INTERVIEW_QUESTIONS.de`
         übernommen, nicht neu formuliert — sonst wäre der Tag nicht als
         Interview erkennbar. */
      dialogue: [
        { who: 'brain', time: '19:00', text: 'Woran hast du heute gearbeitet?' },
        {
          who: 'ich',
          time: '19:00',
          text: `Vormittags weiter am Kundenportal, die Ladezeiten der Angebotsliste gemessen und
einen ersten Verdacht gefunden. Nachmittags kurz in die SSO-Migration reingeschaut,
aber ohne Fortschritt — der Testmandant von Halim ist immer noch nicht da.`,
        },
        { who: 'brain', time: '19:07', text: 'Mit wem hattest du heute zu tun?' },
        {
          who: 'ich',
          time: '19:07',
          text: 'Nur kurz mit Miriam telefoniert, wegen der Abnahme nächste Woche. Sonst war es ein stiller Tag.',
        },
        { who: 'brain', time: '19:14', text: 'Wie hat sich der Tag angefühlt?' },
        {
          who: 'ich',
          time: '19:14',
          text: `Ruhiger als die letzten, aber am Nachmittag spürbar müde. Kein Feuer, das gelöscht
werden musste — einfach normale Arbeit.`,
        },
      ],
    },
    {
      offset: -7,
      mood: 4,
      energy: 4,
      people: [],
      projects: ['rechnungsautomatisierung'],
      tags: [],
      time: '17:30',
      tag: `Guter Tag. Die Fehlerbehandlung für unlesbare Belege läuft: unklare Fälle wandern in
eine Prüfliste statt in eine falsche Buchung. Das war der letzte inhaltliche Punkt,
jetzt fehlt nur die Dokumentation.`,
    },
    {
      offset: -8,
      mood: 3,
      energy: 2,
      people: ['Jonas'],
      projects: ['kundenportal-relaunch'],
      tags: [],
      time: '19:05',
      tag: `Mit Jonas über die Filterleiste gesprochen. Wir lassen die eigene Suchseite weg —
eine Stelle weniger, an der Berechtigungen geprüft werden. Entscheidung im Projekt
notiert, damit sie in vier Wochen nicht wieder aufgemacht wird.`,
    },
    {
      offset: -9,
      mood: 2,
      energy: 2,
      people: ['Halim'],
      projects: ['orbit-sso-migration'],
      tags: [],
      time: '21:20',
      tag: `Halim hat den Zugang zum Testmandanten beantragt, dauert angeblich vier Tage. Damit
liegt die SSO-Migration an zwei Stellen fest, und beide sind nicht bei mir.

Abends ein Video über verrottende Wissenssammlungen gesehen und in den Vault
gezogen. Trifft ziemlich genau, was hier passiert.`,
      dialogue: [
        {
          who: 'ich',
          time: '21:02',
          text: 'Ich sammle mehr, als ich verarbeite. Das Modul zu Notizsystemen wächst, aber ich lese nichts davon nochmal.',
        },
        {
          who: 'brain',
          time: '21:02',
          text: `Das deckt sich mit dem Bestand: in second-brain-methodik liegen drei Quellen, aber die
Übersichtsseite ist seit dem ersten Ingest nicht mehr angefasst worden. Sammeln ist
nicht das Problem, das Verdichten fehlt.`,
        },
        {
          who: 'ich',
          time: '21:09',
          text: 'Und was mache ich damit?',
        },
        {
          who: 'brain',
          time: '21:09',
          text: `Nimm dir eine Quelle und schreibe zwei Sätze, die du behalten willst — mit Beleg.
Wenn nach zwei Sätzen nichts übrig bleibt, war die Quelle keine. Das ist billiger als
jede Aufräumaktion später.`,
        },
      ],
      facts: [`- [ ] Übersichtsseite in second-brain-methodik verdichten @due:${day(4)} #wissen`],
    },
    {
      offset: -11,
      mood: 3,
      energy: 3,
      people: ['Tobias'],
      projects: ['orbit-sso-migration'],
      tags: [],
      time: '18:10',
      tag: `Rollenkonzept an Tobias geschickt. Die offene Frage darin: erben Unterorganisationen
die Rollen der Elternorganisation? Davon hängt ab, ob wir zwölf oder vierzig Gruppen
anlegen. Im Modul steht dazu ein älterer Stand, der dem Whitepaper widerspricht.`,
    },
    {
      offset: -13,
      mood: 4,
      energy: 3,
      people: [],
      projects: ['hochbeet-bauen', 'podcast-werkstattfunk'],
      tags: [],
      time: '22:35',
      tag: `Abends Maße für das Hochbeet gerechnet und dabei über eine Podcast-Idee
nachgedacht: eine halbe Stunde pro Folge, ein Handwerk, ein Gegenstand, der dabei
entsteht. Als Idee angelegt, mehr nicht.`,
    },
    {
      offset: -14,
      mood: 3,
      energy: 2,
      people: ['Miriam'],
      projects: ['kundenportal-relaunch'],
      tags: [],
      time: '17:45',
      tag: `Sprintplanung mit Miriam. Der Relaunch bekommt zwei Wochen, danach ist Schluss —
das ist ehrlicher als eine dritte Verlängerung. Die Angebotsliste ist der Kern, alles
andere kann nach dem Livegang kommen.`,
    },
    {
      offset: -16,
      mood: 3,
      energy: 4,
      people: [],
      projects: ['datenmigration-legacy-crm'],
      tags: [],
      time: '16:50',
      tag: `Nochmal in die Datenmigration geschaut, ohne Ergebnis: die Rechtsabteilung des Kunden
hat sich seit sechs Wochen nicht gemeldet. Wenn diese Woche nichts kommt, setze ich das
Projekt auf pausiert, statt es weiterzuschleppen.`,
    },
    {
      offset: -18,
      mood: 4,
      energy: 4,
      people: ['Nico'],
      projects: [],
      tags: [],
      time: '20:30',
      tag: `Freier Abend mit Nico in der Werkstatt. Nichts gearbeitet, nichts notiert — und
genau deshalb hier vermerkt, weil solche Abende in der Rückschau immer fehlen.`,
    },
    {
      offset: -20,
      mood: 2,
      energy: 2,
      people: ['Svenja'],
      projects: ['finanzen-aufraeumen', 'italienisch-lernen'],
      tags: [],
      time: '21:00',
      tag: `Svenja hat die Unterlagenliste geschickt, länger als erwartet. Italienisch fällt
diesen Monat aus; das ist keine Niederlage, sondern eine Entscheidung. Lektion 7 wartet.`,
    },
  ];
}

/* Legacy-Rendering (weiter gelesen, nicht mehr geschrieben): jede Runde als
   eigener Blockquote unter der eigenen Überschrift `## Gespräch`. */
function dialogueBlock(entry) {
  const lines = [];
  for (const turn of entry.dialogue) {
    const speaker = turn.who === 'ich' ? 'Ich' : 'Second Brain';
    const text = turn.text
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    lines.push(`> **${speaker}** — ${turn.time}`, text, '');
  }
  return lines.join('\n');
}

/* Neues Stream-Format (011): dieselben Runden, aber direkt in `## Tag`
   eingewoben statt in einer eigenen `## Gespräch`-Sektion — eine `ich`-Runde
   wird ein zusätzlicher Prosa-Absatz (kein Blockquote, kein Sprecher-Label,
   genau wie meine eigenen Worte im neuen Format aussehen,
   src/core/journal/stream.ts), eine `brain`-Runde derselbe Blockquote-Block,
   den `formatTurn`/`formatAnswer` erzeugen. Absichtlich eine eigene Funktion
   statt eine Erweiterung von `dialogueBlock`: die beiden Sektionen haben
   unterschiedliche Form, kein gemeinsamer Code macht das klarer. */
function streamBlock(entry) {
  const lines = [];
  for (const turn of entry.dialogue) {
    if (turn.who === 'ich') {
      lines.push(turn.text.trim(), '');
      continue;
    }
    const quoted = turn.text
      .trim()
      .split('\n')
      .map((line) => (line.trim().length === 0 ? '>' : `> ${line.trimEnd()}`))
      .join('\n');
    lines.push(`> **Second Brain** — ${turn.time}`, quoted, '');
  }
  return lines.join('\n');
}

export function seedJournal(seeder, clock) {
  for (const entry of entries(clock)) {
    const date = clock.day(entry.offset);
    /* `tag` ist optional: der Interview-Tag (offset -6) hat keinen freien
       Absatz, nur die beantworteten Fragen — genau das, was ein Tag zeigt,
       dessen einziger Inhalt bislang ein Interview war (`recordAnswer`
       schreibt nichts anderes vor dem ersten Fragen/Antworten-Paar). */
    const parts = entry.tag ? ['## Tag', '', entry.tag.trim(), ''] : ['## Tag', ''];
    if (entry.dialogue) {
      if (entry.legacyDialogue) {
        parts.push('## Gespräch', '', dialogueBlock(entry));
      } else {
        parts.push(streamBlock(entry));
      }
      /* Ein Zähler für beide Formen: die Zusammenfassung
         (scripts/seed-vault.mjs) meldet "Tage mit Coaching-Dialog" — das ist
         unabhängig davon wahr, ob die Runden in einer eigenen `## Gespräch`-
         Sektion oder eingewoben in `## Tag` stehen. */
      seeder.bump('journalDialogues');
    }
    if (entry.facts) {
      parts.push('## Fakten', '', ...entry.facts, '');
    }
    const body = parts.join('\n');
    seeder.doc(
      `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`,
      {
        type: 'journal',
        title: clock.title(entry.offset),
        date,
        mood: entry.mood,
        energy: entry.energy,
        people: entry.people,
        projects: entry.projects,
        tags: entry.tags,
        lang: 'de',
      },
      body,
      clock.date(entry.offset, entry.time),
    );
    seeder.bump('journal');
    countTodos(seeder, body);
  }
}
