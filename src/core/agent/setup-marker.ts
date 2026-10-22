/* The in-file ownership marker of a setup file. The manifest is the authority on what
 * Gaston installed; the marker is only the fallback when the manifest is lost, so a
 * file is recognised as Gaston's solely by a marker line in its fixed position — a
 * user file that merely mentions the marker text somewhere stays the user's. */

import type { SetupTemplate } from './setup-types';

export interface SetupMarker {
  id: string;
  version: number;
}

const MARKER_LINE = [
  /^<!-- gaston:managed id=([A-Za-z0-9._-]+) version=(\d+) -->$/,
  /^# gaston:managed id=([A-Za-z0-9._-]+) version=(\d+)$/,
];

function markerText(template: SetupTemplate): string {
  return `gaston:managed id=${template.id} version=${template.version}`;
}

/** Index of the line that closes a leading YAML frontmatter, or -1. */
function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0] !== '---') return -1;
  return lines.indexOf('---', 1);
}

/** The file content Gaston writes for a template: its body plus the marker. */
export function renderSetupFile(template: SetupTemplate): string {
  const marker = markerText(template);
  switch (template.format) {
    case 'json':
      return template.body;
    case 'markdown':
      return `<!-- ${marker} -->\n${template.body}`;
    case 'markdown-frontmatter': {
      // Claude Code only reads a skill's frontmatter when `---` is the very first line.
      const lines = template.body.split('\n');
      const end = frontmatterEnd(lines);
      if (end < 0) return `<!-- ${marker} -->\n${template.body}`;
      lines.splice(end + 1, 0, `<!-- ${marker} -->`);
      return lines.join('\n');
    }
    case 'script': {
      // A shebang only works on line 1.
      if (!template.body.startsWith('#!')) return `# ${marker}\n${template.body}`;
      const lines = template.body.split('\n');
      lines.splice(1, 0, `# ${marker}`);
      return lines.join('\n');
    }
  }
}

/** The marker in one of the positions `renderSetupFile` puts it, or null. */
export function parseMarker(content: string): SetupMarker | null {
  const lines = content.split(/\r?\n/);
  const candidates = [lines[0]];
  if (lines[0]?.startsWith('#!') === true) candidates.push(lines[1]);
  const end = frontmatterEnd(lines);
  if (end >= 0) candidates.push(lines[end + 1]);
  for (const line of candidates) {
    if (line === undefined) continue;
    for (const pattern of MARKER_LINE) {
      const match = pattern.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        return { id: match[1], version: Number(match[2]) };
      }
    }
  }
  return null;
}
