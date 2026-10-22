/**
 * Ein verdichtetes Dokument als Datenstruktur: lesen und wieder schreiben
 * (docs/VAULT-FORMAT.md, Abschnitte „Condensed area" und „Condensed project").
 *
 * The set of machine-owned sections is an **argument**, not a constant of this
 * module: `parseArtifact`/`composeArtifact` are handed `CONDENSED_SECTIONS` for
 * an area (`areas/<slug>.condensed.md`) and `PROJECT_SECTIONS` for a project
 * (`projects/<scope>/<slug>/condensed.md`) and `MODULE_SECTIONS` for a module
 * overview (`modules/<slug>/wiki/overview.md`). One round trip, every level — a
 * second copy of it would be a second place the losslessness below can quietly
 * stop being true. The area-level `…CondensedArtifact` functions are thin
 * wrappers that pass `CONDENSED_SECTIONS`, so the area's callers keep one
 * unchanged entry point.
 *
 * Reine Textarbeit — kein Dateisystem, kein Gateway. Ein Kondensationslauf baut
 * die maschinellen Abschnitte neu und schreibt die Datei **ganz** neu. Genau
 * da entsteht stiller Verlust, deshalb ist der Leitsatz dieses Moduls:
 * `compose(parse(x))` verliert nichts aus `x`. Was das Modul nicht kennt, traegt
 * es wortwoertlich weiter:
 *
 * - **Unbekannte Frontmatter-Felder** (`extraFrontmatter`) — dieselbe Regel wie in
 *   `vault/frontmatter.ts`: die App entfernt nie, was sie nicht kennt.
 * - **Der Abschnitt `Direktiven`** (`directives`) — er gehoert dem Menschen. Ein
 *   Lauf liest ihn, schreibt ihn aber nie. Er wird als undurchsichtiger Text
 *   durchgereicht, samt seiner vorhandenen Ueberschrift: welche Schreibweise in
 *   der Datei steht, bleibt in der Datei (dieselbe Regel wie `sectionHeadingIn`
 *   fuer die Notizen einer Area). Die maschinellen Ueberschriften folgen
 *   dagegen der Dokumentsprache — sie werden ohnehin bei jedem Lauf neu gesetzt.
 * - **Text ueber der ersten Ueberschrift** (`preamble`) und **fremde
 *   `##`-Abschnitte** (`extraSections`) — von Hand hinzugefuegt und sonst beim
 *   naechsten Lauf spurlos weg.
 *
 * Gelesen wird alias-tolerant ueber `vault/section-names.ts`, damit eine Datei
 * mit englischen Ueberschriften nach einem Sprachwechsel nicht als leer gilt und
 * ihre Abschnitte doppelt bekommt.
 */

import type { DocLanguage } from '@shared/types';
import { parse, serialize } from '@core/vault/frontmatter';
import type { Frontmatter } from '@core/vault/frontmatter';
import { canonicalOrder } from '@core/vault/frontmatter-order';
import { sectionKindOf, sectionNameFor } from '@core/vault/section-names';
import type { SectionKind } from '@core/vault/section-names';
import { findSections } from '@core/vault/sections';
import { SOURCE_HASHES_FIELD, sourceHashesIn, sourcePaths } from './sources';

/** Der Dokumenttyp dieser Datei — zugleich der Schluessel der Feldreihenfolge. */
export const CONDENSED_TYPE = 'condensed';

/** Ueberschriftenebene der Abschnitte, wie in docs/VAULT-FORMAT.md gezeigt. */
const SECTION_LEVEL = 2;

/** Frontmatter-Felder, die dieses Modul selbst setzt. Alles andere wird durchgereicht. */
const OWNED_FIELDS: readonly string[] = [
  'type',
  'title',
  'condensed_at',
  'sources',
  SOURCE_HASHES_FIELD,
];

/** Die drei Abschnitte, die ein Lauf einer Area schreibt — `directives` gehoert dem Menschen. */
export type CondensedSectionKind = Extract<SectionKind, 'state' | 'patterns' | 'open'>;

/** Ihre Reihenfolge in der Datei. Stabil, damit Diffs zwischen Laeufen klein bleiben. */
export const CONDENSED_SECTIONS: readonly CondensedSectionKind[] = ['state', 'patterns', 'open'];

