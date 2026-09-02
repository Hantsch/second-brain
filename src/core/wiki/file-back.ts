/**
 * Eine gute Antwort zurueckschreiben.
 *
 * „War die Antwort wertvoll, wird sie als Seite abgelegt — sonst verschwindet die
 * Erkundung im Chatverlauf" (docs/MODULE-SCHEMA.md). Das ist der Mechanismus, mit
 * dem Fragen das Wissen fuettern: aus der Antwort wird eine Concept-Seite mit
 * Belegen, sie kommt in den Katalog und ein `query`-Eintrag in die Chronik.
 *
 * Die Pfade aus der Antwort (`[[modules/x/wiki/concepts/y.md]]`) werden dabei zu
 * echten Wikilinks (`[[y]]`); ein Pfad, der keine Wiki-Seite ist, wird Text statt
 * eines Links ins Nichts.
 */

import type { Citation, WriteResult } from '@shared/types';
import { excerpt } from '@core/vault/doc';
import { isoDay, moduleDir, slugify, wikiIndexPath } from '@core/vault/paths';
import { isEvidenceExcluded } from './evidence';
import { upsertEntries } from './index-md';
import { appendLog } from './log-md';
import { createPage, pageRefOf } from './pages';
import { phrases } from './text';
import { WikiError } from './types';
import type { PageRef, WikiDeps, WikiIndexView } from './types';

/** Laenge des Katalog-Einzeilers. */
const SUMMARY_CHARS = 120;

export interface FileBackInput {
  module: string;
  /** Titel der neuen Seite — er wird auch ihr Slug. */
  title: string;
  /** Die Antwort, wie sie im Gespraech stand. */
  answer: string;
  /** Die geprueften Belege der Antwort. */
  citations: readonly Citation[];
  /** Die Frage, die zu dieser Antwort fuehrte — sie steht im Chronik-Eintrag. */
  question?: string;
  tags?: readonly string[];
}

export interface FileBackResult {
  page: PageRef;
  write: WriteResult;
  /** Alle geschriebenen Dateien: Seite, Katalog, Chronik. */
  written: string[];
}

/** Ein Zitatpfad als Wikilink, wenn er auf eine Wiki-Seite zeigt. */
function linkFor(path: string, module: string): string | null {
  const ref = pageRefOf(path);
  if (ref === null) return null;
  return ref.module === module ? `[[${ref.slug}]]` : `[[${ref.module}/${ref.slug}]]`;
}

/**
 * Pfad-Marker der Antwort in Wikilinks umschreiben. Ein Pfad ausserhalb der
 * Wiki-Ordner wird als Code gesetzt: ein `[[projects/…]]` waere ein kaputter Link,
 * den der Pflegelauf jede Woche wieder meldet.
 */
export function linkifyAnswer(answer: string, module: string): string {
  return answer.replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g, (all, target: string) => {
    const path = target.trim();
    if (!path.includes('/')) return all;
    const link = linkFor(path, module);
    return link ?? `\`${path}\``;
  });
}

/** Der Abschnitt „Belege": jede Fundstelle mit Pfad und Zeile. */
function evidenceSection(citations: readonly Citation[], module: string, heading: string): string {
  if (citations.length === 0) return '';
  const lines = citations.map((citation) => {
    const link = linkFor(citation.path, module);
    const place = citation.line === null ? citation.path : `${citation.path}:${citation.line}`;
    return `- ${link === null ? place : `${link} — ${place}`}`;
  });
  return `\n\n## ${heading}\n\n${lines.join('\n')}\n`;
}

/** Source-Slugs des eigenen Moduls, die diese Antwort belegen. */
function sourcesOf(citations: readonly Citation[], module: string): string[] {
  const slugs: string[] = [];
  for (const citation of citations) {
    const ref = pageRefOf(citation.path);
    if (ref === null || ref.module !== module || ref.type !== 'source') continue;
    if (!slugs.includes(ref.slug)) slugs.push(ref.slug);
  }
  return slugs;
}

/** Seiten, aus denen die Antwort kam — fuer `- answered from:` in der Chronik. */
function answeredFrom(citations: readonly Citation[], module: string): string[] {
  const entries: string[] = [];
  for (const citation of citations) {
    const entry = linkFor(citation.path, module) ?? citation.path;
    if (!entries.includes(entry)) entries.push(entry);
  }
  return entries;
}

/**
 * Zitate ohne verdichtete Dokumente. Die Retrieval-Seite (`ask.ts`) schliesst
 * `condensed`-Dokumente schon aus, aber `citations` kommt hier ueber IPC herein und
 * koennte veraltet oder von Hand gebaut sein — Guardrail 3 gilt trotzdem, deshalb
 * prueft `fileBack` selbst noch einmal gegen den Index.
 */
function withoutExcludedEvidence(
  citations: readonly Citation[],
  index: WikiIndexView,
): Citation[] {
  const byPath = index.index().byPath;
  return citations.filter((citation) => {
    const doc = byPath.get(citation.path);
    return doc === undefined || !isEvidenceExcluded(doc.docType);
  });
}

/**
 * Antwort als Concept-Seite ablegen. Wirft, wenn das Modul fehlt oder die Antwort
 * leer ist — eine Seite ohne Inhalt waere kein Wissen, sondern Ballast.
 */
export async function fileBack(deps: WikiDeps, input: FileBackInput): Promise<FileBackResult> {
  const named = (input.module ?? '').trim();
  const title = (input.title ?? '').trim();
  const answer = (input.answer ?? '').trim();
  if (named.length === 0 || title.length === 0) {
    throw new WikiError('invalid', 'Zurueckschreiben braucht Modul und Titel.');
  }
  const module = slugify(named);
  if (answer.length === 0) throw new WikiError('invalid', 'Zurueckschreiben braucht eine Antwort.');
  if (!(await deps.store.exists(moduleDir(module)))) {
    throw new WikiError('not-found', `Es gibt kein Modul "${module}".`);
  }

  const language = deps.docLanguage ?? 'de';
  const text = phrases(language);
  const now = deps.now ?? new Date();
  const citations = withoutExcludedEvidence(input.citations, deps.index);
  const body = `${linkifyAnswer(answer, module)}${evidenceSection(citations, module, text.evidence)}`;

  const created = await createPage(deps.store, {
    module,
    type: 'concept',
    title,
    body,
    tags: input.tags ?? [],
    sources: sourcesOf(citations, module),
    now,
    language,
  });
  const written = [created.ref.path];

  const indexPath = wikiIndexPath(module);
  const before = await deps.store.readText(indexPath);
  const doc = await deps.store.read(indexPath);
  const content = before ?? `# ${text.catalog}\n\n${text.catalogIntro}\n`;
  await deps.store.writeText(
    indexPath,
    upsertEntries(
      content,
      [{ type: 'concept', slug: created.ref.slug, summary: excerpt(answer, SUMMARY_CHARS) }],
      { language },
    ),
    { ...(before === null || doc === null ? {} : { expectedHash: doc.hash }) },
  );
  written.push(indexPath);

  const log = await appendLog(
    deps.store,
    module,
    {
      kind: 'query',
      title: (input.question ?? title).trim(),
      day: isoDay(now),
      answeredFrom: answeredFrom(citations, module),
      filedBack: created.ref.path,
    },
    { now, language },
  );
  written.push(log.path);

  return { page: created.ref, write: created.write, written };
}
