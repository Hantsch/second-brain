/* Renders the help module as a list of vault files. Pure: no store, no clock. The text lives
 * in the pages-*.ts files; this file only adds frontmatter, the Gaston marker and the module's
 * structure files. Every file carries HELP_MODULE_VERSION so a later setup can tell an
 * outdated copy from a current one. */

import { HELP_MODULE_SLUG } from '../../../shared/help-module';
import { serialize } from '../../vault/frontmatter';
import { renderAgentsMd } from '../../wiki/agents-md';
import { entryLine } from '../../wiki/index-md';
import { pageFrontmatter } from '../../wiki/pages';
import { categoryHeading, phrases } from '../../wiki/text';
import { renderSetupFile } from '../setup-marker';
import { HELP_PAGES, overviewText } from './pages-reference';
import { HELP_MODULE_VERSION } from './version';

const MODULE_TITLE = 'Gaston help';
/** A fixed day keeps the rendered text, and so its hash, identical on every render. */
const PAGE_DAY = '2026-01-01';
const ROOT = `modules/${HELP_MODULE_SLUG}`;

/** The marker keys a frontmatter file carries; the comment marker is for files without one. */
const MARKER_KEYS = { managed_by: 'gaston', template_version: HELP_MODULE_VERSION };

/** Template id of a help file: the marker grammar allows letters, digits, dot, dash and
 *  underscore, so the module-relative path is flattened into it. */
export function helpTemplateId(path: string): string {
  const relative = path.slice(ROOT.length + 1);
  return `help-${relative.replace(/[^A-Za-z0-9._-]/g, '-')}`;
}

function markedMarkdown(path: string, body: string): string {
  return renderSetupFile({
    id: helpTemplateId(path),
    path,
    version: HELP_MODULE_VERSION,
    format: 'markdown',
    body,
  });
}

function moduleFile(): string {
  const description =
    'How Gaston works: its screens, the vault format and the agent setup. Maintained by Gaston.';
  const frontmatter = {
    type: 'note',
    title: MODULE_TITLE,
    slug: HELP_MODULE_SLUG,
    module: HELP_MODULE_SLUG,
    description,
    created: PAGE_DAY,
    updated: PAGE_DAY,
    tags: [],
    lang: 'en',
    ...MARKER_KEYS,
  };
  return serialize(
    frontmatter,
    `${description}\n\n## ${phrases('en').moduleScope}\n\nThe screens of the app, the vault format, and how Claude Code works on the vault.\n`,
  );
}

function agentsFile(): string {
  const path = `${ROOT}/AGENTS.md`;
  const note =
    'This module is maintained by Gaston. Treat it as read-only; it is replaced when Gaston ships a newer version. You may add your own pages next to it.';
  return markedMarkdown(path, `${note}\n\n${renderAgentsMd(HELP_MODULE_SLUG, MODULE_TITLE, 'en')}`);
}

function indexFile(): string {
  const text = phrases('en');
  const body = [
    `# ${text.catalog} — ${MODULE_TITLE}`,
    '',
    text.catalogIntro,
    '',
    `## ${categoryHeading('overview', 'en')}`,
    '',
    `- [[overview]] — ${text.synthesis}`,
    '',
    `## ${categoryHeading('concept', 'en')}`,
    '',
    ...HELP_PAGES.map((page) =>
      entryLine({ type: 'concept', slug: page.slug, summary: page.summary }),
    ),
    '',
  ].join('\n');
  return markedMarkdown(`${ROOT}/wiki/index.md`, body);
}

function pageFile(
  type: 'concept' | 'overview',
  title: string,
  body: string,
  tags: readonly string[] = [],
): string {
  return serialize(
    pageFrontmatter({
      type,
      title,
      tags,
      module: HELP_MODULE_SLUG,
      day: PAGE_DAY,
      language: 'en',
      extra: MARKER_KEYS,
    }),
    body,
  );
}

/** Every file of the help module with its vault-relative path (forward slashes). */
export function renderHelpModule(): ReadonlyArray<{ path: string; content: string }> {
  return [
    { path: `${ROOT}/module.md`, content: moduleFile() },
    { path: `${ROOT}/AGENTS.md`, content: agentsFile() },
    { path: `${ROOT}/wiki/index.md`, content: indexFile() },
    {
      path: `${ROOT}/wiki/overview.md`,
      content: pageFile('overview', MODULE_TITLE, overviewText()),
    },
    ...HELP_PAGES.map((page) => ({
      path: `${ROOT}/wiki/concepts/${page.slug}.md`,
      content: pageFile('concept', page.title, page.body, page.tags),
    })),
  ];
}
