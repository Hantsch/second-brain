/* Die verdichteten Seiten des Moduls „identity-management": Entitäten,
   Begriffe und die Synthese. Die Quellseiten stehen in module-identity.mjs —
   dort steht auch, welche Befunde hier absichtlich eingebaut sind.

   Die Slugs der Quellseiten kommen herein, damit jede Aussage ihren Beleg
   als Wikilink tragen kann. */

export function identityPages({ oauthSource, whitepaper, workshop, blog }) {
  return [
    // ── Entitäten ────────────────────────────────────────────────────────
    {
      type: 'entity',
      slug: 'orbit-identity',
      title: 'Orbit Identity',
      summary: 'Der eingesetzte Identitätsdienst, Version 4.2',
      tags: ['orbit', 'auth'],
      sources: [whitepaper],
      created: -118,
      updated: -24,
      reviewed: -24,
      body: `Identitätsdienst des Kunden, Version 4.2, betrieben in zwei Rechenzentren.
Anmeldung, Gruppen und Mandanten laufen darüber (source: [[${whitepaper}]]).

Ein Mandant entspricht einer Realm-Instanz; Gruppen gelten nur innerhalb einer
Realm (source: [[${whitepaper}]]). Was das für uns bedeutet, steht in
[[mandantentrennung]].

Technisch spricht Orbit Identity dieselben Protokolle wie [[keycloak]], deshalb
sind die Terraform-Module aus dem Erstprojekt wiederverwendbar.

Bezug: [[single-sign-on]]`,
    },
    {
      type: 'entity',
      slug: 'keycloak',
      title: 'Keycloak',
      summary: 'Referenzimplementierung, an der wir Verhalten nachprüfen',
      tags: ['auth', 'werkzeug'],
      sources: [oauthSource],
      created: -215,
      updated: -100,
      reviewed: -100,
      body: `Offener Identitätsdienst, den wir lokal laufen lassen, um Verhalten
nachzuprüfen, das im Whitepaper offenbleibt.

Unterstützt [[oauth2]] und [[openid-connect]] in denselben Ausbaustufen wie der
Kundendienst (source: [[${oauthSource}]]). Für Rollen- und Gruppenfragen ist es
der billigste Prüfstand, siehe [[rollenbasierte-zugriffskontrolle]].`,
    },
    {
      type: 'entity',
      slug: 'oauth2',
      title: 'OAuth 2.1',
      summary: 'Das Protokoll, auf dem alles aufsetzt',
      tags: ['auth', 'oauth'],
      sources: [oauthSource],
      created: -215,
      updated: -60,
      reviewed: -60,
      body: `Autorisierungsprotokoll. Für uns zählen zwei Festlegungen: PKCE ist Pflicht,
und der implizite Flow ist gestrichen (source: [[${oauthSource}]]).

Identitätsangaben kommen nicht aus OAuth selbst, sondern aus
[[openid-connect]]. Wie lange die ausgestellten Tokens leben, steht in
[[token-lebensdauer]].

Für Geräte ohne Browser wäre [[device-code-flow]] der passende Weg — dazu liegt
hier noch nichts.`,
    },
    {
      type: 'entity',
      slug: 'openid-connect',
      title: 'OpenID Connect',
      summary: 'Identitätsschicht über OAuth — liefert das ID-Token',
      tags: ['auth', 'oidc'],
      sources: [oauthSource],
      created: -215,
      updated: -100,
      reviewed: -100,
      body: `Identitätsschicht über [[oauth2]]. Liefert das ID-Token, aus dem die Anwendung
Name, Mandant und Gruppen liest (source: [[${oauthSource}]]).

Wichtig für uns: das ID-Token ist kein Zugriffstoken. Wer damit Rechte prüft,
prüft am falschen Papier.`,
    },
    {
      type: 'entity',
      slug: 'scim',
      title: 'SCIM 2.0',
      summary: 'Schnittstelle für Nutzerabgleich — bisher nirgends verlinkt',
      tags: ['auth', 'provisionierung'],
      sources: [whitepaper],
      created: -118,
      updated: -118,
      reviewed: -60,
      body: `Protokoll für den Abgleich von Nutzerkonten zwischen Systemen. Orbit Identity
bietet es an, wir benutzen es bisher nicht (source: [[${whitepaper}]]).

Kandidat für später: statt Nutzer beim ersten Anmelden anzulegen, könnte der
Abgleich nachts laufen. Verglichen wird das in [[just-in-time-provisionierung]].`,
    },
    {
      type: 'entity',
      slug: 'tobias-renner',
      title: 'Tobias Renner',
      summary: 'Kunden-Architekt, entscheidet über das Rollenkonzept',
      tags: ['person'],
      sources: [workshop],
      created: -24,
      updated: -24,
      reviewed: -24,
      body: `Architekt auf Kundenseite, seit dem Erstprojekt derselbe Ansprechpartner.
Entscheidet über Rollenschnitt und Gruppenpflege (source: [[${workshop}]]).

Argumentiert konsequent über Pflegeaufwand statt über Feinheit der Rechte
(source: [[${workshop}]]). Praktische Folge: Vorschläge mit wenigen Rollen und
klaren Gruppen kommen durch, feingliedrige nicht.

Bezug: [[rollenbasierte-zugriffskontrolle]]`,
    },

    // ── Begriffe ─────────────────────────────────────────────────────────
    {
      type: 'concept',
      slug: 'single-sign-on',
      title: 'Single Sign-on',
      summary: 'Einmal anmelden, überall angemeldet sein — und was daran hängt',
      tags: ['auth', 'sso'],
      sources: [whitepaper],
      created: -118,
      updated: -30,
      reviewed: -30,
      body: `Einmal anmelden, in allen angebundenen Anwendungen angemeldet sein. Die Sitzung
lebt beim Identitätsdienst, nicht in der Anwendung (source: [[${whitepaper}]]).

Getragen wird das von [[oauth2]] für die Autorisierung und
[[openid-connect]] für die Identität. Neue Nutzer entstehen dabei über
[[just-in-time-provisionierung]].

Der Preis: fällt der Identitätsdienst aus, kommt niemand mehr herein. Deshalb
zwei Rechenzentren (source: [[${whitepaper}]]).`,
    },
    {
      type: 'concept',
      slug: 'rollenbasierte-zugriffskontrolle',
      title: 'Rollenbasierte Zugriffskontrolle',
      summary: 'Drei Rollen, der Rest über Gruppen',
      tags: ['auth', 'rbac'],
      sources: [workshop],
      created: -214,
      updated: -24,
      reviewed: -24,
      body: `Rechte hängen an Rollen, Rollen an Gruppen, Gruppen an Personen. Für dieses
Projekt sind drei Rollen festgelegt: Lesen, Bearbeiten, Verwalten
(source: [[${workshop}]]).

Alles Feinere wird über Gruppen gelöst, nicht über neue Rollen — die Begründung
ist Pflegeaufwand, nicht Sicherheit (source: [[${workshop}]]). Entschieden hat
das [[tobias-renner]].

Nachgeprüft wird das Verhalten an [[keycloak]]; die Mandantengrenzen stehen in
[[mandantentrennung]].`,
    },
    {
      type: 'concept',
      slug: 'token-lebensdauer',
      title: 'Token-Lebensdauer',
      summary: 'Aktueller Stand: 15 Minuten Access, 8 Stunden Refresh mit Rotation',
      tags: ['auth', 'token'],
      sources: [blog, whitepaper],
      created: -24,
      updated: -6,
      reviewed: -6,
      extra: { supersedes: ['altes-token-konzept'], contradicts: ['altes-token-konzept'] },
      body: `Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation
bei jeder Nutzung (source: [[${whitepaper}]], [[${blog}]]).

Der befürchtete Anstieg der Anfragen auf den Token-Endpunkt lag in der Praxis bei
4 % (source: [[${blog}]]). Ausgestellt werden die Tokens über [[oauth2]].

## Widersprüche

- [[altes-token-konzept]] nennt 12 Stunden für Access-Tokens. Beide Fassungen
  bleiben stehen; die ältere ist als \`superseded\` markiert, weil sie aus dem
  Erstprojekt stammt und nie an 4.2 angepasst wurde.`,
    },
    {
      type: 'concept',
      slug: 'altes-token-konzept',
      title: 'Altes Token-Konzept (Erstprojekt)',
      summary: 'Überholt: 12 Stunden Access-Token, kein Rotationszwang',
      tags: ['auth', 'token', 'ueberholt'],
      sources: [workshop],
      created: -214,
      updated: -6,
      reviewed: -6,
      extra: { superseded: true, contradicts: ['token-lebensdauer'] },
      body: `Stand aus dem Erstprojekt, hier absichtlich erhalten: Access-Token 12 Stunden,
Refresh-Token 30 Tage, keine Rotation. Begründet war das mit einer instabilen
Netzanbindung in zwei Filialen (source: [[${workshop}]]).

## Widersprüche

- [[token-lebensdauer]] setzt 15 Minuten an und ist der neuere Stand. Diese Seite
  bleibt als Begründung stehen, warum es einmal anders war — sie ist
  \`superseded\`, nicht falsch.`,
    },
    {
      type: 'concept',
      slug: 'mandantentrennung',
      title: 'Mandantentrennung',
      summary: 'Ein Mandant, eine Realm — keine Vererbung über Grenzen',
      tags: ['auth', 'mandanten'],
      sources: [whitepaper],
      created: -214,
      updated: -200,
      reviewed: -200,
      body: `Ein Mandant ist eine eigene Realm-Instanz. Gruppen gelten nur innerhalb einer
Realm, es gibt keine Vererbung über Mandantengrenzen (source: [[${whitepaper}]]).

Folge für die Migration: gemeinsame Gruppen müssen in jedem Mandanten angelegt
werden, oder sie gehören nicht in Gruppen, sondern in [[orbit-identity]] selbst.

Diese Seite ist seit dem Erstprojekt nicht mehr geprüft worden — der Stand ist
älter als Version 4.2 des Dienstes.`,
    },
    {
      type: 'concept',
      slug: 'just-in-time-provisionierung',
      title: 'Just-in-time-Provisionierung',
      summary: 'Nutzer entstehen beim ersten Anmelden',
      tags: ['auth', 'provisionierung'],
      sources: [workshop],
      created: -24,
      updated: -24,
      reviewed: -24,
      unlisted: true,
      body: `Nutzerkonten entstehen beim ersten Anmelden aus den Angaben im ID-Token, statt
vorher angelegt zu werden (source: [[${workshop}]]).

Vorteil: kein Abgleichlauf, keine Konten für Menschen, die nie kommen. Nachteil:
Rechte stehen erst nach der ersten Anmeldung fest, und wer austritt, bleibt als
Konto liegen, bis jemand aufräumt.

Die Gegenrichtung wäre ein nächtlicher Abgleich über SCIM — dazu ist hier nichts
belegt, und der Katalog kennt diese Seite noch nicht.

Bezug: [[orbit-identity]]`,
    },
    {
      type: 'overview',
      slug: 'overview',
      title: 'Identitätsmanagement — Synthese',
      summary: 'Was entschieden ist, was offen ist',
      tags: ['auth'],
      sources: [whitepaper, workshop, blog],
      created: -118,
      updated: -6,
      reviewed: -6,
      body: `## Was entschieden ist

- Anmeldung läuft über [[single-sign-on]] beim Dienst [[orbit-identity]], technisch
  auf [[oauth2]] und [[openid-connect]] (source: [[${whitepaper}]]).
- Drei Rollen, der Rest über Gruppen — festgelegt im Workshop mit
  [[tobias-renner]] (source: [[${workshop}]]).
- Tokens leben kurz: 15 Minuten Access, 8 Stunden Refresh, siehe
  [[token-lebensdauer]] (source: [[${blog}]]).
- Nutzer entstehen beim ersten Anmelden, siehe
  [[just-in-time-provisionierung]] (source: [[${workshop}]]).

## Was offen ist

- Erben Unterorganisationen die Rollen der Elternorganisation? Die Frage liegt
  seit dem Workshop bei [[tobias-renner]] und blockiert die Migration.
- [[mandantentrennung]] beschreibt einen Stand vor Version 4.2 und müsste am
  Testmandanten nachgeprüft werden.
- Was aus [[keycloak]] als Prüfstand wirklich übertragbar ist, ist nie
  systematisch geprüft worden.`,
    },
  ];
}
