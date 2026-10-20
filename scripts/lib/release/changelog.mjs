// Pure Keep-a-Changelog parser/editor: every function takes the changelog text and returns text
// or plain data, so the release flow can be driven without touching a real CHANGELOG.md.
//
// Shape: `## Unreleased` first, then `## <version> — <YYYY-MM-DD>` sections, each with `###`
// category headings holding `- ` bullets.

/** Matches a whole HTML comment; the scaffold placeholder in Unreleased is one. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Seed comment a freshly emptied Unreleased keeps, so the section is never a bare heading. */
export const UNRELEASED_PLACEHOLDER =
  "<!-- Add changes as '- ...' bullets under '### Added' / '### Changed' / '### Fixed' / '### Removed' / '### Security'. -->";

/**
 * @typedef {{ name: string, bullets: string[] }} ChangelogCategory
 * @typedef {{ heading: string, categories: ChangelogCategory[], raw: string }} ChangelogSection
 */

/**
 * Splits the text into its `## ` sections. Input may be CRLF (Windows checkouts); all output is LF,
 * because a stray `\r` would defeat the `$`-anchored heading patterns and misread every section.
 * `bullets` keep indented continuation lines joined by `\n`, so wrapped bullets are not truncated.
 *
 * @param {string} text
 * @returns {{ preamble: string, sections: ChangelogSection[] }}
 */
export function parseChangelog(text) {
  const lines = text.split(/\r?\n/);
  /** @type {number[]} */
  const starts = [];
  lines.forEach((line, i) => {
    if (/^##\s+\S/.test(line)) starts.push(i);
  });
  const preamble = lines.slice(0, starts.length ? starts[0] : lines.length).join('\n');
  const sections = starts.map((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
    const body = lines.slice(start + 1, end);
    return {
      heading: lines[start].replace(/^##\s+/, '').trim(),
      categories: parseCategories(body),
      raw: body.join('\n'),
    };
  });
  return { preamble, sections };
}

/** @param {string[]} body @returns {ChangelogCategory[]} */
function parseCategories(body) {
  /** @type {ChangelogCategory[]} */
  const categories = [];
  /** @type {ChangelogCategory | null} */
  let current = null;
  let open = false;
  for (const line of body) {
    const heading = /^###\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      current = { name: heading[1], bullets: [] };
      categories.push(current);
      open = false;
    } else if (current && /^-\s+/.test(line)) {
      current.bullets.push(line.replace(/^-\s+/, '').trimEnd());
      open = true;
    } else if (line.trim() === '') {
      open = false;
    } else if (open && current) {
      current.bullets[current.bullets.length - 1] += `\n${line}`;
    }
  }
  return categories;
}

/** @param {string} text */
function findUnreleased(text) {
  return parseChangelog(text).sections.find((s) => s.heading === 'Unreleased');
}

/**
 * @param {string} text
 * @returns {{ categories: string[], bullets: string[] }} category names and every bullet, in order.
 */
export function readUnreleased(text) {
  const section = findUnreleased(text);
  const categories = section?.categories ?? [];
  return {
    categories: categories.map((c) => c.name),
    bullets: categories.flatMap((c) => c.bullets),
  };
}

/**
 * @param {string} text
 * @returns {string | null} a refusal reason, or null when Unreleased can be released.
 */
export function validateUnreleased(text) {
  const section = findUnreleased(text);
  if (!section) return 'CHANGELOG.md has no "## Unreleased" section';
  const body = section.raw.replace(HTML_COMMENT, '').trim();
  if (body === '') return '"## Unreleased" is empty or contains only a comment';
  if (readUnreleased(text).bullets.length === 0) {
    return '"## Unreleased" has no "- " bullet items';
  }
  return null;
}

/**
 * Moves the Unreleased body into a new dated section directly below an emptied Unreleased.
 * The body is carried over verbatim (minus comments) rather than re-serialised, so the user's
 * own formatting survives; blank lines around headings keep the result prettier-stable.
 *
 * @param {string} text
 * @param {string} version no leading `v`.
 * @param {string} date `YYYY-MM-DD`.
 * @returns {string}
 */
export function promote(text, version, date) {
  const { preamble, sections } = parseChangelog(text);
  const unreleased = sections.find((s) => s.heading === 'Unreleased');
  if (!unreleased) throw new Error('promote: no "## Unreleased" section found');
  const body = unreleased.raw.replace(HTML_COMMENT, '').trim();
  const rest = sections
    .filter((s) => s !== unreleased)
    .map((s) => `## ${s.heading}\n\n${s.raw.trim()}`);
  const parts = [
    preamble.trim(),
    `## Unreleased\n\n${UNRELEASED_PLACEHOLDER}`,
    `## ${version} — ${date}\n\n${body}`,
    ...rest,
  ];
  return parts.filter((p) => p !== '').join('\n\n') + '\n';
}

/**
 * Body of the `## <version> — ...` section (without its heading), for release notes.
 *
 * @param {string} text
 * @param {string} version no leading `v`.
 * @returns {string}
 */
export function notesFor(text, version) {
  const prefix = `${version} —`;
  const section = parseChangelog(text).sections.find((s) => s.heading.startsWith(prefix));
  if (!section) throw new Error(`notesFor: no "## ${version} — ..." section found`);
  return section.raw.trim() + '\n';
}
