/**
 * Der Kern: eine Rohquelle kommt herein und wird **einmal** verdichtet.
 *
 * Der Ablauf ist der aus docs/MODULE-SCHEMA.md, in dieser Reihenfolge:
 * 1. Source-Seite in `wiki/sources/` — worum es geht, die tragenden Aussagen mit
 *    Belegstellen, was neu ist, was dem Bestand widerspricht.
 * 2. Entitaeten und Konzepte anlegen oder ergaenzen, Widersprueche benennen.
 * 3. `wiki/index.md` nachziehen, `wiki/log.md` ergaenzen.
 * 4. `wiki/overview.md` nur, wenn sich die Synthese wirklich geaendert hat.
 *
 * **Ohne Modell geht nichts verloren.** Dann entsteht die Source-Seite trotzdem —
 * mit Kopf, erstem Absatz und dem Hinweis „noch nicht verdichtet"; sie steht im
 * Katalog und in der Chronik, traegt `condensed: false` und wartet auf ein Modell.
 * Ein Pflegelauf kann sie spaeter aufgreifen.
 *
 * **The write phase is one unit.** Steps 1 to 4 touch six files through five
 * collaborators; a step that throws halfway used to leave pages written while the
 * raw protocol still called the source undigested — the badge lying in the worst
 * direction. Everything from the source page to the protocol therefore writes
 * through a `WikiTransaction`: it succeeds whole, or it is taken back and the
 * caller sees the original error (story 050, D-a).
 *
 * **And one module at a time.** The import queue digests two sources at once, and
 * `index.md`, `log.md` and `overview.md` belong to the module, not to one run —
 * read-modify-write from two sides loses whichever entry was written first. The
 * two writing stretches therefore run under `withModuleLock`; the model call
 * between them stays outside it, because AC2 asks both digestions to *complete*
 * and the summarizing is the expensive part (story 050, D-d).
 */

import type { DocLanguage } from '@shared/types';
import { promptClampNotice } from '@core/condense';
import type { KnownPageHint } from '@core/llm';
import { WIKI_INGEST_SCHEMA, isAbortError, parseJsonLoose, wikiIngestPrompt } from '@core/llm';
import { excerpt } from '@core/vault/doc';
import {
  MAX_SLUG_LENGTH,
  isoDay,
  moduleDir,
  slugify,
  sourceSlug as sourceSlugOf,
  wikiIndexPath,
} from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { applySuggestions, sourceRef } from './apply-suggestions';
import { upsertEntries, type WikiIndexEntry } from './index-md';
import { appendLog } from './log-md';
import { withModuleLock } from './module-lock';
import { appendUnderSection, createPage, findSourcePageForRaw, pagePath, writePage } from './pages';
import { isRawDigestedInto, markRawProtocol } from './raw-protocol';
import { condenseSource, type CondenseResult } from './summarize';
import { readIngestReply, type IngestReply } from './suggestions';
import { phrases } from './text';
import { WikiTransaction } from './transaction';
import { WikiError } from './types';
import type { PageRef, WikiDeps, WikiIndexView, WikiIngestDeps, WikiIngestResult } from './types';
import { MAX_WRITE_ATTEMPTS, isConflict, writeTextWithRetry } from './write-retry';

/** Laenge des Katalog-Einzeilers. */
const SUMMARY_CHARS = 120;
/** So viel Rohtext steht auf einer unverdichteten Source-Seite. */
const RAW_LEAD_CHARS = 700;
/** Wie viele Bestandsseiten das Modell zu sehen bekommt. */
const KNOWN_LIMIT = 40;

export interface IngestSourceInput {
  /** Rohquelle, vault-relativ: Ordner unter `raw/` oder Datei. */
  rawPath: string;
  module: string;
  title: string;
  /** Der Text der Quelle (Transcript, Artikel, Datei-Inhalt). */
  text: string;
  /** Herkunft, falls bekannt: URL oder Ursprungspfad. */
  origin?: string | null;
  tags?: readonly string[];
  /** Slug-Grundlage der Source-Seite; Vorgabe ist der Titel. */
  slug?: string;
  /**
   * Woraus die Seite entstand. Vorgabe `'transcript'` — der bisherige Weg bleibt
   * damit byteidentisch. `'metadata'` ist ein ausdruecklicher Klick der Nutzerin
   * (guardrail 2), nie ein stiller Rueckfall bei einer leeren Rohquelle.
   */
  basis?: 'transcript' | 'metadata';
}

