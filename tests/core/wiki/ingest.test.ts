/* Der Ingest — der teuerste Weg der App und der, an dem am meisten haengt.
 *
 * Vier Zusagen werden hier geprueft:
 * 1. Eine Quelle wird einmal verdichtet und beruehrt danach mehrere Seiten:
 *    anlegen, ergaenzen, Widerspruch benennen.
 * 2. Bestehender Text wird nie angetastet — auch nicht der absichtliche kaputte
 *    Wikilink des Fixture-Vaults.
 * 3. Eine erfundene Seite oder ein erfundenes Modul faellt weg.
 * 4. **Ohne Modell geht nichts verloren:** die Quelle steht trotzdem im Katalog und
 *    in der Chronik, sichtbar als „noch nicht verdichtet".
 * 5. **Ganz oder gar nicht:** ein Fehlschlag mitten im Schreiben laesst keine Seite,
 *    keinen Katalogeintrag und keinen Protokollvermerk zurueck.
 *
 * Kein Test geht ins Netz: alles laeuft ueber den `FakeProvider`.
 */

import { describe, expect, it } from 'vitest';
import { ingestSource, parseIndex, parseLog, protocolPaths } from '@core/wiki';
import type { WikiIngestResult, WikiTxStore } from '@core/wiki';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import type { FakeGatewaySetup } from '../../helpers/llm';
import { TODAY } from '../../helpers/time';
import {
  INDEX_PATH,
  LOG_PATH,
  MODULE,
  OAUTH_PATH,
  PROTOCOL_PATH,
  RAW_PATH,
  TOKEN_PATH,
  wikiFixture,
} from './fixtures';
import type { WikiFixture } from './fixtures';

const SOURCE_TITLE = 'Mandantentrennung bei Orbit Identity';
const SOURCE_SLUG = `s-${TODAY}-mandantentrennung-bei-orbit-identity`;
const SOURCE_PATH = `modules/${MODULE}/wiki/sources/${SOURCE_SLUG}.md`;
const OVERVIEW_PATH = `modules/${MODULE}/wiki/overview.md`;
const CONCEPT_PATH = `modules/${MODULE}/wiki/concepts/mandantentrennung.md`;
const CONFLICT_PATH = `modules/${MODULE}/wiki/concepts/access-token-laufzeit.md`;

const RAW_TEXT = [
  'Orbit Identity trennt Mandanten über eigene Organisationen.',
  '',
  'Rollen werden über Organisationsgrenzen hinweg nicht geerbt; jede Organisation',
  'pflegt ihre Zuordnung selbst. Access-Token leben hier 30 Minuten.',
].join('\n');

const SUMMARY = [
  '## Worum es geht',
  '',
  'Praxisbericht zur Mandantentrennung bei Orbit Identity.',
  '',
  '## Tragende Aussagen',
  '',
  '- Jeder Mandant ist eine eigene Organisation (Abschnitt „Setup").',
  '- Rollen werden nicht über Organisationsgrenzen geerbt (Abschnitt „Rollen").',
  '',
  '## Was neu ist',
  '',
  '- [[oauth2]] braucht für Mandanten einen zusätzlichen Parameter.',
  '',
  '## Widersprüche',
  '',
  '- Die Quelle nennt 30 Minuten Access-Token, [[token-lebensdauer]] nennt 15 Minuten.',
].join('\n');

const CONTRADICTION_NOTE = '30 Minuten Access-Token statt 15 Minuten';

/** Drei brauchbare Seiten und drei erfundene — die Pruefung muss sie trennen. */
const PAGES = {
  pages: [
    {
      slug: 'mandantentrennung',
      type: 'concept',
      title: 'Mandantentrennung',
      action: 'create',
      patch: 'Jeder Mandant ist eine eigene Organisation. Rollen erben nicht über [[oauth2]].',
      tags: ['auth', 'mandanten'],
    },
    {
      slug: 'oauth2',
      type: 'entity',
      title: 'OAuth 2.1',
      action: 'extend',
      patch: 'Für Mandanten kommt der Parameter organization dazu.',
    },
    {
      slug: 'access-token-laufzeit',
      type: 'concept',
      title: 'Access-Token-Laufzeit',
      action: 'create',
      patch: 'Diese Quelle nennt 30 Minuten Laufzeit.',
      contradicts: { page: 'token-lebensdauer', note: CONTRADICTION_NOTE },
    },
    {
      slug: 'fremdes-modul/rollenkonzept',
      type: 'concept',
      title: 'Rollenkonzept',
      action: 'create',
      patch: 'Erfundenes Modul im Slug.',
    },
    {
      module: 'anderes-modul',
      slug: 'provisionierung',
      type: 'concept',
      title: 'Provisionierung',
      action: 'create',
      patch: 'Erfundener Modulname im Feld.',
    },
    {
      slug: 'index',
      type: 'concept',
      title: 'Katalog',
      action: 'create',
      patch: 'Struktur ist keine Wissensseite.',
    },
  ],
  overviewChange: null,
};

