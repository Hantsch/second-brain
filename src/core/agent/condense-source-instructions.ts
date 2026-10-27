/* The English instructions of a condense-source job. They name paths only: the source's
   content stays in the vault, the agent reads it there (story 090). */

import { AGENT_DIRS, type DocLanguage } from '@shared/types';

export interface CondenseSourceInstructionsInput {
  id: string;
  rawPath: string;
  module: string | null;
  language: DocLanguage;
}

const LANGUAGE_NAMES: Record<DocLanguage, string> = { de: 'German', en: 'English' };

export function condenseSourceInstructions(input: CondenseSourceInstructionsInput): string {
  const module = input.module ?? '<module>';
  const wiki = `modules/${module}/wiki`;
  const page = `${wiki}/sources/s-YYYY-MM-DD-<slug>.md`;
  const moduleLine =
    input.module === null
      ? 'Module: not set. Pick the existing module under `modules/` this source fits best.'
      : `Module: \`${input.module}\``;
  return [
    '# Condense a waiting source',
    '',
    `Raw source: \`${input.rawPath}\``,
    moduleLine,
    `Write in: ${LANGUAGE_NAMES[input.language]}`,
    '',
    '1. Read the raw source. Change nothing under `raw/` and never write its `.ingest.json`:',
    '   Gaston books the source itself once your result checks out.',
    `2. Write one new source page \`${page}\` (today's date; the slug in lowercase letters,`,
    '   digits and hyphens). Its frontmatter carries `type: source`, a non-empty `title`,',
    `   \`module: ${module}\` and exactly \`raw: ${input.rawPath}\`. The body states what the`,
    '   source is about and its key statements.',
    `3. Add one line \`- [[s-YYYY-MM-DD-<slug>]] — <one-line summary>\` to \`${wiki}/index.md\``,
    '   under its sources heading.',
    `4. Append one entry to \`${wiki}/log.md\`:`,
    '',
    '   ```',
    '   ## [YYYY-MM-DD] ingest | <title>',
    `   - summary: ${page}`,
    '   ```',
    '',
    `5. Write \`${AGENT_DIRS.results}/${input.id}.md\` with the frontmatter \`status: done\` and`,
    `   \`sourcePage: ${page}\` (the vault-relative path of the page you wrote).`,
    '   If you cannot, write `status: failed` or `status: skipped` with a `reason` instead.',
    '',
  ].join('\n');
}
