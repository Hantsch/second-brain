/* Wissens-Modul „identity-management" — das ältere der beiden Module, aus einem
   früheren Kundenprojekt gewachsen und deshalb mit Altlasten.

   Absichtliche Befunde für den Pflege-Screen:
   - [[scim]] ist verwaist: keine andere Seite verlinkt darauf.
   - [[just-in-time-provisionierung]] fehlt im Katalog (`unlisted`).
   - [[oauth2]] verlinkt auf [[device-code-flow]] — die Seite gibt es nicht.
   - [[token-lebensdauer]] und [[altes-token-konzept]] widersprechen sich benannt.
   - [[mandantentrennung]] wurde vor 200 Tagen zuletzt geprüft.

   Firmen und Personen sind erfunden. */

import { identityPages } from './module-identity-pages.mjs';

export function identityModule(clock) {
  const day = clock.day;
  const oauthSource = `s-${day(-215)}-oauth2-grundlagen`;
  const whitepaper = `s-${day(-118)}-orbit-sso-whitepaper`;
  const workshop = `s-${day(-24)}-rollenkonzept-workshop`;
  const blog = `s-${day(-6)}-token-lifetimes-blog`;

  return {
    slug: 'identity-management',
    title: 'Identitätsmanagement',
    description: 'Anmeldung, Rollen und Mandanten bei Orbit Identity — Belege aus Kundenprojekten',
    created: -240,
    updated: -6,
    tags: ['auth', 'wissen'],
    overviewSummary: 'Was für die SSO-Migration entschieden ist und was noch offen',
    body: `Alles, was ich über Anmeldung, Rollen und Mandantentrennung bei Orbit Identity
belegen kann. Gewachsen im ersten Orbit-Projekt vor gut sieben Monaten, wieder
aufgeschlagen für die SSO-Migration.

Zwei Fragen treiben das Modul: wie lange Tokens leben und wie streng Mandanten
getrennt sind. Zu beiden gibt es einen älteren und einen neueren Stand — beide
stehen hier, der ältere ist als überholt markiert.`,
    log: [
      {
        day: -215,
        kind: 'ingest',
        title: 'OAuth 2.1 Grundlagen',
        summary: `wiki/sources/${oauthSource}.md`,
        touched: ['[[oauth2]]', '[[openid-connect]]', '[[keycloak]]', 'index.md'],
      },
      {
        day: -214,
        kind: 'ingest',
        title: 'Mandantenmodell aus dem Erstprojekt',
        touched: ['[[mandantentrennung]]', '[[altes-token-konzept]]', 'index.md'],
      },
      {
        day: -118,
        kind: 'ingest',
        title: 'Orbit-SSO-Whitepaper',
        summary: `wiki/sources/${whitepaper}.md`,
        touched: ['[[single-sign-on]]', '[[orbit-identity]]', '[[mandantentrennung]]', 'index.md'],
        notes: 'widerspricht [[altes-token-konzept]] bei der Token-Lebensdauer',
      },
      {
        day: -24,
        kind: 'ingest',
        title: 'Workshop Rollenkonzept',
        summary: `wiki/sources/${workshop}.md`,
        touched: [
          '[[rollenbasierte-zugriffskontrolle]]',
          '[[tobias-renner]]',
          '[[just-in-time-provisionierung]]',
        ],
        notes: 'index.md nicht nachgezogen — [[just-in-time-provisionierung]] fehlt im Katalog',
      },
      {
        day: -6,
        kind: 'ingest',
        title: 'Blogartikel zu Token-Lebensdauern',
        summary: `wiki/sources/${blog}.md`,
        touched: ['[[token-lebensdauer]]', '[[altes-token-konzept]]', 'index.md'],
        notes: 'Widerspruch benannt statt plattgebügelt: 15 Minuten gegen 12 Stunden',
      },
    ],
    pages: [
      // ── Quellen ──────────────────────────────────────────────────────────
      {
        type: 'source',
        slug: oauthSource,
        title: 'OAuth 2.1 Grundlagen (Spezifikationsauszug)',
        summary: 'Grant-Typen, PKCE-Pflicht, was aus OAuth 2.0 herausgefallen ist',
        tags: ['auth', 'oauth'],
        created: -215,
        updated: -215,
        reviewed: -60,
        extra: { origin: 'https://example.org/specs/oauth-2-1-draft' },
        body: `Auszug aus dem Spezifikationsentwurf, gelesen für das erste Orbit-Projekt.

## Was drinsteht

- Der Authorization-Code-Flow mit PKCE ist der Normalfall; der implizite Flow ist
  gestrichen.
- Passwort-Grant („Resource Owner Password Credentials") ist ebenfalls gestrichen.
- Refresh-Tokens für öffentliche Clients müssen rotieren oder an den Client
  gebunden sein.

## Wörtliche Stellen

> Public clients MUST use PKCE with the authorization code flow.

> The implicit grant is omitted from this specification.`,
      },
      {
        type: 'source',
        slug: whitepaper,
        title: 'Orbit Identity: SSO-Whitepaper 4.2',
        summary: 'Herstellersicht auf Mandanten, Gruppen und Token-Lebensdauern',
        tags: ['auth', 'orbit'],
        created: -118,
        updated: -118,
        reviewed: -30,
        extra: { origin: 'https://example.com/orbit-identity/whitepaper-sso-4-2.pdf' },
        body: `Herstellerdokument, Stand 4.2. Nützlich für die Mandantenfragen, beim Thema
Ausfallsicherheit erwartbar werbend.

## Was drinsteht

- Ein Mandant ist eine eigene Realm-Instanz; Gruppen werden nicht über
  Mandantengrenzen hinweg vererbt.
- Empfohlene Lebensdauern: Access-Token 15 Minuten, Refresh-Token 8 Stunden.
- Nutzer können in mehreren Mandanten existieren, aber nur mit getrennten
  Identitäten.

## Wörtliche Stellen

> Groups are scoped to a realm. Cross-realm inheritance is not supported.

> Recommended access token lifetime is 15 minutes.`,
      },
      {
        type: 'source',
        slug: workshop,
        title: 'Workshop Rollenkonzept (Mitschrift)',
        summary: 'Mitschrift des Rollenworkshops mit Tobias — Ergebnisse und offene Punkte',
        tags: ['auth', 'workshop'],
        created: -24,
        updated: -24,
        reviewed: -24,
        extra: { origin: `raw/files/${day(-24)}-rollenkonzept-workshop` },
        body: `Zwei Stunden mit Tobias und zwei Kolleginnen aus der Fachabteilung. Mitschrift
liegt unter \`raw/files/${day(-24)}-rollenkonzept-workshop\`.

## Ergebnisse

- Drei Rollen reichen: Lesen, Bearbeiten, Verwalten. Alles Weitere wird über
  Gruppen gelöst, nicht über neue Rollen.
- Neue Mitarbeitende sollen beim ersten Anmelden automatisch angelegt werden.
- Offen geblieben: erben Unterorganisationen die Rollen der Elternorganisation?

## Wörtliche Stellen

> Wenn wir für jede Abteilung eine Rolle bauen, pflegt das in einem Jahr niemand mehr.
> — Tobias, Kunden-Architekt`,
      },
      {
        type: 'source',
        slug: blog,
        title: 'Blogartikel: Kurze Token, weniger Ärger',
        summary: 'Praxisbericht zu 15-Minuten-Tokens und rotierenden Refresh-Tokens',
        tags: ['auth', 'token'],
        created: -6,
        updated: -6,
        reviewed: -6,
        extra: { origin: 'https://example.net/blog/kurze-token-weniger-aerger' },
        body: `Praxisbericht eines Teams, das von 12 Stunden auf 15 Minuten umgestellt hat.
Deckt sich mit dem Whitepaper und widerspricht unserem Stand aus dem Erstprojekt.

## Was drinsteht

- Access-Token 15 Minuten, Refresh-Token 8 Stunden, Rotation bei jeder Nutzung.
- Der befürchtete Anstieg der Anfragen blieb aus: plus 4 % auf den Token-Endpunkt.
- Lange Access-Tokens sind der teuerste Fehler beim Widerrufen von Rechten.

## Wörtliche Stellen

> Revocation is a lie if your access token lives twelve hours.`,
      },

      ...identityPages({ oauthSource, whitepaper, workshop, blog }),
    ],
  };
}