function setup(pages: unknown = PAGES): FakeGatewaySetup {
  return gatewayWithReplies({
    'summarize-source': SUMMARY,
    'wiki-ingest': JSON.stringify(pages),
  });
}

async function ingest(
  fixture: WikiFixture,
  gateway: FakeGatewaySetup['gateway'] | ReturnType<typeof emptyGateway>,
  patch: Partial<Parameters<typeof ingestSource>[1]> = {},
): Promise<WikiIngestResult> {
  return ingestSource(fixture.deps(gateway), {
    rawPath: RAW_PATH,
    module: MODULE,
    title: SOURCE_TITLE,
    text: RAW_TEXT,
    origin: 'https://example.org/orbit-mandanten',
    ...patch,
  });
}

describe('ingestSource mit Modell', () => {
  it('legt die Source-Seite mit Verdichtung und Weg zur Rohquelle an', async () => {
    const fixture = await wikiFixture();

    const result = await ingest(fixture, setup().gateway);

    expect(result.usedLlm).toBe(true);
    expect(result.sourcePage).toBe(SOURCE_PATH);
    expect(result.sourceSlug).toBe(SOURCE_SLUG);
    const doc = await fixture.store.read(SOURCE_PATH);
    expect(doc?.frontmatter).toMatchObject({
      type: 'source',
      module: MODULE,
      created: TODAY,
      raw: RAW_PATH,
      origin: 'https://example.org/orbit-mandanten',
    });
    expect(doc?.frontmatter['condensed']).toBeUndefined();
    expect(doc?.frontmatter['source_basis']).toBeUndefined();
    expect(doc?.body).toContain('## Tragende Aussagen');
    expect(doc?.body).toContain('## Rohquelle');
    expect(doc?.body).toContain(`[${RAW_PATH}](${RAW_PATH})`);
  });

  it('sagt auf der Seite, dass sie aus Beschreibung/Kapiteln statt einem Transcript entstand', async () => {
    const fixture = await wikiFixture();

    await ingest(fixture, setup().gateway, { basis: 'metadata' });

    const doc = await fixture.store.read(SOURCE_PATH);
    expect(doc?.frontmatter['source_basis']).toBe('metadata');
    expect(doc?.body).toContain('Aus Beschreibung und Kapiteln erstellt, es gab kein Transcript.');
  });

  it('beruehrt drei Seiten: anlegen, ergaenzen, Widerspruch benennen', async () => {
    const fixture = await wikiFixture();

    const result = await ingest(fixture, setup().gateway);

    expect(result.touchedPages).toContain(CONCEPT_PATH);
    expect(result.touchedPages).toContain(OAUTH_PATH);
    expect(result.touchedPages).toContain(TOKEN_PATH);
    expect(result.createdPages).toEqual([SOURCE_PATH, CONCEPT_PATH, CONFLICT_PATH]);

    const created = await fixture.store.read(CONCEPT_PATH);
    expect(created?.frontmatter['sources']).toEqual([SOURCE_SLUG]);
    expect(created?.frontmatter['tags']).toEqual(['auth', 'mandanten']);
    expect(created?.body).toContain('Jeder Mandant ist eine eigene Organisation.');
    expect(created?.body).toContain(`(source: [[${SOURCE_SLUG}]])`);
  });

  it('haengt bei „extend" an und laesst bestehenden Text unangetastet', async () => {
    const fixture = await wikiFixture();
    const before = await fixture.text(OAUTH_PATH);

    await ingest(fixture, setup().gateway);

    const after = await fixture.store.read(OAUTH_PATH);
    expect(after?.body).toContain('Autorisierungsprotokoll. Für uns zählen zwei Festlegungen');
    expect(after?.body).toContain('Wie lange die ausgestellten Tokens leben, steht in');
    // Auch der absichtlich kaputte Wikilink des Fixtures bleibt stehen.
    expect(after?.body).toContain('[[device-code-flow]]');
    expect(after?.body).toContain('Für Mandanten kommt der Parameter organization dazu.');
    expect(after?.body).toContain(`(source: [[${SOURCE_SLUG}]])`);
    expect(after?.frontmatter['sources']).toEqual([
      's-2026-08-04-token-lifetimes-blog',
      SOURCE_SLUG,
    ]);
    expect(before.length).toBeLessThan((await fixture.text(OAUTH_PATH)).length);
  });

  it('schreibt den Widerspruch in die widersprochene Seite, ohne die alte Aussage zu aendern', async () => {
    const fixture = await wikiFixture();

    const result = await ingest(fixture, setup().gateway);

    expect(result.contradictions).toEqual([
      { page: 'token-lebensdauer', source: SOURCE_SLUG, note: CONTRADICTION_NOTE },
    ]);
    const token = await fixture.store.read(TOKEN_PATH);
    expect(token?.body).toContain('Aktueller Stand: Access-Token 15 Minuten');
    expect(token?.body).toContain('Der Stand aus dem Erstprojekt nannte 12 Stunden.');
    expect(token?.body).toContain(
      `- [[${SOURCE_SLUG}]] widerspricht dieser Seite: ${CONTRADICTION_NOTE}`,
    );
  });

  it('verwirft erfundene Seiten-Slugs und erfundene Modulnamen', async () => {
    const fixture = await wikiFixture();

    await ingest(fixture, setup().gateway);

    expect(await fixture.store.exists(`modules/${MODULE}/wiki/concepts/rollenkonzept.md`)).toBe(
      false,
    );
    expect(await fixture.store.exists(`modules/${MODULE}/wiki/concepts/provisionierung.md`)).toBe(
      false,
    );
    expect(
      await fixture.store.exists('modules/anderes-modul/wiki/concepts/provisionierung.md'),
    ).toBe(false);
    // `index` ist Struktur, keine Wissensseite — der Katalog bleibt, wie er ist.
    expect(await fixture.text(INDEX_PATH)).toContain('# Katalog — Identitätsmanagement');
  });

  it('zieht Katalog und Chronik nach, ohne Nutzerzeilen zu verlieren', async () => {
    const fixture = await wikiFixture();
    const logBefore = await fixture.text(LOG_PATH);

    await ingest(fixture, setup().gateway);

    const entries = parseIndex(await fixture.text(INDEX_PATH));
    expect(entries.find((entry) => entry.slug === SOURCE_SLUG)?.type).toBe('source');
    expect(entries.find((entry) => entry.slug === 'mandantentrennung')?.type).toBe('concept');
    expect(entries.find((entry) => entry.slug === 'oauth2')?.summary.length).toBeGreaterThan(0);
    expect(await fixture.text(INDEX_PATH)).toContain('## Synthese');

    const log = await fixture.text(LOG_PATH);
    expect(log.startsWith(logBefore.replace(/\s+$/, ''))).toBe(true);
    const latest = parseLog(log)[0];
    expect(latest?.kind).toBe('ingest');
    expect(latest?.title).toBe(SOURCE_TITLE);
    expect(latest?.fields['summary']).toBe(SOURCE_PATH);
    expect(latest?.fields['touched']).toContain('[[mandantentrennung]]');
    expect(latest?.fields['notes']).toContain(CONTRADICTION_NOTE);
  });

  it('vermerkt im Protokoll der Rohquelle, wohin sie verdichtet wurde', async () => {
    const fixture = await wikiFixture();

    await ingest(fixture, setup().gateway);

    const protocol: unknown = JSON.parse(await fixture.text(PROTOCOL_PATH));
    expect(protocol).toMatchObject({
      kind: 'url',
      sourcePage: SOURCE_SLUG,
      modules: [MODULE],
      // Was die App nicht kennt, bleibt stehen.
      provenance: { content: 'fetch', metadata: 'fetch' },
    });
  });

  it('a digestion leaves overview.md byte-identical even when the model reports an overview change', async () => {
    const fixture = await wikiFixture();
    const before = await fixture.text(OVERVIEW_PATH);

    const result = await ingest(
      fixture,
      setup({ ...PAGES, overviewChange: 'Mandanten sind ab jetzt Organisationen.' }).gateway,
    );

    expect(await fixture.text(OVERVIEW_PATH)).toBe(before);
    expect(result.touchedPages).not.toContain(OVERVIEW_PATH);
    const slugs = parseIndex(await fixture.text(INDEX_PATH)).map((entry) => entry.slug);
    expect(slugs).toContain(SOURCE_SLUG);
    expect(slugs).toContain('mandantentrennung');
  });

  it('verdichtet einen langen Text abschnittsweise und fuehrt ihn zusammen', async () => {
    const fixture = await wikiFixture();
    const { gateway, provider } = setup();
    const long = Array.from({ length: 40 }, (_unused, index) =>
      `Absatz ${index + 1}. ${'wort '.repeat(80)}`.trim(),
    ).join('\n\n');

    const result = await ingest(fixture, gateway, { text: long });

    // Je Teilstueck ein Aufruf, dann einer fuers Zusammenfuehren.
    expect(provider.countFor('summarize-source')).toBeGreaterThan(2);
    expect(provider.countFor('wiki-ingest')).toBe(1);
    expect(result.usedLlm).toBe(true);
    const messages = provider.calls.filter((call) => call.task === 'summarize-source');
    expect(messages[0]?.messages.at(-1)?.content).toContain('Abschnitt 1/');
    expect(messages.at(-1)?.messages.at(-1)?.content).toContain('Teilverdichtungen:');
  });

  it('bleibt bei einer kaputten Modellantwort bei der Source-Seite', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({
      'summarize-source': SUMMARY,
      'wiki-ingest': 'Ich habe leider kein JSON.',
    });

    const result = await ingest(fixture, gateway);

    expect(result.usedLlm).toBe(true);
    expect(result.touchedPages).toContain(SOURCE_PATH);
    expect(result.contradictions).toEqual([]);
    expect(parseIndex(await fixture.text(INDEX_PATH)).map((entry) => entry.slug)).toContain(
      SOURCE_SLUG,
    );
  });
});

