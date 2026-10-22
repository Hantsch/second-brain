/**
 * Recording a rejection in the human-owned `Direktiven`/`Directives` section of
 * `areas/<slug>.condensed.md` (story 038, D3; docs/VAULT-FORMAT.md, section
 * "Condensed area").
 *
 * A rejected proposal must leave a trace the *next* run can read, and the only
 * place in this file that belongs to the human is that section — so a rejection
 * reason is appended there as one more line. What the section already holds is
 * never rewritten: an older directive and an older rejection both stay, in the
 * order they were written, oldest first.
 *
 * Two rules make this safe:
 *
 * - **One reason is one line.** The reason comes from a free-text field, so it
 *   is collapsed to a single line and, where it would otherwise start a Markdown
 *   block, escaped. Otherwise a reason could open an unclosed code fence or add
 *   a `##` heading — and `findSections()` would then read the next run's file
 *   with a section boundary the human never wrote, which is exactly how a
 *   directive gets lost without anyone noticing.
 * - **Nothing else in the file changes.** Unlike a condensation run — which
 *   parses the whole artifact and recomposes it, deliberately re-rendering the
 *   three machine headings and every section's `Aus:`/`From:` line in the
 *   *current* document language — a rejection must be a surgical edit. Going
 *   through `parseCondensedArtifact` → `composeCondensedArtifact` here would
 *   rewrite `## Stand`/`## Muster`/`## Offen` (or their English counterparts)
 *   into whichever language happens to be passed in, even though the artifact
 *   on disk may be in the other one — a silent body rewrite that "writes
 *   nothing to the artifact body" explicitly forbids. So this module edits the
 *   *raw* text directly: it finds the directives section (or, if none exists
 *   yet, decides where a new one belongs) and splices in one line, touching no
 *   other byte of the file.
 */

import type { DocLanguage } from '@shared/types';
import { serialize, splitFrontmatterBlock } from '@core/vault/frontmatter';
import { sectionKindOf, sectionNameFor } from '@core/vault/section-names';
import { findSection, findSections } from '@core/vault/sections';
import { CONDENSED_TYPE } from './artifact';

/** Heading level every condensed-area section uses (docs/VAULT-FORMAT.md). */
const DIRECTIVES_LEVEL = 2;

/**
 * Line starts that `core/vault/sections.ts` reads as document structure: an ATX
 * heading, or a code fence (which, left unclosed, hides every heading after it).
 */
const BLOCK_START = /^(#{1,6}\s|`{3}|~{3})/;

/**
 * One directive line out of arbitrary user text: no line breaks left to break
 * out of the section, and no leading marker left to pose as structure. The
 * backslash is Markdown's own escape, so the reason still reads as written.
 */
function asSingleLine(reason: string): string {
  const collapsed = reason.replace(/\s+/g, ' ').trim();
  return BLOCK_START.test(collapsed) ? `\\${collapsed}` : collapsed;
}

/**
 * `currentContent` with `reason` appended to its directives section, as a whole
 * file ready to be written.
 *
 * `currentContent` is `null` when the area has never been condensed: the
 * rejection is then the only thing known about it, so the result is a minimal
 * artifact — `type: condensed` and the directives section, nothing else. It
 * deliberately does not go through `emptyCondensedArtifact()` + compose, which
 * would emit the three machine headings with nothing under them and claim a
 * state, patterns and open list that no run has ever produced.
 *
 * `type` is the frontmatter `type:` of that minimal file. It differs per level: a
 * module overview is a wiki page (`overview`), so a file written for it must not
 * claim to be a `condensed` artifact. It is ignored when a file already exists.
 *
 * A reason that is blank once collapsed adds no line; the rest of the file is
 * still returned unchanged.
 */
export function appendDirective(
  currentContent: string | null,
  reason: string,
  language: DocLanguage = 'de',
  type: string = CONDENSED_TYPE,
): string {
  const line = asSingleLine(reason);

  if (currentContent === null) {
    const heading = `## ${sectionNameFor('directives', language)}`;
    return serialize({ type }, join([heading, line], '\n\n'));
  }

  if (line.length === 0) return currentContent;

  return spliceDirectiveLine(currentContent, line, language);
}

/**
 * Inserts `line` into `content`'s directives section without composing the
 * document anew. If the section already exists, `line` lands right after its
 * last content line — whatever heading spelling and whatever else the file
 * holds (frontmatter, preamble, the three machine sections, foreign `##`
 * sections) is copied through byte for byte. If it doesn't exist yet, a new
 * section is appended at the very end of the file, under a heading inferred
 * from the language the *other* sections are already written in — falling
 * back to `language` only when the file gives no hint (e.g. an artifact with
 * no sections at all yet).
 */
function spliceDirectiveLine(content: string, line: string, language: DocLanguage): string {
  const { prefix, body } = splitFrontmatterBlock(content);
  const existingHeading = existingDirectivesHeading(body);

  if (existingHeading !== null) {
    return `${prefix}${insertIntoSection(body, existingHeading, line)}`;
  }

  const heading = sectionNameFor('directives', inferredLanguage(body) ?? language);
  return `${prefix}${appendNewSection(body, heading, line)}`;
}

/** The exact heading spelling of the directives section already in `body`, or
    `null` if it has none yet — the first heading of that kind wins, mirroring
    `./artifact`'s own `readBody()` rule. */
function existingDirectivesHeading(body: string): string | null {
  for (const range of findSections(body, DIRECTIVES_LEVEL)) {
    if (sectionKindOf(range.heading) === 'directives') return range.heading.trim();
  }
  return null;
}

/**
 * Which document language the file's *other* sections are already written in,
 * inferred from their heading spelling — `null` if the file has none of the
 * known section headings to go by.
 */
function inferredLanguage(body: string): DocLanguage | null {
  for (const range of findSections(body, DIRECTIVES_LEVEL)) {
    const kind = sectionKindOf(range.heading);
    if (kind === null || kind === 'directives') continue;
    const heading = range.heading.trim().toLowerCase();
    if (heading === sectionNameFor(kind, 'de').toLowerCase()) return 'de';
    if (heading === sectionNameFor(kind, 'en').toLowerCase()) return 'en';
  }
  return null;
}

/** `line` inserted right after the directives section's last content line,
    before any trailing blank lines — every other line of `body` unchanged. */
function insertIntoSection(body: string, heading: string, line: string): string {
  const range = findSection(body, heading);
  if (range === null) return appendNewSection(body, heading, line);
  const lines = body.split('\n');
  let insertAt = range.end;
  while (insertAt > range.start && isBlank(lines[insertAt - 1])) insertAt -= 1;
  return [...lines.slice(0, insertAt), line, ...lines.slice(insertAt)].join('\n');
}

/** A new `## <heading>` section holding just `line`, appended at the file's
    end — nothing already in `body` is touched. */
function appendNewSection(body: string, heading: string, line: string): string {
  const trimmed = body.replace(/\s+$/, '');
  const block = `## ${heading}\n\n${line}`;
  return `${trimmed.length === 0 ? block : `${trimmed}\n\n${block}`}\n`;
}

function isBlank(text: string | undefined): boolean {
  return (text ?? '').trim().length === 0;
}

function join(parts: readonly string[], separator: string): string {
  return parts.filter((part) => part.length > 0).join(separator);
}