/** The four sections a run of a project writes (docs/VAULT-FORMAT.md, story 044). */
export type CondensedProjectSectionKind = Extract<
  SectionKind,
  'state' | 'next-step' | 'waiting-on' | 'learned'
>;

/** Their order in the file — document order, and the same stability argument as above. */
export const PROJECT_SECTIONS: readonly CondensedProjectSectionKind[] = [
  'state',
  'next-step',
  'waiting-on',
  'learned',
];

/** The three sections a run of a module overview writes (docs/VAULT-FORMAT.md, story 081). */
export type CondensedModuleSectionKind = Extract<
  SectionKind,
  'decided' | 'open' | 'contradictions'
>;

/** Their order in the file — the same stability argument as above. */
export const MODULE_SECTIONS: readonly CondensedModuleSectionKind[] = [
  'decided',
  'open',
  'contradictions',
];

/** Ein maschineller Abschnitt: Prosa plus die Pfade, aus denen sie stammt. */
export interface CondensedSectionContent {
  /** Der Fliesstext ohne die `Aus:`/`From:`-Zeile. */
  text: string;
  /** Vault-relative Pfade der Belege dieses Abschnitts. */
  sources: string[];
}

/** Der menschliche Abschnitt, unangetastet. */
export interface CondensedDirectives {
  /** Die Schreibweise aus der Datei; `null` heisst „nimm die Dokumentsprache". */
  heading: string | null;
  /** Inhalt, wortwoertlich. Dieses Modul liest ihn nur. */
  content: string;
}

/** Ein Abschnitt, den dieses Modul nicht deutet und darum unveraendert weitertraegt. */
export interface CondensedExtraSection {
  heading: string;
  level: number;
  content: string;
}

/**
 * Ein verdichtetes Dokument, aufgetrennt in das, was ein Lauf ersetzt, und den
 * Rest. `K` is the machine-owned section set of its level, so the type of an
 * area artifact and of a project artifact differ in exactly that one place.
 */
export interface CondensedArtifact<K extends SectionKind = CondensedSectionKind> {
  title: string;
  /** ISO-8601 mit Zeitzone, gesetzt bei jedem Schreiben. */
  condensedAt: string;
  /** Alle Eingaben, aus denen die Datei gebaut wurde. */
  sources: string[];
  /**
   * Pfad → sha256 des Eingabedokuments zum Zeitpunkt des Laufs (Story 039).
   * Nur eine Anmerkung zu `sources`: ein Pfad ohne Eintrag ist kein Fehler,
   * sondern heisst „dazu weiss die Datei nichts" (siehe `./sources`).
   */
  sourceHashes: Record<string, string>;
  sections: Record<K, CondensedSectionContent>;
  directives: CondensedDirectives;
  /** Jedes Frontmatter-Feld, das dieses Modul nicht besitzt, in Dateireihenfolge. */
  extraFrontmatter: Frontmatter;
  /** Text ueber der ersten Ueberschrift, wortwoertlich. */
  preamble: string;
  /** Fremde Abschnitte, wortwoertlich, in Dateireihenfolge. */
  extraSections: CondensedExtraSection[];
}

/** Ein verdichtetes Projekt (`projects/<scope>/<slug>/condensed.md`). */
export type CondensedProjectArtifact = CondensedArtifact<CondensedProjectSectionKind>;

/**
 * A module overview (`modules/<slug>/wiki/overview.md`). Its `module:`, `created:`
 * and the other wiki keys travel in `extraFrontmatter`; its document type is
 * `overview`, handed to `composeArtifact` by the caller.
 */
export type CondensedModuleArtifact = CondensedArtifact<CondensedModuleSectionKind>;

/** An empty artifact for this section set — the starting point of a first run. */
export function emptyArtifact<K extends SectionKind>(sections: readonly K[]): CondensedArtifact<K> {
  const empty = {} as Record<K, CondensedSectionContent>;
  /* Ein eigenes Objekt je Abschnitt: ein geteiltes `sources`-Array wuerde die
     Belege eines Abschnitts in allen anderen mit auftauchen lassen. */
  for (const kind of sections) empty[kind] = { text: '', sources: [] };
  return {
    title: '',
    condensedAt: '',
    sources: [],
    sourceHashes: {},
    sections: empty,
    directives: { heading: null, content: '' },
    extraFrontmatter: {},
    preamble: '',
    extraSections: [],
  };
}