describe('ingestSource ohne Modell', () => {
  it('traegt die Rohquelle trotzdem ein und sagt, dass sie unverdichtet ist', async () => {
    const fixture = await wikiFixture();

    const result = await ingest(fixture, emptyGateway());

    expect(result.usedLlm).toBe(false);
    expect(result.model).toBeNull();
    expect(result.touchedPages).toContain(SOURCE_PATH);
    const doc = await fixture.store.read(SOURCE_PATH);
    expect(doc?.frontmatter['condensed']).toBe(false);
    expect(doc?.body).toContain('Orbit Identity trennt Mandanten');
    expect(doc?.body).toContain('Noch nicht verdichtet — braucht ein Modell.');
    expect(doc?.body).toContain('## Rohquelle');
  });

  it('without a model the digestion leaves overview.md byte-identical and lists the source in index.md', async () => {
    const fixture = await wikiFixture();
    const before = await fixture.text(OVERVIEW_PATH);

    const result = await ingest(fixture, emptyGateway());

    expect(await fixture.text(OVERVIEW_PATH)).toBe(before);
    expect(result.touchedPages).not.toContain(OVERVIEW_PATH);
    expect(await fixture.text(INDEX_PATH)).toContain(`[[${SOURCE_SLUG}]]`);
  });

  it('nennt die Quelle im Katalog und in der Chronik', async () => {
    const fixture = await wikiFixture();

    await ingest(fixture, emptyGateway());

    expect(parseIndex(await fixture.text(INDEX_PATH))).toContainEqual({
      type: 'source',
      slug: SOURCE_SLUG,
      summary: 'noch nicht verdichtet',
    });
    const latest = parseLog(await fixture.text(LOG_PATH))[0];
    expect(latest?.kind).toBe('ingest');
    expect(latest?.fields['summary']).toBe(SOURCE_PATH);
  });

  it('legt keine Seiten an, die es nicht belegen kann', async () => {
    const fixture = await wikiFixture();

    const result = await ingest(fixture, emptyGateway());

    expect(result.createdPages).toEqual([SOURCE_PATH]);
    expect(await fixture.store.exists(CONCEPT_PATH)).toBe(false);
    expect(await fixture.text(OAUTH_PATH)).not.toContain(SOURCE_SLUG);
  });
});

