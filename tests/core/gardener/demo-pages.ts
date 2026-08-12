/* Die Wiki-Seiten des Demo-Bestands: das kranke Modul „identity-management" mit
   seinen absichtlichen Mängeln und das gesunde „second-brain-methodik", an dem
   sich falsche Positive zeigen würden.

   Welcher Mangel wo steckt, steht in `demo-vault.ts`. */

import { day } from '../../helpers/time';
import { BLOG_SOURCE, DEMO, HEALTHY, MODULE, OAUTH_SOURCE, VIDEO_SOURCE, page } from './demo-paths';

/* ── Modul „identity-management": das kranke ───────────────────────────────── */

export const identityPages: Record<string, string> = {
  [DEMO.oauthSource]: page({
    type: 'source',
    slug: OAUTH_SOURCE,
    title: 'OAuth 2.1 Grundlagen (Spezifikationsauszug)',
    module: MODULE,
    created: -215,
    reviewed: -60,
    tags: ['auth', 'oauth'],
    body: `Auszug aus dem Spezifikationsentwurf, gelesen für das erste Orbit-Projekt.

## Was drinsteht

- Der Authorization-Code-Flow mit PKCE ist der Normalfall.
- Der implizite Flow ist gestrichen worden.`,
  }),

  [DEMO.blogSource]: page({
    type: 'source',
    slug: BLOG_SOURCE,
    title: 'Blogartikel: Kurze Token, weniger Ärger',
    module: MODULE,
    created: -6,
    reviewed: -6,
    tags: ['token'],
    body: `Praxisbericht eines Teams, das von zwölf Stunden auf fünfzehn Minuten umgestellt hat.

## Wörtliche Stellen

> Revocation is a lie if your access token lives twelve hours.`,
  }),

  [DEMO.oauth]: page({
    type: 'entity',
    slug: 'oauth2',
    title: 'OAuth 2.1',
    module: MODULE,
    created: -215,
    reviewed: -60,
    tags: ['auth', 'oauth'],
    sources: [OAUTH_SOURCE],
    body: `Autorisierungsprotokoll. Für uns zählen zwei Festlegungen: PKCE ist Pflicht, und der
implizite Flow ist gestrichen (source: [[${OAUTH_SOURCE}]]).

Wie lange die ausgestellten Tokens leben, steht in [[token-lebensdauer]].

Für Geräte ohne Browser wäre [[device-code-flow]] der passende Weg — diese Seite gibt es
absichtlich nicht, sie ist der kaputte Wikilink dieses Bestands.`,
  }),

  /* Verwaist: niemand verlinkt hierher. Im Katalog steht die Seite trotzdem —
     der Katalog zählt nicht als Verweis. */
  [DEMO.scim]: page({
    type: 'entity',
    slug: 'scim',
    title: 'SCIM 2.0',
    module: MODULE,
    created: -118,
    reviewed: -60,
    tags: ['provisionierung'],
    body: `Protokoll für den Abgleich von Nutzerkonten zwischen getrennten Verzeichnissen.
Der Kundendienst bietet es an, benutzt wird es bisher nicht.

Kandidat für später: statt Konten beim ersten Anmelden anzulegen, könnte ein nächtlicher
Abgleich laufen.`,
  }),

  [DEMO.token]: page({
    type: 'concept',
    slug: 'token-lebensdauer',
    title: 'Token-Lebensdauer',
    module: MODULE,
    created: -24,
    reviewed: -6,
    tags: ['token'],
    sources: [BLOG_SOURCE],
    extra: { supersedes: ['altes-token-konzept'], contradicts: ['altes-token-konzept'] },
    body: `Aktueller Stand: Access-Token fünfzehn Minuten, Refresh-Token acht Stunden mit Rotation
bei jeder Nutzung (source: [[${BLOG_SOURCE}]]). Ausgestellt werden sie über [[oauth2]].

## Widersprüche

- [[altes-token-konzept]] nennt zwölf Stunden. Beide Fassungen bleiben stehen; die ältere
  ist als \`superseded\` markiert.`,
  }),

  [DEMO.oldToken]: page({
    type: 'concept',
    slug: 'altes-token-konzept',
    title: 'Altes Token-Konzept (Erstprojekt)',
    module: MODULE,
    created: -214,
    reviewed: -6,
    tags: ['token', 'ueberholt'],
    extra: { superseded: true, contradicts: ['token-lebensdauer'] },
    body: `Stand aus dem Erstprojekt, hier absichtlich erhalten: zwölf Stunden Gültigkeit, keine
Rotation. Begründet war das mit einer wackligen Netzanbindung in zwei Filialen.

## Widersprüche

- [[token-lebensdauer]] setzt eine viel kürzere Frist an und ist der neuere Stand. Diese
  Seite bleibt als Begründung stehen, warum es einmal anders war.`,
  }),

  /* Vor 200 Tagen zuletzt geprüft — angestaubt. */
  [DEMO.tenants]: page({
    type: 'concept',
    slug: 'mandantentrennung',
    title: 'Mandantentrennung',
    module: MODULE,
    created: -214,
    reviewed: -200,
    tags: ['mandanten'],
    body: `Ein Mandant ist eine eigene Realm-Instanz. Gruppen gelten nur innerhalb einer Realm, es
gibt keine Vererbung über Mandantengrenzen hinweg.

Folge für die Migration: gemeinsame Gruppen müssen in jedem Mandanten angelegt werden.`,
  }),

  /* Fehlt im Katalog. Nennt „SCIM" im Fließtext, ohne die Seite zu verlinken —
     damit gibt es für den verwaisten Verweis genau eine bestimmbare Stelle. */
  [DEMO.jit]: page({
    type: 'concept',
    slug: 'just-in-time-provisionierung',
    title: 'Just-in-time-Provisionierung',
    module: MODULE,
    created: -24,
    reviewed: -24,
    tags: ['provisionierung'],
    body: `Nutzerkonten entstehen beim ersten Anmelden aus den Angaben im Anmeldetoken, statt
vorher angelegt zu werden.

Vorteil: kein Abgleichlauf, keine Konten für Menschen, die nie kommen. Die Gegenrichtung
wäre ein nächtlicher Abgleich über SCIM — dazu ist hier nichts belegt.`,
  }),

  [DEMO.overview]: page({
    type: 'overview',
    slug: 'overview',
    title: 'Identitätsmanagement — Synthese',
    module: MODULE,
    created: -118,
    reviewed: -6,
    tags: ['auth'],
    body: `## Was entschieden ist

- Technisch setzt alles auf [[oauth2]] auf.
- Tokens leben kurz, siehe [[token-lebensdauer]].
- Konten entstehen beim ersten Anmelden: [[just-in-time-provisionierung]].

## Was offen ist

- [[mandantentrennung]] beschreibt einen Stand vor der jetzigen Version.`,
  }),
};