/** Ein leeres Artefakt — Ausgangspunkt fuer die erste Verdichtung einer Area. */
export function emptyCondensedArtifact(): CondensedArtifact {
  return emptyArtifact(CONDENSED_SECTIONS);
}

/**
 * Die Belegzeile eines Abschnitts in der Dokumentsprache, oder '' ohne Belege —
 * ein nacktes „Aus:" waere eine Behauptung ohne Inhalt.
 */
export function sourceLineFor(sources: readonly string[], docLanguage: DocLanguage = 'de'): string {
  const paths = cleanPaths(sources);
  if (paths.length === 0) return '';
  return `${docLanguage === 'en' ? 'From' : 'Aus'}: ${paths.join(', ')}`;
}

/*
 * Beide Sprachen beim Lesen, damit ein Sprachwechsel die Belege eines bestehenden
 * Abschnitts nicht in seinen Fliesstext kippen laesst.
 */
const SOURCE_LINE = /^(?:from|aus|sources|quellen)\s*:\s*(.*)$/i;

/**
 * Eine bestehende Datei aufbrechen; `sections` sagt, welche Abschnitte dieses
 * Dokument maschinell fuehrt. Alles andere — auch ein zweites Vorkommen eines
 * dieser Abschnitte — bleibt Fremdtext. Wirft nie: kaputtes YAML kommt leer
 * zurueck.
 */
export function parseArtifact<K extends SectionKind>(
  content: string,
  sections: readonly K[],
): CondensedArtifact<K> {
  const parsed = parse(content ?? '');
  const artifact = emptyArtifact(sections);
  artifact.title = textOf(parsed.frontmatter['title']);
  artifact.condensedAt = textOf(parsed.frontmatter['condensed_at']);
  artifact.sources = sourcePaths(parsed.frontmatter);
  artifact.sourceHashes = sourceHashesIn(parsed.frontmatter);
  artifact.extraFrontmatter = unownedFields(parsed.frontmatter);
  readBody(parsed.body, artifact, sections);
  return artifact;
}

/**
 * Aus der Struktur wieder eine ganze Datei machen. `type` is written as the
 * document's `type:` and picks its field order; `type` is an owned field, so
 * parsing never carries it over — the caller of each level states it.
 */
export function composeArtifact<K extends SectionKind>(
  artifact: CondensedArtifact<K>,
  sections: readonly K[],
  docLanguage: DocLanguage = 'de',
  type: string = CONDENSED_TYPE,
): string {
  return serialize(frontmatterOf(artifact, type), bodyOf(artifact, sections, docLanguage));
}

/** Eine bestehende verdichtete Area aufbrechen. */
export function parseCondensedArtifact(content: string): CondensedArtifact {
  return parseArtifact(content, CONDENSED_SECTIONS);
}

/** Aus einer verdichteten Area wieder eine ganze Datei machen. */
export function composeCondensedArtifact(
  artifact: CondensedArtifact,
  docLanguage: DocLanguage = 'de',
): string {
  return composeArtifact(artifact, CONDENSED_SECTIONS, docLanguage);
}

/**
 * Rumpf lesen. Der erste Abschnitt einer Art gewinnt; jedes weitere Vorkommen ist
 * Handarbeit des Nutzers und wandert unveraendert nach `extraSections`, statt
 * beim Schreiben zu verschwinden.
 */
function readBody<K extends SectionKind>(
  body: string,
  artifact: CondensedArtifact<K>,
  sections: readonly K[],
): void {
  const lines = body.split('\n');
  const ranges = findSections(body, SECTION_LEVEL);
  const firstHeading = ranges[0]?.headingLine ?? lines.length;
  artifact.preamble = joinTrimmed(lines.slice(0, firstHeading));
  const seen = new Set<SectionKind>();

  for (const range of ranges) {
    const kind = sectionKindOf(range.heading);
    const content = joinTrimmed(lines.slice(range.start, range.end));
    if (kind !== null && !seen.has(kind)) {
      if (kind === 'directives') {
        artifact.directives = { heading: range.heading.trim(), content };
        seen.add(kind);
        continue;
      }
      if (isMachineSection(kind, sections)) {
        artifact.sections[kind] = splitSourceLine(content);
        seen.add(kind);
        continue;
      }
    }
    artifact.extraSections.push({
      heading: range.heading.trim(),
      level: range.level,
      content,
    });
  }
}