describe('protocolPaths', () => {
  it('kennt beide Orte aus docs/VAULT-FORMAT.md', () => {
    expect(protocolPaths('raw/web/2026-08-06-x.md')).toEqual(['raw/web/2026-08-06-x.ingest.json']);
    expect(protocolPaths('raw/youtube/xOFkpf9KgKg')).toEqual([
      'raw/youtube/xOFkpf9KgKg/.ingest.json',
      'raw/youtube/xOFkpf9KgKg.ingest.json',
    ]);
  });
});

describe('ingestSource: Grenzen', () => {
  it('weigert sich, in ein Modul zu schreiben, das es nicht gibt', async () => {
    const fixture = await wikiFixture();
    await expect(ingest(fixture, emptyGateway(), { module: 'gibt-es-nicht' })).rejects.toThrow(
      /gibt-es-nicht/,
    );
  });

  it('weigert sich ohne Modul', async () => {
    const fixture = await wikiFixture();
    await expect(ingest(fixture, emptyGateway(), { module: '  ' })).rejects.toThrow(/ohne Modul/);
  });

  it('legt eine zweite Quelle desselben Tages daneben, statt sie zu ueberschreiben', async () => {
    const fixture = await wikiFixture();

    const first = await ingest(fixture, emptyGateway());
    const second = await ingest(fixture, emptyGateway());

    expect(second.sourceSlug).toBe(`${first.sourceSlug}-2`);
    expect(await fixture.store.exists(first.sourcePage)).toBe(true);
  });
});