/** Seiten des Moduls als Hinweis fuer das Modell — Slug, Titel, erster Absatz. */
export function knownPages(index: WikiIndexView, module: string): KnownPageHint[] {
  return index
    .pages()
    .filter((page) => page.module === module && page.type !== 'overview')
    .slice(0, KNOWN_LIMIT)
    .map((page) => ({ slug: page.slug, title: page.title, excerpt: page.excerpt }));
}

/**
 * Rumpf der Source-Seite: die Verdichtung, dann — falls der Zusammenfuehrungs-
 * Clamp etwas abgeschnitten hat (Story 050, D6) — die Kuerzungs-Notiz, dann der
 * Weg zurueck zur Rohquelle.
 */
function sourceBody(
  markdown: string | null,
  input: IngestSourceInput,
  language: DocLanguage,
  clampedChars: number,
): string {
  const text = phrases(language);
  const origin = input.origin ?? null;
  const lead = markdown ?? `${excerpt(input.text, RAW_LEAD_CHARS)}\n\n${text.notCondensed}`.trim();
  const basisNote = input.basis === 'metadata' ? text.builtFromMetadata : '';
  const notice = promptClampNotice(clampedChars, language);
  const raw = [
    `## ${text.rawSource}`,
    '',
    `- [${input.rawPath}](${input.rawPath})`,
    ...(origin === null || origin.length === 0 || origin === input.rawPath ? [] : [`- ${origin}`]),
  ].join('\n');
  return `${[lead, basisNote, notice, raw].filter((part) => part !== '').join('\n\n')}\n`;
}

