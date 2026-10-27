/* The templates are the shipped text; docs/agent-setup/ mirrors them byte for byte so the
 * text can be reviewed (and diffed) without reading TypeScript. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { VAULT_CLAUDE_TEMPLATE } from '@core/agent/templates/vault-claude';
import { parse } from '@core/vault/frontmatter';
import { PROPOSAL_FIELDS, PROPOSAL_FILING_FIELDS } from '../../../src/shared/types/agent-proposals';
import { AGENT_DIRS, AGENT_SKILLS } from '../../../src/shared/types/agent-setup';

function mirrorOf(id: string, vaultPath: string): string {
  const extension = vaultPath.slice(vaultPath.lastIndexOf('.'));
  return readFileSync(
    new URL(`../../../docs/agent-setup/${id}${extension}`, import.meta.url),
    'utf8',
  );
}

describe('setup templates', () => {
  it('every setup template matches its docs mirror', () => {
    expect(SETUP_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of SETUP_TEMPLATES) {
      expect(template.body, template.id).toBe(mirrorOf(template.id, template.path));
    }
  });

  // PowerShell 5.1 reads a BOM-less script as ANSI, and the bodies are String.raw literals.
  it('the hook script templates are ASCII and safe to embed', () => {
    const scripts = SETUP_TEMPLATES.filter((template) => template.path.endsWith('.ps1'));
    expect(scripts.length).toBeGreaterThan(0);
    for (const { id, body } of scripts) {
      expect(body, id).toMatch(/^[\n\x20-\x7e]+$/);
      expect(body, id).not.toContain('`');
      expect(body, id).not.toContain('${');
    }
  });

  it('the vault CLAUDE.md names the only direct write target, the log rule, proposals and the protected files', () => {
    const body = VAULT_CLAUDE_TEMPLATE.body;
    const expected = [
      'modules/<slug>/wiki/',
      'wiki/log.md',
      AGENT_DIRS.proposals,
      'wiki/overview.md',
      'modules/gaston-help/',
      'journal/',
      'raw/',
      '.claude/',
      ...Object.values(AGENT_SKILLS),
    ];
    for (const needle of expected) {
      expect(body, needle).toContain(needle);
    }

    // Naming a path is not enough: it has to sit in the sentences that forbid writing it.
    const [writable = '', rest = ''] = body.split('Not directly writable');
    const blocked = rest.split('\n## ')[0] ?? '';
    expect(writable).toMatch(/only direct write target is `modules\/<slug>\/wiki\/`/);
    expect(writable).not.toContain('wiki/overview.md');
    expect(writable).not.toContain('modules/gaston-help/');
    expect(blocked).toMatch(/`wiki\/overview\.md`[^\n]*changes only through a proposal/);
    expect(blocked).toMatch(/`modules\/gaston-help\/`[^\n]*read-only/);
    expect(body).toMatch(/Write `raw\/`, `CLAUDE\.md`, `\.claude\/`/);
  });

  it('the propose skill describes every field Gaston reads', () => {
    const template = SETUP_TEMPLATES.find((candidate) => candidate.id === 'skill-gaston-propose');
    expect(template).toBeDefined();
    const body = template?.body ?? '';
    for (const needle of [
      ...PROPOSAL_FIELDS,
      ...PROPOSAL_FILING_FIELDS,
      AGENT_DIRS.proposals,
      'kind: edit',
      'kind: filing',
    ]) {
      expect(body, needle).toContain(needle);
    }
    // Unquoted colons or ` #` make a proposal unreadable or truncate it, so the skill must say so
    // and show a quoted reason.
    expect(body).toMatch(/^reason: "/m);
    expect(body).toMatch(/Double-quote every frontmatter value that contains a colon/);
    // An S20 setup installed version 1, which has to show as outdated.
    expect(template?.version).toBeGreaterThan(1);
  });

  it('every Gaston skill opens with frontmatter naming it and saying when to use it', () => {
    for (const name of Object.values(AGENT_SKILLS)) {
      const template = SETUP_TEMPLATES.find((candidate) => candidate.id === `skill-${name}`);
      expect(template, name).toBeDefined();
      expect(template?.path).toBe(`.claude/skills/${name}/SKILL.md`);
      expect(template?.format).toBe('markdown-frontmatter');
      const { frontmatter, hadFrontmatter } = parse(template?.body ?? '');
      expect(hadFrontmatter, name).toBe(true);
      expect(frontmatter.name, name).toBe(name);
      expect(String(frontmatter.description ?? ''), name).toMatch(/\bUse (when|for)\b/);
    }
  });
});