/* Ganz oder gar nicht (Story 050, AC1 — die Haelfte „Fehlschlag hinterlaesst nichts";
   die andere Haelfte, „ein zweiter Versuch schreibt genau eine Seite", steht in D4).
   Der Fehler faellt beim Schreiben von `log.md` — dem vorletzten Schritt, also nach
   Source-Seite, Entitaeten, Widerspruch und Katalog. Genau diese Stelle hinterliess
   vorher verdichtete Seiten neben einer Rohquelle, die sich weiter „unverdichtet"
   nannte. */
const DISK_ERROR = new Error('Chronik nicht schreibbar');

/**
 * Ein Store, der genau bei einem Pfad das Schreiben verweigert. Alles andere geht
 * an den echten Store durch — der Rueckweg trifft dieselben Dateien wie im Betrieb.
 */
function storeFailingOn(store: WikiTxStore, failPath: string): WikiTxStore {
  return {
    read: (path) => store.read(path),
    readText: (path) => store.readText(path),
    exists: (path) => store.exists(path),
    delete: (path) => store.delete(path),
    create: (path, frontmatter, body) => store.create(path, frontmatter, body),
    write: (input) => store.write(input),
    append: (path, section, content, options) => store.append(path, section, content, options),
    writeText: async (path, content, options) => {
      if (path === failPath) throw DISK_ERROR;
      return store.writeText(path, content, options);
    },
  };
}

function ingestFailingOn(fixture: WikiFixture, failPath: string): Promise<WikiIngestResult> {
  return ingestSource(
    { ...fixture.deps(setup().gateway), store: storeFailingOn(fixture.store, failPath) },
    {
      rawPath: RAW_PATH,
      module: MODULE,
      title: SOURCE_TITLE,
      text: RAW_TEXT,
      origin: 'https://example.org/orbit-mandanten',
    },
  );
}

