/* Zwei Quellen, ein Modul, gleichzeitig (Story 050, AC2 — D5).
 *
 * Die Warteschlange verdichtet in der App zwei Quellen nebeneinander
 * (`src/main/ipc/ingest.ts`). `wiki/index.md`, `wiki/log.md` und `wiki/overview.md`
 * gehoeren aber dem Modul und nicht einem Lauf: wer sie liest, etwas anhaengt und
 * zurueckschreibt, ueberschreibt den Eintrag des anderen — die Chronikzeile war
 * einfach weg. Deshalb laufen die schreibenden Abschnitte je Modul serialisiert
 * (`withModuleLock`), der Modellaufruf dazwischen ausdruecklich nicht.
 *
 * Gepruefte Zusagen:
 * 1. Beide Verdichtungen werden fertig — beide Versprechen entstehen, bevor eines
 *    aufgeloest ist.
 * 2. Danach stehen **beide** Chronik-Ueberschriften in `wiki/log.md`.
 * 3. Danach stehen beide Katalogeintraege (und beide Wissensseiten) im Katalog.
 * 4. Die Sperre wird auch dann freigegeben, wenn der Vorgang wirft — sonst
 *    blockierte ein Fehlschlag jeden weiteren Import in dieses Modul.
 *
 * Kein Test geht ins Netz: alles laeuft ueber den `FakeProvider`.
 */

import { describe, expect, it } from 'vitest';
import {
  appendLog,
  ingestSource,
  parseIndex,
  parseLog,
  withModuleLock,
  writePage,
} from '@core/wiki';
import type { WikiIngestResult, WikiStore, WikiTxStore } from '@core/wiki';
import { VaultConflictError } from '@core/vault/types';
import { gatewayWithReplies } from '../../helpers/llm';
import { TODAY } from '../../helpers/time';
import {
  INDEX_PATH,
  LOG_PATH,
  MODULE,
  OVERVIEW_PATH,
  PROTOCOL_PATH,
  RAW_PATH,
  wikiFixture,
} from './fixtures';
import type { WikiFixture } from './fixtures';

/* ── Zwei Quellen ──────────────────────────────────────────────────────────── */

const SECOND_RAW = 'raw/web/2026-08-07-zettelkasten-in-der-praxis.md';
const SECOND_PROTOCOL = 'raw/web/2026-08-07-zettelkasten-in-der-praxis.ingest.json';

/** Was eine der beiden gleichzeitigen Verdichtungen ausmacht. */
interface Candidate {
  rawPath: string;
  origin: string;
  title: string;
  /** Slug der Source-Seite, den der Lauf bekommen muss. */
  sourceSlug: string;
  /** Die eine Wissensseite, die „das Modell" zu dieser Quelle vorschlaegt. */
  page: { slug: string; title: string };
  /** Antwortfeld des „Modells", das der Ingest ignoriert (er schreibt nicht in `overview.md`). */
  overviewChange: string;
}

const FIRST: Candidate = {
  rawPath: RAW_PATH,
  origin: 'https://example.org/orbit-mandanten',
  title: 'Mandantentrennung bei Orbit Identity',
  sourceSlug: `s-${TODAY}-mandantentrennung-bei-orbit-identity`,
  page: { slug: 'mandantentrennung', title: 'Mandantentrennung' },
  overviewChange: 'Mandanten sind ab jetzt eigene Organisationen.',
};

const SECOND: Candidate = {
  rawPath: SECOND_RAW,
  origin: 'https://example.org/zettelkasten-in-der-praxis',
  title: 'Zettelkasten in der Praxis',
  sourceSlug: `s-${TODAY}-zettelkasten-in-der-praxis`,
  page: { slug: 'zettelkasten', title: 'Zettelkasten' },
  overviewChange: 'Notizen werden als einzelne Zettel gefuehrt.',
};

