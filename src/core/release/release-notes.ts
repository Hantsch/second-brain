// Inputs come from a changelog file or a remote release body; both are bounded so a
// hostile or runaway document cannot stall the caller.
const MAX_INPUT_CHARS = 50_000;
const MAX_OUTPUT_CHARS = 20_000;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
}

/** Body of the changelog section for `version`, or null when absent/empty. */
export function extractVersionSection(changelog: string, version: string): string | null {
  const text = changelog.slice(0, MAX_INPUT_CHARS).replace(/\r\n?/g, '\n');
  const wanted = version.trim().replace(/^v/i, '');
  if (!wanted || wanted.toLowerCase() === 'unreleased') return null;
  const heading = new RegExp(
    `^##[ \\t]+\\[?v?${escapeRegExp(wanted)}\\]?(?:[ \\t]+-.*|[ \\t]*)$`,
    'im',
  );
  const match = heading.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const next = /^##[ \t]/m.exec(rest);
  const body = (next ? rest.slice(0, next.index) : rest).trim();
  return body ? body.slice(0, MAX_OUTPUT_CHARS) : null;
}

/** Maps GitHub-rendered release HTML to markdown; non-HTML input passes through. */
export function htmlReleaseNotesToMarkdown(html: string): string {
  const input = html.slice(0, MAX_INPUT_CHARS);
  // A tag name must be followed by whitespace, `/` or `>`, so a markdown autolink
  // like `<https://x>` is not mistaken for HTML.
  if (!/<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\/?>/i.test(input)) {
    return input.trim().slice(0, MAX_OUTPUT_CHARS);
  }
  const out = input
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<h[1-6]\b[^>]*>/gi, '\n### ')
    .replace(/<\/h[1-6]\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (e) => ENTITIES[e] ?? e)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out.slice(0, MAX_OUTPUT_CHARS);
}