describe('ingestSource: ganz oder gar nicht', () => {
  it('laesst nach einem Fehler an der Chronik keine Seite und keinen Katalogeintrag stehen', async () => {
    const fixture = await wikiFixture();
    const oauthBefore = await fixture.text(OAUTH_PATH);
    const tokenBefore = await fixture.text(TOKEN_PATH);
    const indexBefore = await fixture.text(INDEX_PATH);
    const logBefore = await fixture.text(LOG_PATH);

    await expect(ingestFailingOn(fixture, LOG_PATH)).rejects.toThrow(/Chronik nicht schreibbar/);

    // Angelegte Seiten sind wieder weg (im Papierkorb, nicht verloren).
    expect(await fixture.store.exists(SOURCE_PATH)).toBe(false);
    expect(await fixture.store.exists(CONCEPT_PATH)).toBe(false);
    expect(await fixture.store.exists(CONFLICT_PATH)).toBe(false);
    // Ergaenzte Seiten stehen Zeichen fuer Zeichen wieder auf ihrem alten Stand.
    expect(await fixture.text(OAUTH_PATH)).toBe(oauthBefore);
    expect(await fixture.text(TOKEN_PATH)).toBe(tokenBefore);
    // Kein Katalogeintrag, keine Chronikzeile.
    expect(parseIndex(await fixture.text(INDEX_PATH)).map((entry) => entry.slug)).not.toContain(
      SOURCE_SLUG,
    );
    expect(await fixture.text(INDEX_PATH)).toBe(indexBefore);
    expect(await fixture.text(LOG_PATH)).toBe(logBefore);
  });

  it('laesst die Rohquelle unverdichtet — das Protokoll wird nicht vermerkt', async () => {
    const fixture = await wikiFixture();
    const before = await fixture.text(PROTOCOL_PATH);

    await expect(ingestFailingOn(fixture, LOG_PATH)).rejects.toThrow(DISK_ERROR);

    const protocol: unknown = JSON.parse(await fixture.text(PROTOCOL_PATH));
    expect(protocol).toMatchObject({ sourcePage: null, modules: [] });
    expect(await fixture.text(PROTOCOL_PATH)).toBe(before);
  });

  /* Der Vermerk ist der letzte Schritt: scheitert er, muss auch die Chronik
     zurueckgedreht werden — sonst stuende eine Ingest-Zeile ueber einer Quelle,
     die es nicht gibt. */
  it('dreht auch die Chronik zurueck, wenn erst der Protokollvermerk scheitert', async () => {
    const fixture = await wikiFixture();
    const logBefore = await fixture.text(LOG_PATH);
    const indexBefore = await fixture.text(INDEX_PATH);

    await expect(ingestFailingOn(fixture, PROTOCOL_PATH)).rejects.toThrow(DISK_ERROR);

    expect(await fixture.store.exists(SOURCE_PATH)).toBe(false);
    expect(await fixture.text(LOG_PATH)).toBe(logBefore);
    expect(await fixture.text(INDEX_PATH)).toBe(indexBefore);
    const protocol: unknown = JSON.parse(await fixture.text(PROTOCOL_PATH));
    expect(protocol).toMatchObject({ sourcePage: null });
  });

  it('reicht den echten Fehler an den Aufrufer durch', async () => {
    const fixture = await wikiFixture();

    const caught = await ingestFailingOn(fixture, LOG_PATH).then(
      () => null,
      (error: unknown) => error,
    );

    // Derselbe Fehler, nicht ein Ersatz aus dem Rueckweg.
    expect(caught).toBe(DISK_ERROR);
  });
});

/* Genau eine Source-Seite je Rohquelle (Story 050, AC1 — die zweite Haelfte, D4).
   Der Fall, den kein Rueckweg abdeckt: ein `SIGKILL` oder ein Stromausfall. Dann
   steht die Source-Seite, das Protokoll nennt die Quelle aber weiter unverdichtet —
   und der zweite Versuch muss in genau diese Seite zurueckschreiben, statt `…-2`
   daneben zu legen. */
const KILLED_DAY = '2026-08-09';
const SECOND_PATH = `modules/${MODULE}/wiki/sources/${SOURCE_SLUG}-2.md`;
const FOREIGN_RAW = 'raw/web/2026-08-09-ganz-andere-quelle.md';

/** Der Rumpf, den ein abgebrochener Lauf ohne Modell hinterlaesst. */
const KILLED_BODY = [
  'Orbit Identity trennt Mandanten über eigene Organisationen.',
  '',
  'Noch nicht verdichtet — braucht ein Modell.',
  '',
  '## Rohquelle',
  '',
  `- [${RAW_PATH}](${RAW_PATH})`,
  '',
].join('\n');

/**
 * Eine liegengebliebene Source-Seite anlegen — der Zustand nach dem harten
 * Abbruch. Danach wird der Index nachgezogen: die App startet nach einem Kill neu
 * und liest die Datei wieder ein.
 */