/** Die zweite Rohquelle samt Protokoll — die erste bringt der Fixture-Vault mit. */
function secondRawFiles(): Record<string, string> {
  const protocol = {
    kind: 'url',
    origin: SECOND.origin,
    ingestedAt: '2026-08-07T09:12:00+02:00',
    title: SECOND.title,
    sourcePage: null,
    modules: [],
    provenance: { content: 'fetch', metadata: 'fetch' },
  };
  return {
    [SECOND_RAW]: [
      '---',
      'doc_type: web',
      `title: '${SECOND.title}'`,
      `origin: '${SECOND.origin}'`,
      'fetched_at: 2026-08-07T09:12:00+02:00',
      'language: de',
      '---',
      '',
      `# ${SECOND.title}`,
      '',
      'Zweite Rohquelle des Fixtures, damit zwei Verdichtungen gleichzeitig in',
      'dasselbe Modul laufen koennen.',
      '',
    ].join('\n'),
    [SECOND_PROTOCOL]: `${JSON.stringify(protocol, null, 2)}\n`,
  };
}

/**
 * Je Lauf ein eigenes Gateway: der `FakeProvider` antwortet je Aufgabe, nicht je
 * Eingabe — zwei Antworten brauchen deshalb zwei Gateways.
 */
function ingest(fixture: WikiFixture, candidate: Candidate): Promise<WikiIngestResult> {
  const { gateway } = gatewayWithReplies({
    'summarize-source': [
      '## Worum es geht',
      '',
      `Verdichtung zur Quelle: ${candidate.title}.`,
      '',
      '## Tragende Aussagen',
      '',
      `- ${candidate.page.title} ist der tragende Begriff dieser Quelle.`,
    ].join('\n'),
    'wiki-ingest': JSON.stringify({
      pages: [
        {
          slug: candidate.page.slug,
          type: 'concept',
          title: candidate.page.title,
          action: 'create',
          patch: `Kernaussage aus der Quelle ${candidate.title}.`,
        },
      ],
      overviewChange: candidate.overviewChange,
    }),
  });

  return ingestSource(fixture.deps(gateway), {
    rawPath: candidate.rawPath,
    module: MODULE,
    title: candidate.title,
    text: [
      `Erster Absatz der Quelle ${candidate.title}.`,
      '',
      `Zweiter Absatz: ${candidate.page.title} wird hier ausgefuehrt.`,
    ].join('\n'),
    origin: candidate.origin,
  });
}

/** Beide Versprechen entstehen, bevor eines aufgeloest ist — genau das ist der Fall. */
async function bothAtOnce(fixture: WikiFixture): Promise<[WikiIngestResult, WikiIngestResult]> {
  const first = ingest(fixture, FIRST);
  const second = ingest(fixture, SECOND);
  return Promise.all([first, second]);
}