/** Die Vorschlaege des Modells holen. Ohne Modell bleibt die Liste leer. */
async function askForPages(
  deps: WikiDeps,
  input: { module: string; sourceSlug: string; sourceTitle: string; summary: string },
): Promise<IngestReply> {
  const empty: IngestReply = { suggestions: [], overviewChange: null };
  if (!deps.gateway.isAvailable('wiki-ingest')) return empty;
  try {
    const result = await deps.gateway.complete({
      task: 'wiki-ingest',
      messages: wikiIngestPrompt(
        { ...input, pages: knownPages(deps.index, input.module) },
        deps.docLanguage ?? 'de',
      ),
      schema: WIKI_INGEST_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    return readIngestReply(parseJsonLoose(result.text), input.module);
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Kein Modell, kaputtes JSON, abgelehnte Anfrage: die Source-Seite steht schon.
    return empty;
  }
}

/**
 * Eine Quelle in ein Modul aufnehmen. Wirft nur, wenn das Modul fehlt oder der
 * Aufrufer abbricht — alles andere ist ein Ergebnis, kein Fehler.
 */
export async function ingestSource(
  deps: WikiIngestDeps,
  input: IngestSourceInput,
): Promise<WikiIngestResult> {
  // Vor dem Slugify pruefen: `slugify('  ')` waere 'notiz' und damit ein Modul,
  // das niemand gemeint hat.
  const named = (input.module ?? '').trim();
  if (named.length === 0) throw new WikiError('invalid', 'Ingest ohne Modul.');
  const module = slugify(named);
  if (!(await deps.store.exists(moduleDir(module)))) {
    throw new WikiError('not-found', `Es gibt kein Modul "${module}".`);
  }
  const language = deps.docLanguage ?? 'de';
  const title = (input.title ?? '').trim().length > 0 ? input.title.trim() : input.rawPath;

  // Das Verdichten schreibt nichts — es steht deshalb vor der Transaktion.
  const condensed = await condenseSource(deps, {
    title,
    text: input.text,
    origin: input.origin ?? input.rawPath,
    known: knownPages(deps.index, module),
  });
  /* Der letzte Tick vor dem Schreiben: alle Stuecke sind verdichtet, der Balken
     darf sichtbar ueber den Verdichtungs-Anteil hinaus weiterwandern, bevor die
     Transaktion beginnt (Story 050, D7). */
  deps.onProgress?.(1);

  /* Ab hier wird geschrieben, und zwar als ein Vorgang: jede Datei geht durch die
     Transaktion, damit ein Fehlschlag nichts halb Verdichtetes stehen laesst. */
  const transaction = new WikiTransaction(deps.store);
  try {
    const result = await writeDigestion({ ...deps, store: transaction }, input, {
      module,
      title,
      language,
      condensed,
    });
    transaction.commit();
    return result;
  } catch (error) {
    await takeBack(transaction);
    // Der Aufrufer braucht den echten Grund — nicht den des Rueckwegs.
    throw error;
  }
}

/**
 * The way back after a failed digestion. What the rollback cannot undo (a file
 * somebody else has changed since, a store that no longer writes at all) must not
 * replace the reason the digestion failed: the caller keeps the original error and
 * the incomplete way back is a warning.
 */
async function takeBack(transaction: WikiTransaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch (error) {
    console.warn('[wiki/ingest] Rueckweg nach einem Fehlschlag unvollstaendig:', error);
  }
}

/** Was der schreibende Teil ausser dem Store schon weiss. */
interface DigestionPhase {
  module: string;
  title: string;
  language: DocLanguage;
  condensed: CondenseResult;
}

/** Was der zweite gesperrte Abschnitt aus dem ersten mitbekommt. */
interface DigestionTail {
  now: DateLike;
  day: string;
  source: { ref: PageRef; created: boolean };
  reply: IngestReply;
}

/**
 * Der schreibende Teil, in der Reihenfolge aus docs/MODULE-SCHEMA.md. `deps.store`
 * ist hier die Transaktion — jeder Aufruf, der eine Datei anfasst, geht darueber,
 * auch die der Mitspieler (`applySuggestions`, `appendLog`, `markRawProtocol`).
 *
 * Zwei gesperrte Abschnitte mit dem Modellaufruf dazwischen. Die Sperre wird
 * ausdruecklich **nicht** ueber den Aufruf gehalten (Story 050, D-d) — und weil
 * `withModuleLock` nicht wiedereintrittsfaehig ist, stehen die Abschnitte
 * nebeneinander und nie ineinander.
 */
async function writeDigestion(
  deps: WikiDeps,
  input: IngestSourceInput,
  phase: DigestionPhase,
): Promise<WikiIngestResult> {
  const { module, title, language, condensed } = phase;
  const now = deps.now ?? new Date();
  const day = isoDay(now);

  /* Auch die Source-Seite gehoert unter die Sperre: `createPage` sucht sich den
     freien Slug ueber `exists`, zwei gleichzeitige Laeufe griffen sonst nach
     demselben und einer davon bekaeme „Die Datei existiert bereits". */
  const source = await withModuleLock(module, () =>
    writeSourcePage(deps, input, {
      module,
      title,
      language,
      now,
      // Platz fuer 's-JJJJ-MM-TT-': sonst kappt slugify genau die Datumsmarke wieder weg.
      slugBase: sourceSlugOf(day, slugify(input.slug ?? title, MAX_SLUG_LENGTH - 14)),
      body: sourceBody(condensed.markdown, input, language, condensed.clampedChars),
      condensed: condensed.markdown !== null,
    }),
  );

  const reply =
    condensed.markdown === null
      ? { suggestions: [], overviewChange: null }
      : await askForPages(deps, {
          module,
          sourceSlug: source.ref.slug,
          sourceTitle: title,
          summary: condensed.markdown,
        });

  return withModuleLock(module, () =>
    finishDigestion(deps, input, phase, { now, day, source, reply }),
  );
}

/**
 * Der zweite gesperrte Abschnitt: Entitaeten und Konzepte, `overview.md`,
 * Katalog, Chronik, Protokollvermerk. Genau die Dateien, die sich zwei
 * Verdichtungen desselben Moduls teilen — deshalb liegt hier die Sperre.
 */
async function finishDigestion(
  deps: WikiDeps,
  input: IngestSourceInput,
  phase: DigestionPhase,
  tail: DigestionTail,
): Promise<WikiIngestResult> {
  const { module, title, language, condensed } = phase;
  const { now, day, source, reply } = tail;
  const text = phrases(language);

  const applied = await applySuggestions(deps, {
    module,
    sourceSlug: source.ref.slug,
    suggestions: reply.suggestions,
  });

  const overviewUpdated = await updateOverview(deps, module, source.ref.slug, reply.overviewChange);
  const touched = [
    source.ref.path,
    ...applied.written,
    ...(overviewUpdated ? [pagePath(module, 'overview', 'overview')] : []),
  ];

  const entries: WikiIndexEntry[] = [
    {
      type: 'source',
      slug: source.ref.slug,
      summary:
        condensed.markdown === null
          ? text.notCondensedShort
          : excerpt(condensed.markdown, SUMMARY_CHARS),
    },
    ...applied.pages.map((page) => ({
      type: page.ref.type,
      slug: page.ref.slug,
      summary: page.summary,
    })),
  ];
  /* Wie die Chronik: mit dem Hash des gerade Gelesenen schreiben, und wenn
     jemand dazwischenkam, neu lesen und die Eintraege in *dessen* Katalog
     setzen — hoechstens dreimal (Story 050, D-e). */
  const indexPath = wikiIndexPath(module);
  await writeTextWithRetry(deps.store, indexPath, (current) =>
    upsertEntries(current?.content ?? `# ${text.catalog}\n\n${text.catalogIntro}\n`, entries, {
      language,
    }),
  );
  touched.push(indexPath);

  const log = await appendLog(
    deps.store,
    module,
    {
      kind: 'ingest',
      title,
      day,
      summary: source.ref.path,
      touched: [...applied.pages.map((page) => `[[${page.ref.slug}]]`), 'index.md'],
      ...(applied.contradictions.length === 0
        ? {}
        : {
            notes: applied.contradictions
              .map((entry) => `[[${entry.page}]]: ${entry.note}`)
              .join(' · '),
          }),
    },
    { now, language },
  );
  touched.push(log.path);

  await markRawProtocol(deps.store, input.rawPath, source.ref.slug, module);

  return {
    module,
    sourcePage: source.ref.path,
    sourceSlug: source.ref.slug,
    touchedPages: touched,
    createdPages: [
      // Ein zweiter Versuch schreibt in eine bestehende Seite zurueck — die ist
      // nicht neu entstanden.
      ...(source.created ? [source.ref.path] : []),
      ...applied.pages.filter((page) => page.action === 'create').map((page) => page.ref.path),
    ],
    contradictions: applied.contradictions,
    usedLlm: condensed.usedLlm,
    overviewUpdated,
    model: condensed.model,
  };
}

/** Was die Source-Seite ausser dem Store und der Eingabe braucht. */
interface SourcePagePlan {
  module: string;
  title: string;
  language: DocLanguage;
  now: DateLike;
  /** Slug, den eine **neue** Seite bekommt — mit Datumsmarke. */
  slugBase: string;
  body: string;
  /** Hat ein Modell verdichtet? Steht so auch im Frontmatter. */
  condensed: boolean;
}

/**
 * Die Source-Seite schreiben — neu, oder in eine liegengebliebene zurueck.
 *
 * Der Normalfall legt an; `createPage` sucht sich dabei einen freien Slug. Der
 * andere Fall ist der harte Abbruch: ein `SIGKILL` oder ein Stromausfall laesst den
 * Rueckweg der Transaktion nicht mehr laufen, also steht die Seite dieser Rohquelle
 * schon, ohne dass das Protokoll je davon erfahren hat. Ein zweiter Versuch
 * schreibt dann in genau diese Seite zurueck, statt `…-2` daneben zu legen
 * (Story 050, D-c).
 *
 * Zwei Bedingungen, und die zweite ist die wichtige: die Seite zeigt mit `raw` auf
 * genau diese Rohquelle, **und** das Protokoll kennt die Quelle fuer dieses Modul
 * noch nicht. Ohne die zweite wuerde eine bewusst zweite Verdichtung derselben
 * Quelle die erste ueberschreiben — die gehoert weiter daneben.
 */
async function writeSourcePage(
  deps: WikiDeps,
  input: IngestSourceInput,
  plan: SourcePagePlan,
): Promise<{ ref: PageRef; created: boolean }> {
  const extra: Record<string, unknown> = {
    raw: input.rawPath,
    ...(input.origin === undefined || input.origin === null ? {} : { origin: input.origin }),
    // Nur bei 'metadata' schreiben: 'transcript' (oder fehlend) bleibt byteidentisch zum Bisherigen.
    ...(input.basis === 'metadata' ? { source_basis: 'metadata' } : {}),
  };
  const leftover = await findSourcePageForRaw(
    { store: deps.store, docs: deps.index.index().docs },
    plan.module,
    input.rawPath,
  );

  if (leftover !== null && !(await isRawDigestedInto(deps.store, input.rawPath, plan.module))) {
    await writePage(
      deps.store,
      leftover.ref.path,
      {
        frontmatter: {
          ...extra,
          title: plan.title,
          /* Ausdruecklich, in beide Richtungen: ein Frontmatter-Patch kann kein Feld
             entfernen, und ein geerbtes `condensed: false` wuerde eine inzwischen
             verdichtete Seite weiter unverdichtet nennen. */
          condensed: plan.condensed,
          ...(input.tags === undefined || input.tags.length === 0 ? {} : { tags: [...input.tags] }),
        },
        body: plan.body,
        expectedHash: leftover.doc.hash,
        now: plan.now,
      },
      plan.language,
    );
    return { ref: { ...leftover.ref, title: plan.title }, created: false };
  }

  const created = await createPage(deps.store, {
    module: plan.module,
    type: 'source',
    title: plan.title,
    slug: plan.slugBase,
    body: plan.body,
    tags: input.tags ?? [],
    now: plan.now,
    language: plan.language,
    extra: { ...extra, ...(plan.condensed ? {} : { condensed: false }) },
  });
  return { ref: created.ref, created: true };
}

/**
 * `overview.md` nachziehen — nur wenn das Modell eine wesentliche Aenderung meldet.
 * Eine Quelle allein verschiebt die Synthese selten; jeder Ingest wuerde sie sonst
 * zu einer zweiten Chronik machen.
 *
 * `overview.md` ist wie `index.md` und `log.md` modul-gemeinsam und von aussen
 * erreichbar — durch einen Pflegelauf oder eine Hand-Bearbeitung, die am
 * Modul-Lock vorbeigeht, weil dieses Lock nur innerhalb dieses Prozesses gilt.
 * Der Hash, den diese Funktion selbst liest, wird darum wie bei der Chronik und
 * dem Katalog erneut gelesen und der Schreibversuch wiederholt — hoechstens
 * `MAX_WRITE_ATTEMPTS`-mal (Story 050, D-e).
 */
async function updateOverview(
  deps: WikiDeps,
  module: string,
  slug: string,
  change: string | null,
): Promise<boolean> {
  if (change === null || change.trim().length === 0) return false;
  const path = pagePath(module, 'overview', 'overview');
  const trimmed = change.trim();
  const text = phrases(deps.docLanguage ?? 'de');
  const line = `- ${trimmed} ${sourceRef(slug)}`;

  for (let attempt = 1; ; attempt += 1) {
    const doc = await deps.store.read(path);
    if (doc === null) return false;
    if (doc.body.includes(trimmed)) return false;
    try {
      await writePage(
        deps.store,
        path,
        {
          body: appendUnderSection(doc.body, text.decided, line),
          addSources: [slug],
          expectedHash: doc.hash,
          ...(deps.now === undefined ? {} : { now: deps.now }),
        },
        deps.docLanguage ?? 'de',
      );
      return true;
    } catch (error) {
      if (attempt >= MAX_WRITE_ATTEMPTS || !isConflict(error)) throw error;
    }
  }
}
