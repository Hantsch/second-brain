/* Die vier privaten Vorhaben: ein laufendes Hobbyprojekt mit Todos, eine Idee,
   ein pausiertes Vorhaben und eine Pflichtaufgabe mit Frist.

   Alle Personen und Inhalte sind erfunden. */

export function privateProjects(clock) {
  const day = clock.day;
  return [
    {
      slug: 'hochbeet-bauen',
      title: 'Hochbeet für den Balkon',
      scope: 'private',
      status: 'active',
      priority: 3,
      started: day(-21),
      next_step: 'Bretter auf Länge sägen — Maße liegen im Notizteil',
      tags: ['garten', 'holz'],
      modules: [],
      repos: [],
      created: day(-21),
      updated: day(-2),
      touch: [-2, '19:10'],
      stand: `Maße stehen: 120 × 60 × 80, Lärche unbehandelt, innen mit Noppenfolie. Das Holz
liegt seit Samstag im Keller, die Schrauben auch. Nico hat seine Kappsäge
angeboten, damit sind die Schnitte in einer Stunde durch.

Erde und Pflanzen erst danach, sonst steht die halbe Wohnung voll.`,
      todos: [
        `- [ ] Bretter auf Länge sägen @due:${day(0)}`,
        '- [ ] Noppenfolie innen anbringen',
        '- [ ] Erde und Kompost holen (zwei Fahrten, Kofferraum reicht nicht)',
      ],
      notes: [
        {
          day: -2,
          text: `Nico bringt die Kappsäge am Wochenende mit. Schnittliste: 4 × 120 cm, 4 × 60 cm,
4 × 80 cm für die Ecken, plus zwei Querstreben.`,
        },
      ],
    },
    {
      slug: 'podcast-werkstattfunk',
      title: 'Podcast-Idee: Werkstattfunk',
      scope: 'private',
      status: 'idea',
      priority: 5,
      started: day(-14),
      next_step: 'Drei Folgenideen aufschreiben und eine Stunde Testaufnahme machen',
      tags: ['idee', 'audio'],
      modules: [],
      repos: [],
      created: day(-14),
      updated: day(-14),
      touch: [-14, '22:35'],
      stand: `Halbe Stunde pro Folge, immer dasselbe Muster: ein Handwerk, eine Person, ein
Gegenstand, der dabei entsteht. Kein Interview über Karrieren, sondern über
Handgriffe.

Noch nichts davon existiert. Erst prüfen, ob mir nach drei Folgenideen überhaupt
noch etwas einfällt — sonst bleibt es eine Idee, und das ist auch in Ordnung.`,
      todos: ['- [ ] Drei Folgenideen aufschreiben #idee'],
      notes: [],
    },
    {
      slug: 'italienisch-lernen',
      title: 'Italienisch lernen',
      scope: 'private',
      status: 'paused',
      priority: 4,
      started: day(-120),
      next_step: 'Nach dem Kundenportal-Release mit Lektion 7 wieder anfangen',
      tags: ['sprache', 'lernen'],
      modules: [],
      repos: [],
      created: day(-120),
      updated: day(-33),
      touch: [-33, '20:00'],
      stand: `Bewusst pausiert, nicht abgebrochen. Sechs Lektionen sind durch, die Vokabeln
sitzen halb. Solange das Kundenportal läuft, ist abends nichts mehr drin — und
schlechtes Gewissen ist kein Lernmotor.

Wiedereinstieg heißt: Lektion 7, zwei Abende pro Woche, jeweils 25 Minuten.`,
      todos: [
        '- [ ] Lektion 7 durcharbeiten',
        `- [x] Vokabelkarten für Lektion 1–6 angelegt @done:${day(-40)}`,
      ],
      notes: [],
    },
    {
      slug: 'finanzen-aufraeumen',
      title: 'Finanzen aufräumen',
      scope: 'private',
      status: 'active',
      priority: 2,
      started: day(-40),
      deadline: day(18),
      next_step: 'Belege 2025 sortieren und an Svenja geben',
      tags: ['finanzen', 'papierkram'],
      modules: [],
      repos: [],
      created: day(-40),
      updated: day(-5),
      touch: [-5, '18:25'],
      stand: `Zwei Dinge: Belege für die Steuererklärung sortieren und die drei Daueraufträge
kündigen, die niemand mehr braucht. Svenja aus dem Steuerbüro braucht die Belege
bis Monatsende, sonst wird es knapp mit der Frist.

Die Daueraufträge sind der kleinere Posten, aber sie sparen jeden Monat Geld —
also zuerst.`,
      todos: [
        `- [ ] Belege 2025 sortieren und hochladen @due:${day(-3)} !!`,
        `- [ ] Rückfrage zur Kilometerpauschale @wait:Svenja @needed:${day(6)}`,
      ],
      notes: [
        {
          day: -5,
          text: `Svenja braucht die Belege spätestens zwei Wochen vor der Frist. Alles vor 2025 ist
abgeschlossen und kann in den Ordner im Keller.`,
        },
      ],
    },
  ];
}
