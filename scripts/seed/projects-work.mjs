/* Die fünf Arbeitsprojekte des Demo-Vaults. Jedes deckt einen Zustand ab, den
   die Oberfläche zeigen muss: Frist in drei Tagen, überfälliges Warte-auf,
   seit 40 Tagen unangetastet, ohne nächsten Schritt, fast fertig.

   Alle Personen, Firmen und Repos sind erfunden. */

export function workProjects(clock) {
  const day = clock.day;
  return [
    {
      slug: 'kundenportal-relaunch',
      title: 'Kundenportal Relaunch',
      scope: 'work',
      status: 'active',
      priority: 1,
      started: day(-52),
      deadline: day(3),
      next_step:
        'Abnahmeprotokoll mit Miriam durchgehen und die offenen Punkte aus dem Testlauf schließen',
      tags: ['kundenportal', 'frontend'],
      modules: [],
      repos: ['C:/development/demo/kundenportal-web'],
      created: day(-52),
      updated: day(0),
      touch: [0, '08:40'],
      stand: `Die neue Angebotsliste ist auf dem Testsystem, Miriam hat sie am Dienstag mit zwei
Kolleginnen durchgeklickt. Zwei Punkte blieben offen: die Liste braucht bei 400
Angeboten noch über drei Sekunden, und abgelaufene Sitzungen landen auf einer
weißen Seite statt auf dem Login.

Die Abnahme ist für ${day(3)} angesetzt. Danach geht der Relaunch in zwei
Schritten live, erst intern, eine Woche später für alle Kunden.`,
      todos: [
        `- [ ] Ladezeiten der Angebotsliste unter 1,5 s bringen @due:${day(-2)} !!`,
        `- [ ] Abnahmeprotokoll mit Miriam durchgehen @due:${day(0)} !!!`,
        `- [ ] Fallback für abgelaufene Sitzungen bauen @wait:Jonas @needed:${day(2)} !!`,
        `- [ ] Restliche Oberflächentexte gegen die neue Tonalität prüfen @due:${day(6)} #texte`,
        `- [x] Bilder auf WebP umgestellt @done:${day(-4)}`,
      ],
      notes: [
        {
          day: -1,
          text: `Testlauf mit Miriam: die Suche über Kundennummern war der Knackpunkt, alles andere
lief durch. Jonas übernimmt den Sitzungs-Fallback, weil er den Interceptor kennt.`,
        },
        {
          day: -6,
          text: `Entscheidung: keine eigene Suchseite. Die Filterleiste in der Liste reicht, und wir
sparen uns eine zweite Stelle, an der Berechtigungen geprüft werden müssen.`,
        },
      ],
    },
    {
      slug: 'orbit-sso-migration',
      title: 'Orbit SSO-Migration',
      scope: 'work',
      status: 'waiting',
      priority: 2,
      started: day(-31),
      deadline: day(24),
      next_step: 'Nach der Freigabe des Rollenkonzepts den Testmandanten aufsetzen',
      tags: ['auth', 'migration', 'infrastruktur'],
      modules: ['identity-management'],
      repos: ['C:/development/demo/orbit-sso-infra'],
      waiting_on: [
        {
          who: 'Tobias',
          what: 'Freigabe des Rollenkonzepts',
          since: day(-12),
          due: day(-2),
        },
        {
          who: 'Halim',
          what: 'Zugang zum Testmandanten',
          since: day(-4),
          due: day(4),
        },
      ],
      created: day(-31),
      updated: day(-2),
      touch: [-2, '16:20'],
      stand: `Das Rollenkonzept liegt seit zwölf Tagen bei Tobias. Ohne seine Freigabe darf der
Testmandant nicht angelegt werden, also steht die Migration still — der Rest ist
vorbereitet: Terraform-Module stehen, die Gruppenabbildung ist geschrieben, die
Abnahmefälle sind formuliert.

Fachlich hängt alles an zwei Fragen, die im Modul identity-management belegt sind:
wie lange Tokens leben und wie streng Mandanten getrennt werden.`,
      todos: [
        `- [ ] Rollen-Mapping mit Tobias abstimmen @wait:Tobias @needed:${day(-1)} !!!`,
        `- [ ] Testmandant aufsetzen und Gruppen importieren @due:${day(9)} !`,
        `- [x] Terraform-State migriert @done:${day(-14)}`,
      ],
      notes: [
        {
          day: -12,
          text: `Rollenkonzept an Tobias geschickt. Offene Frage darin: erben Unterorganisationen
die Rollen der Elternorganisation? Das entscheidet, wie viele Gruppen wir anlegen.`,
        },
      ],
    },
    {
      slug: 'datenmigration-legacy-crm',
      title: 'Datenmigration Legacy-CRM',
      scope: 'work',
      status: 'active',
      priority: 3,
      started: day(-95),
      next_step: 'Feldzuordnung für die Kontakthistorie zu Ende bringen',
      tags: ['migration', 'daten'],
      modules: [],
      repos: [],
      created: day(-95),
      updated: day(-40),
      touch: [-40, '11:05'],
      stand: `Liegt. Der Kunde wollte erst die Rechtsabteilung fragen, ob die Kontakthistorie
überhaupt mitwandern darf, und hat sich seitdem nicht mehr gemeldet. Der
Export-Skript-Stand von damals liegt im Ordner \`notes/\`; die Feldzuordnung ist zu
zwei Dritteln fertig.

Wenn nichts kommt, ist die ehrliche Antwort: pausieren statt weiterschleppen.`,
      todos: [
        '- [ ] Feldzuordnung Kontakthistorie fertigstellen',
        '- [ ] Prüfen, ob Anhänge über 20 MB überhaupt übernommen werden müssen',
        `- [x] Testexport von 500 Datensätzen gezogen @done:${day(-41)}`,
      ],
      notes: [
        {
          day: -40,
          text: `Letzter Stand vor der Pause: 62 von 94 Feldern zugeordnet. Die restlichen sind
Freitextfelder, die niemand mehr benennen kann.`,
        },
      ],
      extraNotes: [
        {
          path: 'notes/feldzuordnung.md',
          title: 'Feldzuordnung Kontakthistorie',
          created: -60,
          updated: -40,
          touch: [-40, '11:02'],
          body: `Zuordnung der Altfelder auf das neue Kontaktmodell. Zeilen ohne Ziel sind noch offen.

| Altfeld          | Neues Feld          | Bemerkung                        |
| ---------------- | ------------------- | -------------------------------- |
| KONT_NAME1       | contact.lastName    |                                  |
| KONT_NAME2       | contact.firstName   |                                  |
| KONT_BEM         | contact.note        | Freitext, teils mit Telefonnummer|
| KONT_HIST_TXT    | —                   | offen: Rechtsabteilung           |
| KONT_ANH_PFAD    | —                   | offen: Anhänge über 20 MB        |`,
        },
      ],
    },
    {
      slug: 'angebot-praxisnetz',
      title: 'Angebot Praxisnetz Süd',
      scope: 'work',
      status: 'active',
      priority: 2,
      started: day(-9),
      deadline: day(12),
      tags: ['angebot', 'vertrieb'],
      modules: [],
      repos: [],
      created: day(-9),
      updated: day(-3),
      touch: [-3, '17:45'],
      stand: `Der Entwurf steht: Terminbuchung, Erinnerungen per Mail, ein kleines Dashboard für
die Praxisleitung. Was fehlt, sind die Zahlen — Kerstin sitzt auf den Lizenzkosten
des Terminmoduls, ohne die kein Preis herauskommt.

Kein nächster Schritt eingetragen. Genau das ist hier das Problem: das Angebot
liegt seit drei Tagen still, weil unklar ist, wer als nächstes zieht.`,
      todos: [
        `- [ ] Preisgerüst mit zwei Varianten rechnen @due:${day(2)} !`,
        `- [ ] Lizenzkosten Terminmodul erfragen @wait:Kerstin @needed:${day(5)}`,
      ],
      notes: [],
    },
    {
      slug: 'rechnungsautomatisierung',
      title: 'Rechnungsautomatisierung',
      scope: 'work',
      status: 'active',
      priority: 2,
      started: day(-70),
      deadline: day(10),
      next_step: 'Abschlussdokumentation schreiben und an Miriam übergeben',
      tags: ['automatisierung', 'buchhaltung'],
      modules: [],
      repos: ['C:/development/demo/rechnungslauf'],
      created: day(-70),
      updated: day(-1),
      touch: [-1, '13:30'],
      stand: `Läuft seit zwei Wochen im Echtbetrieb: Belege werden erkannt, zugeordnet und als
Buchungsvorschlag in die Buchhaltung geschoben. 214 Belege, drei Fehlgriffe, alle
drei bei handschriftlichen Quittungen.

Fehlt nur noch die Dokumentation, dann ist das Projekt fertig.`,
      todos: [
        `- [ ] Abschlussdokumentation schreiben @due:${day(8)}`,
        `- [x] Fehlerbehandlung für unlesbare Belege @done:${day(-8)}`,
        `- [x] Buchungsvorschläge an die Buchhaltung übergeben @done:${day(-15)}`,
        `- [x] Belegerkennung auf 200 Testbelegen geprüft @done:${day(-22)}`,
      ],
      notes: [
        {
          day: -1,
          text: `214 Belege, drei Fehlgriffe. Die drei waren handschriftliche Quittungen — die
bleiben manuell, das ist billiger als jede weitere Erkennungsschleife.`,
        },
      ],
    },
  ];
}