export const identityCatalog = `# Katalog — Identitätsmanagement

## Quellen

- [[${OAUTH_SOURCE}]] — Grant-Typen und PKCE-Pflicht
- [[${BLOG_SOURCE}]] — Praxisbericht zu kurzen Tokens

## Entitäten

- [[oauth2]] — Das Protokoll, auf dem alles aufsetzt
- [[scim]] — Schnittstelle für den Nutzerabgleich, bisher unbenutzt

## Begriffe

- [[token-lebensdauer]] — Aktueller Stand der Gültigkeitsdauern
- [[altes-token-konzept]] — Überholt, bleibt als Begründung stehen
- [[mandantentrennung]] — Ein Mandant, eine Realm

## Synthese

- [[overview]] — Was entschieden ist und was offen ist
`;

export const identityLog = `# Chronik

## [${day(-24)}] ingest | Workshop Rollenkonzept

- touched: [[just-in-time-provisionierung]]
- notes: index.md nicht nachgezogen

## [${day(-6)}] ingest | Blogartikel zu Token-Lebensdauern

- summary: wiki/sources/${BLOG_SOURCE}.md
- touched: [[token-lebensdauer]], [[altes-token-konzept]], index.md
- notes: Widerspruch benannt statt plattgebügelt
`;

/* ── Modul „second-brain-methodik": das gesunde ────────────────────────────── */

export const healthyPages: Record<string, string> = {
  /* Nur im Frontmatter belegt, kein Verweis im Text — und trotzdem nicht verwaist. */
  [DEMO.videoSource]: page({
    type: 'source',
    slug: VIDEO_SOURCE,
    title: 'Video: Your AI second brain is slowly rotting',
    module: HEALTHY,
    created: -9,
    reviewed: -9,
    tags: ['pflege'],
    body: `Vortrag über Sammlungen, die wachsen und niemandem mehr nützen.

## Wörtliche Stellen

> If you cannot cite it, you do not know it.`,
  }),

  [DEMO.decay]: page({
    type: 'concept',
    slug: 'wissensverfall',
    title: 'Wissensverfall',
    module: HEALTHY,
    created: -9,
    reviewed: -9,
    tags: ['pflege'],
    sources: [VIDEO_SOURCE],
    body: `Eine Sammlung verfällt in drei Formen: verwaiste Seiten, überholte Aussagen, doppelte
Einträge zum selben Begriff. Der Ursprung dieser Ordnung ist der [[zettelkasten]].

Ein Wikilink in einem Code-Zaun ist ein Beispiel und zählt nicht als Verweis:

\`\`\`markdown
Siehe [[nicht-existente-seite]] — nur Anschauung, kein Ziel.
\`\`\`

Deshalb prüft der Pflegelauf Zeilen ausserhalb der Zäune.`,
  }),

  [`modules/${HEALTHY}/wiki/entities/zettelkasten.md`]: page({
    type: 'entity',
    slug: 'zettelkasten',
    title: 'Zettelkasten',
    module: HEALTHY,
    created: -45,
    reviewed: -9,
    tags: ['methodik'],
    body: `Verlinkte Zettel ohne Ordnerhierarchie. Jeder Zettel trägt einen Gedanken und verweist
auf verwandte.`,
  }),

  [`modules/${HEALTHY}/wiki/overview.md`]: page({
    type: 'overview',
    slug: 'overview',
    title: 'Second-Brain-Methodik — Synthese',
    module: HEALTHY,
    created: -45,
    reviewed: -9,
    tags: ['methodik'],
    body: `## Der rote Faden

- Sammlungen verfallen, wenn Aufnehmen billiger ist als Pflegen: [[wissensverfall]].
- Verlinkung schlägt Hierarchie, siehe [[zettelkasten]].`,
  }),
};

export const healthyCatalog = `# Katalog — Second-Brain-Methodik

## Quellen

- [[${VIDEO_SOURCE}]] — Vortrag über verrottende Sammlungen

## Entitäten

- [[zettelkasten]] — Verlinkte Zettel statt Ordner

## Begriffe

- [[wissensverfall]] — Drei Verfallsformen einer Sammlung

## Synthese

- [[overview]] — Der rote Faden des Moduls
`;
