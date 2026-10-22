/* The reference pages of the help module that are not tied to a screen: the vault format
 * (a summary of docs/VAULT-FORMAT.md) and the module's overview text. The agent page lives in
 * pages-agent.ts. */

import { AGENT_PAGE } from './pages-agent';
import { SCREEN_PAGES } from './pages-screens';
import type { HelpPageDef } from './types';

export const VAULT_FORMAT_PAGE: HelpPageDef = {
  slug: 'vault-format',
  tags: ['dateiformat', 'ordner', 'frontmatter', 'ablage'],
  title: 'The vault format',
  summary:
    'The vault is a folder of Markdown files with YAML frontmatter; the files are the truth.',
  body: `# The vault format

The vault is a folder. Everything in it is Markdown with YAML frontmatter, readable in
Obsidian, VS Code or Notepad. The files are the truth: the search index under
\`.secondbrain/index/\` is derived and can be deleted at any time; it is rebuilt from the files.
If it is lost, nothing is lost. You may edit the files directly. Gaston detects an outside
change by its hash and reads the file again, and a write with a stale hash is refused as a
conflict instead of overwriting your edit.

## Folders

- \`inbox/\`: dumps, captured thoughts not yet filed.
- \`journal/YYYY/MM/YYYY-MM-DD.md\`: one day, one file.
- \`projects/<scope>/<slug>/project.md\`: a project, with its optional \`notes/\` and a sibling
  \`condensed.md\`. The scope is \`work\` or \`private\`.
- \`areas/<slug>.md\`: an ongoing responsibility with no end, with a sibling
  \`areas/<slug>.condensed.md\`.
- \`modules/<slug>/\`: one knowledge module, a wiki. It holds \`module.md\`, \`AGENTS.md\` (the
  module's schema) and \`wiki/\` with \`index.md\` (catalogue), \`log.md\` (chronicle),
  \`overview.md\` (synthesis) and the pages in \`sources/\`, \`entities/\` and \`concepts/\`.
- \`raw/\`: immutable sources (YouTube, files, web pages). It is read, never changed.
- \`.secondbrain/\`: derived and internal state: the vault marker \`vault.json\`, vault settings,
  the index, chat histories, logs, trash for undo, and \`agent/\` for the hand-over with Claude
  Code. A folder is a vault exactly when \`.secondbrain/vault.json\` exists.
- \`.claude/\` and \`CLAUDE.md\`: the agent setup, see the agent page.

## Layers of a module

1. \`raw/\` holds the sources, unchanged. Every citation points back to it.
2. \`modules/<slug>/wiki/\` is the wiki, maintained page by page.
3. \`modules/<slug>/AGENTS.md\` is the schema: the conventions and workflows for that module.

## Frontmatter and rules

- Frontmatter is always present and starts on line 1 with \`---\`. Two files carry none:
  \`wiki/index.md\` and \`wiki/log.md\`.
- A page has a \`type\` (source, entity, concept, overview), \`title\`, \`module\`, \`created\`,
  \`updated\`, \`tags\`, \`sources\` and \`lang\`.
- Dates are \`YYYY-MM-DD\`. \`updated\` is set only when the app writes itself.
- File names are lowercase, hyphenated and ASCII.
- Wikilinks \`[[slug]]\` point within a module, \`[[module/slug]]\` across modules.
- Unknown frontmatter fields are preserved. A write merges, it never replaces what you entered.

## What the app never does

- Change or delete an ingested source payload under \`raw/\` (bookkeeping files are the exception).
- Rewrite a line of yours in a Markdown file it did not create.
- Remove frontmatter fields it does not recognise.
- Write without checking the hash first.
- Write an API key into a vault file.
`,
};

/** The pages the module ships, in catalogue order. */
export const HELP_PAGES: readonly HelpPageDef[] = [
  ...Object.values(SCREEN_PAGES),
  VAULT_FORMAT_PAGE,
  AGENT_PAGE,
];

/** Body of `wiki/overview.md`: the entry point that links every page. */
export function overviewText(): string {
  const links = HELP_PAGES.map((page) => `- [[${page.slug}]] — ${page.summary}`);
  return [
    '# Gaston help',
    '',
    'Gaston explains itself from the vault. These pages describe each screen, the vault format and',
    'the agent setup, so a question about how Gaston works can be answered with a citation.',
    '',
    '## Pages',
    '',
    ...links,
    '',
  ].join('\n');
}