describe('zwei Verdichtungen in dasselbe Modul, gleichzeitig', () => {
  it('werden beide fertig', async () => {
    const fixture = await wikiFixture(secondRawFiles());

    const [first, second] = await bothAtOnce(fixture);

    expect(first.sourceSlug).toBe(FIRST.sourceSlug);
    expect(second.sourceSlug).toBe(SECOND.sourceSlug);
    expect(first.usedLlm).toBe(true);
    expect(second.usedLlm).toBe(true);
    expect(await fixture.store.exists(first.sourcePage)).toBe(true);
    expect(await fixture.store.exists(second.sourcePage)).toBe(true);
  });

  it('hinterlassen beide Chronik-Ueberschriften, keine geht im Rennen verloren', async () => {
    const fixture = await wikiFixture(secondRawFiles());
    const before = await fixture.text(LOG_PATH);

    await bothAtOnce(fixture);

    const log = await fixture.text(LOG_PATH);
    expect(log).toContain(`## [${TODAY}] ingest | ${FIRST.title}`);
    expect(log).toContain(`## [${TODAY}] ingest | ${SECOND.title}`);
    // Der Bestand der Chronik steht Zeichen fuer Zeichen weiter davor.
    expect(log.startsWith(before.replace(/\s+$/, ''))).toBe(true);
    const titles = parseLog(log, Number.MAX_SAFE_INTEGER)
      .filter((entry) => entry.kind === 'ingest')
      .map((entry) => entry.title);
    expect(titles).toContain(FIRST.title);
    expect(titles).toContain(SECOND.title);
    // Der Bestandseintrag des Fixtures plus genau zwei neue.
    expect(titles).toHaveLength(3);
  });

  it('hinterlassen beide Katalogeintraege samt beider Wissensseiten', async () => {
    const fixture = await wikiFixture(secondRawFiles());

    await bothAtOnce(fixture);

    const slugs = parseIndex(await fixture.text(INDEX_PATH)).map((entry) => entry.slug);
    for (const slug of [FIRST.sourceSlug, SECOND.sourceSlug, FIRST.page.slug, SECOND.page.slug]) {
      expect(slugs).toContain(slug);
    }
    // Kein Slug zweimal: der Katalog wurde ergaenzt, nicht doppelt geschrieben.
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('lassen overview.md unberuehrt und vermerken beide Protokolle', async () => {
    const fixture = await wikiFixture(secondRawFiles());
    const before = await fixture.text(OVERVIEW_PATH);

    await bothAtOnce(fixture);

    expect(await fixture.text(OVERVIEW_PATH)).toBe(before);

    const firstProtocol: unknown = JSON.parse(await fixture.text(PROTOCOL_PATH));
    const secondProtocol: unknown = JSON.parse(await fixture.text(SECOND_PROTOCOL));
    expect(firstProtocol).toMatchObject({ sourcePage: FIRST.sourceSlug, modules: [MODULE] });
    expect(secondProtocol).toMatchObject({ sourcePage: SECOND.sourceSlug, modules: [MODULE] });
  });
});

/* ── Die Sperre selbst ─────────────────────────────────────────────────────── */

/** Ein Tor, das der Test von aussen aufmacht — kein Timer, also kein Flackern. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open: () => open() };
}

/** Alle anhaengigen Microtasks abarbeiten lassen — ohne auf eine Anzahl zu wetten. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('withModuleLock', () => {
  it('gibt die Sperre auch frei, wenn der Vorgang wirft', async () => {
    const boom = new Error('mitten im Schreiben abgebrochen');
    const order: string[] = [];

    // Beide Aufrufe entstehen, bevor der erste abgelaufen ist.
    const failing = withModuleLock('gesperrtes-modul', async () => {
      order.push('erster');
      throw boom;
    });
    const after = withModuleLock('gesperrtes-modul', async () => {
      order.push('zweiter');
      return 'durchgelaufen';
    });

    // Der Fehler geht an seinen eigenen Aufrufer — und nur an den.
    await expect(failing).rejects.toBe(boom);
    await expect(after).resolves.toBe('durchgelaufen');
    expect(order).toEqual(['erster', 'zweiter']);
  });

  it('serialisiert dasselbe Modul', async () => {
    const first = gate();
    const order: string[] = [];

    const held = withModuleLock('ein-modul', async () => {
      order.push('erster-anfang');
      await first.wait;
      order.push('erster-ende');
    });
    const queued = withModuleLock('ein-modul', async () => {
      order.push('zweiter');
    });

    // Solange der erste haengt, kommt der zweite nicht dran.
    await settle();
    expect(order).toEqual(['erster-anfang']);
    first.open();
    await Promise.all([held, queued]);
    expect(order).toEqual(['erster-anfang', 'erster-ende', 'zweiter']);
  });

  it('laesst verschiedene Module nebeneinander laufen', async () => {
    const first = gate();
    const order: string[] = [];

    const held = withModuleLock('modul-a', async () => {
      order.push('a-anfang');
      await first.wait;
      order.push('a-ende');
    });
    const other = withModuleLock('modul-b', async () => {
      order.push('b');
    });

    // `modul-b` laeuft durch, obwohl `modul-a` noch haengt.
    await other;
    expect(order).toEqual(['a-anfang', 'b']);
    first.open();
    await held;
    expect(order).toEqual(['a-anfang', 'b', 'a-ende']);
  });
});

/* ── Der begrenzte zweite Versuch (Story 050, D-e) ─────────────────────────
   Die Sperre ist prozesslokal. Der Gaertner in einem anderen Prozess und eine
   Handbearbeitung in Obsidian schreiben dieselbe Datei — dagegen hilft nur der
   Hash plus ein erneutes Lesen. Fuer eine Chronik ist das die einzige ehrliche
   Reaktion: die fremde Zeile bleibt, der eigene Eintrag kommt dahinter. */

const FOREIGN_LINE = '## [2026-08-05] lint';

/**
 * Ein Store, der genau beim ersten Schreiben von `log.md` dazwischenfunkt: er
 * legt eine fremde Zeile ab und meldet dann den Konflikt, den ein echter Store
 * in dieser Lage meldet.
 */
function storeWithForeignWriter(store: WikiStore, path: string): WikiStore {
  let struck = false;
  return {
    read: (target) => store.read(target),
    readText: (target) => store.readText(target),
    exists: (target) => store.exists(target),
    write: (input) => store.write(input),
    create: (target, frontmatter, body) => store.create(target, frontmatter, body),
    append: (target, section, content, options) => store.append(target, section, content, options),
    writeText: async (target, content, options) => {
      if (target !== path || struck) return store.writeText(target, content, options);
      struck = true;
      const existing = (await store.readText(target)) ?? '';
      await store.writeText(target, `${existing}\n${FOREIGN_LINE}\n`);
      throw new VaultConflictError({ path: target, expectedHash: '', actualHash: '' });
    },
  };
}

describe('appendLog gegen einen fremden Schreiber', () => {
  it('liest neu und haengt hinter die fremde Zeile, statt sie zu ueberschreiben', async () => {
    const fixture = await wikiFixture();
    const store = storeWithForeignWriter(fixture.store, LOG_PATH);

    const result = await appendLog(store, MODULE, { kind: 'query', title: 'Eine Frage' });

    const log = await fixture.text(LOG_PATH);
    expect(log).toContain(FOREIGN_LINE);
    expect(log).toContain(result.block);
    expect(log.indexOf(FOREIGN_LINE)).toBeLessThan(log.indexOf(result.block));
    // Und der Bestand steht immer noch davor.
    expect(log).toContain('## [2026-08-04] ingest | Blogartikel zu Token-Lebensdauern');
  });
});

/**
 * Ein Store, der waehrend der Verdichtung selbst einen Absatz an `overview.md`
 * haengt — beim ersten Katalog- oder Chronik-Schreiben, also mitten im gesperrten
 * Abschnitt. So sieht man, ob die Verdichtung die Datei danach noch anfasst; `seen`
 * haelt den Stand fest, den der fremde Schreiber hinterliess.
 */
function storeWithForeignOverviewWriter(
  store: WikiTxStore,
  path: string,
  seen: { text: string | null },
): WikiTxStore {
  let struck = false;
  return {
    read: (target) => store.read(target),
    readText: (target) => store.readText(target),
    exists: (target) => store.exists(target),
    write: (input) => store.write(input),
    create: (target, frontmatter, body) => store.create(target, frontmatter, body),
    append: (target, section, content, options) => store.append(target, section, content, options),
    writeText: async (target, content, options) => {
      if (!struck) {
        struck = true;
        await writePage(store, path, { appendBody: FOREIGN_OVERVIEW_PARAGRAPH });
        seen.text = await store.readText(path);
      }
      return store.writeText(target, content, options);
    },
    delete: (target) => store.delete(target),
  };
}

const FOREIGN_OVERVIEW_PARAGRAPH = 'Von aussen ergaenzt, waehrend die Verdichtung lief.';

describe('overview.md gegen einen fremden Schreiber', () => {
  it('a foreign edit to overview.md during a digestion survives byte-identical', async () => {
    const fixture = await wikiFixture();
    const seen: { text: string | null } = { text: null };
    const store = storeWithForeignOverviewWriter(fixture.store, OVERVIEW_PATH, seen);

    await ingestSource(
      {
        ...fixture.deps(
          gatewayWithReplies({
            'summarize-source': [
              '## Worum es geht',
              '',
              `Verdichtung zur Quelle: ${FIRST.title}.`,
            ].join('\n'),
            'wiki-ingest': JSON.stringify({ pages: [], overviewChange: FIRST.overviewChange }),
          }).gateway,
        ),
        store,
      },
      {
        rawPath: RAW_PATH,
        module: MODULE,
        title: FIRST.title,
        text: [
          `Erster Absatz der Quelle ${FIRST.title}.`,
          '',
          `Zweiter Absatz: ${FIRST.page.title} wird hier ausgefuehrt.`,
        ].join('\n'),
        origin: FIRST.origin,
      },
    );

    const overview = await fixture.text(OVERVIEW_PATH);
    expect(seen.text).not.toBeNull();
    expect(overview).toBe(seen.text);
    expect(overview).toContain(FOREIGN_OVERVIEW_PARAGRAPH);
    expect(overview).not.toContain(FIRST.overviewChange);
  });
});