async function leftoverSourcePage(
  fixture: WikiFixture,
  patch: { path?: string; raw?: string } = {},
): Promise<void> {
  await fixture.store.create(
    patch.path ?? SOURCE_PATH,
    {
      type: 'source',
      title: SOURCE_TITLE,
      module: MODULE,
      created: KILLED_DAY,
      updated: KILLED_DAY,
      tags: [],
      sources: [],
      lang: 'de',
      raw: patch.raw ?? RAW_PATH,
      condensed: false,
    },
    KILLED_BODY,
  );
  await fixture.refresh();
}

describe('ingestSource: ein zweiter Versuch schreibt genau eine Source-Seite', () => {
  it('schreibt in die liegengebliebene Seite zurueck, statt eine zweite anzulegen', async () => {
    const fixture = await wikiFixture();
    await leftoverSourcePage(fixture);

    const result = await ingest(fixture, setup().gateway);

    expect(result.sourceSlug).toBe(SOURCE_SLUG);
    expect(result.sourcePage).toBe(SOURCE_PATH);
    // Die Seite stand schon — sie ist in diesem Lauf nicht entstanden.
    expect(result.createdPages).not.toContain(SOURCE_PATH);
    expect(await fixture.store.exists(SECOND_PATH)).toBe(false);

    const doc = await fixture.store.read(SOURCE_PATH);
    expect(doc?.body).toContain('## Tragende Aussagen');
    expect(doc?.body).not.toContain('Noch nicht verdichtet');
    expect(doc?.frontmatter).toMatchObject({
      type: 'source',
      module: MODULE,
      raw: RAW_PATH,
      // Angelegt wurde die Seite im abgebrochenen Lauf; verdichtet ist sie heute.
      created: KILLED_DAY,
      updated: TODAY,
      condensed: true,
    });
  });

  it('laesst danach genau eine Seite und einen Katalogeintrag zu dieser Rohquelle stehen', async () => {
    const fixture = await wikiFixture();
    await leftoverSourcePage(fixture);

    await ingest(fixture, setup().gateway);
    await fixture.refresh();

    const forRaw = fixture.index.index().docs.filter((doc) => doc.frontmatter['raw'] === RAW_PATH);
    expect(forRaw.map((doc) => doc.path)).toEqual([SOURCE_PATH]);
    expect(
      parseIndex(await fixture.text(INDEX_PATH)).filter((e) => e.slug === SOURCE_SLUG),
    ).toEqual([{ type: 'source', slug: SOURCE_SLUG, summary: expect.any(String) }]);
    const protocol: unknown = JSON.parse(await fixture.text(PROTOCOL_PATH));
    expect(protocol).toMatchObject({ sourcePage: SOURCE_SLUG, modules: [MODULE] });
  });

  /* Der teure Irrtum waere, die Seite einer *anderen* Quelle zu ueberschreiben:
     zwei Quellen desselben Tages mit demselben Titel treffen sich im Slug. Nur
     `raw` entscheidet, und dieselbe Kollision loest weiter `freeSlug`. */
  it('ueberschreibt keine Seite, die zu einer anderen Rohquelle gehoert', async () => {
    const fixture = await wikiFixture();
    await leftoverSourcePage(fixture, { raw: FOREIGN_RAW });
    const foreignBefore = await fixture.text(SOURCE_PATH);

    const result = await ingest(fixture, setup().gateway);

    expect(result.sourceSlug).toBe(`${SOURCE_SLUG}-2`);
    expect(result.sourcePage).toBe(SECOND_PATH);
    expect(result.createdPages).toContain(SECOND_PATH);
    expect(await fixture.text(SOURCE_PATH)).toBe(foreignBefore);
  });

  /* Die Gegenprobe zum Protokollvermerk: eine vollstaendig verdichtete Quelle ein
     zweites Mal zu verdichten ist eine Absicht, kein Wiederanlauf — auch wenn der
     Index die erste Seite inzwischen kennt. */
  it('legt neben eine schon verdichtete Quelle weiter eine zweite Seite', async () => {
    const fixture = await wikiFixture();

    const first = await ingest(fixture, emptyGateway());
    await fixture.refresh();
    const second = await ingest(fixture, emptyGateway());

    expect(second.sourceSlug).toBe(`${first.sourceSlug}-2`);
    expect(second.createdPages).toContain(second.sourcePage);
    expect(await fixture.store.exists(first.sourcePage)).toBe(true);
  });
});
