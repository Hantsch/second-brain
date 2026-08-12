/* Fünf Dumps in der Inbox: unterschiedlich alt, unterschiedlich in der Art.
   Eine Idee, ein Arbeitsstand, ein Link, ein Gefühlsdump, eine Einkaufsnotiz.

   Der 19 Tage alte Dump ist Absicht: er soll im Pflege-Screen als
   liegengebliebener Dump auftauchen. Der Gefühlsdump steht auf `kept` — er
   bleibt bewusst liegen und ist kein Befund. */

import { isoDay, isoStamp } from './lib.mjs';

function stampName(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${isoDay(date)}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function seedInbox(seeder, clock) {
  const dumps = [
    {
      when: clock.hoursAgo(3),
      slug: 'idee-wochenrueckblick-automatisch',
      title: 'Idee: Wochenrückblick automatisch aus dem Worklog',
      origin: 'quick-capture',
      status: 'raw',
      scope: null,
      tags: [],
      text: `Freitags kostet der Wochenrückblick eine halbe Stunde, obwohl alles schon
irgendwo steht: Tageseinträge, geänderte Dateien, Sitzungen im Editor.

Idee: die App baut aus diesen drei Spuren einen Entwurf, ich streiche und ergänze.
Wichtig wäre, dass die Rohfassung Belege nennt — welche Datei, welcher Tag —,
sonst schreibe ich sie sowieso neu.`,
    },
    {
      when: clock.date(-2, '17:48'),
      slug: 'kundenportal-ladezeiten-vermutung',
      title: 'Kundenportal: Vermutung zu den Ladezeiten',
      origin: 'window',
      status: 'raw',
      scope: 'work',
      tags: ['kundenportal'],
      text: `Vermutung zur langsamen Angebotsliste: wir laden für jede Zeile die
Berechtigungen einzeln nach. Bei 400 Angeboten sind das 400 Abfragen.

Nachprüfen: einmal mit gefülltem Cache, einmal ohne. Wenn es das ist, reicht ein
Sammelaufruf, und wir sind unter einer Sekunde.`,
    },
    {
      when: clock.date(-6, '12:20'),
      slug: 'link-vertragsvorlagen-freelancer',
      title: 'Link: Vertragsvorlagen für Freelancer',
      origin: 'clipboard',
      status: 'proposed',
      scope: 'work',
      tags: ['vertrag'],
      text: `https://example.org/vertragsvorlagen-freelancer

Für die Praxisnetz-Anfrage anschauen. Angeblich mit Klauseln zur Abnahme, das ist
genau der Teil, an dem es beim letzten Angebot gehakt hat.`,
    },
    {
      when: clock.date(-11, '23:10'),
      slug: 'zu-viele-baustellen',
      title: 'Zu viele Baustellen gleichzeitig',
      origin: 'quick-capture',
      status: 'kept',
      scope: 'private',
      tags: ['gefuehl'],
      text: `Ich habe das Gefühl, an allem gleichzeitig zu ziehen und nichts zu bewegen.
Kundenportal, SSO, Angebot, dazu die Belege. Nichts davon ist dramatisch, aber
zusammen ist es zu viel für einen Kopf.

Kein Aktionspunkt. Das soll einfach hier liegen, damit ich nächste Woche sehe,
dass es diese Woche schon so war.`,
    },
    {
      when: clock.date(-19, '18:55'),
      slug: 'einkauf-hochbeet',
      title: 'Einkauf fürs Hochbeet',
      origin: 'quick-capture',
      status: 'raw',
      scope: 'private',
      tags: ['garten'],
      text: `Noppenfolie 5 m, Edelstahlschrauben 4×50 (eine Packung reicht nicht), zwei Säcke
Blumenerde, ein Sack Kompost. Winkel für die Ecken hat Nico noch.`,
    },
  ];

  for (const dump of dumps) {
    seeder.doc(
      `inbox/${stampName(dump.when)}-${dump.slug}.md`,
      {
        type: 'dump',
        title: dump.title,
        created: isoStamp(dump.when),
        origin: dump.origin,
        status: dump.status,
        tags: dump.tags,
        scope: dump.scope,
        lang: 'de',
      },
      dump.text,
      dump.when,
    );
    seeder.bump('dumps');
  }
}