/** Belegzeile vom Fliesstext trennen. Sie ist die letzte Zeile eines Abschnitts. */
function splitSourceLine(content: string): CondensedSectionContent {
  const lines = content.split('\n');
  const match = SOURCE_LINE.exec((lines[lines.length - 1] ?? '').trim());
  if (match === null) return { text: content, sources: [] };
  return { text: joinTrimmed(lines.slice(0, -1)), sources: cleanPaths(splitPaths(match[1] ?? '')) };
}

function frontmatterOf<K extends SectionKind>(
  artifact: CondensedArtifact<K>,
  type: string,
): Frontmatter {
  const hashes = artifact.sourceHashes;
  return orderFields(type, {
    type,
    title: artifact.title.length > 0 ? artifact.title : undefined,
    condensed_at: artifact.condensedAt.length > 0 ? artifact.condensedAt : undefined,
    sources: cleanPaths(artifact.sources),
    /* Ohne Eintraege gar kein Feld: eine leere Abbildung sagt dasselbe wie ihr
       Fehlen und wuerde nur jede Datei um eine Zeile Rauschen laenger machen. */
    [SOURCE_HASHES_FIELD]: Object.keys(hashes).length > 0 ? { ...hashes } : undefined,
    ...artifact.extraFrontmatter,
  });
}

/**
 * Bekannte Felder in die kanonische Reihenfolge (`vault/frontmatter-order.ts`),
 * fremde dahinter in ihrer Dateireihenfolge — sie werden nicht umsortiert.
 */
function orderFields(type: string, fields: Frontmatter): Frontmatter {
  const order = canonicalOrder(type);
  const keys = Object.keys(fields);
  const sorted = [
    ...order.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !order.includes(key)),
  ];
  const result: Frontmatter = {};
  for (const key of sorted) result[key] = fields[key];
  return result;
}

function bodyOf<K extends SectionKind>(
  artifact: CondensedArtifact<K>,
  sections: readonly K[],
  docLanguage: DocLanguage,
): string {
  const blocks: string[] = [];
  if (artifact.preamble.length > 0) blocks.push(artifact.preamble);
  for (const kind of sections) {
    const heading = `## ${sectionNameFor(kind, docLanguage)}`;
    blocks.push(block(heading, sectionBody(artifact.sections[kind], docLanguage)));
  }
  const directives = artifact.directives.heading ?? sectionNameFor('directives', docLanguage);
  blocks.push(block(`## ${directives}`, artifact.directives.content));
  for (const extra of artifact.extraSections) {
    blocks.push(block(`${'#'.repeat(extra.level)} ${extra.heading}`, extra.content));
  }
  return `${blocks.join('\n\n')}\n`;
}

function sectionBody(section: CondensedSectionContent, docLanguage: DocLanguage): string {
  const line = sourceLineFor(section.sources, docLanguage);
  const text = section.text.trim();
  if (line.length === 0) return text;
  return text.length === 0 ? line : `${text}\n\n${line}`;
}

function block(heading: string, content: string): string {
  return content.length === 0 ? heading : `${heading}\n\n${content}`;
}

function isMachineSection<K extends SectionKind>(
  kind: SectionKind,
  sections: readonly K[],
): kind is K {
  return (sections as readonly SectionKind[]).includes(kind);
}

/** Zeilen zusammenfuegen, Leerzeilen nur an den Raendern weg — innen bleibt alles. */
function joinTrimmed(lines: readonly string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? '').trim().length === 0) start += 1;
  while (end > start && (lines[end - 1] ?? '').trim().length === 0) end -= 1;
  return lines.slice(start, end).join('\n');
}

function unownedFields(frontmatter: Frontmatter): Frontmatter {
  const result: Frontmatter = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!OWNED_FIELDS.includes(key)) result[key] = value;
  }
  return result;
}

function splitPaths(text: string): string[] {
  return text.split(',');
}

function cleanPaths(paths: readonly string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
