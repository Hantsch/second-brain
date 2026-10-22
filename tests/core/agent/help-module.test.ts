import { describe, expect, it } from 'vitest';
import { HELP_AGENT_PAGE, HELP_MODULE_SLUG } from '@shared/help-module';
import { HELP_MODULE_VERSION } from '@core/agent/help/version';
import { renderHelpModule } from '@core/agent/help/render';
import { parseMarker } from '@core/agent/setup-marker';
import { parse } from '@core/vault/frontmatter';
import { SCREENS } from '@renderer/lib/screens';

const ROOT = `modules/${HELP_MODULE_SLUG}`;
/** Files that carry no frontmatter and hold the comment marker instead. */
const COMMENT_MARKED = [`${ROOT}/AGENTS.md`, `${ROOT}/wiki/index.md`];

describe('help module content', () => {
  it('every rail screen has a help page', () => {
    const paths = renderHelpModule().map((file) => file.path);

    for (const screen of SCREENS) {
      expect(paths, `page for screen "${screen.id}"`).toContain(
        `${ROOT}/wiki/concepts/screen-${screen.id}.md`,
      );
    }
    expect(paths).toContain(`${ROOT}/wiki/concepts/vault-format.md`);
    expect(paths).toContain(HELP_AGENT_PAGE);
  });

  it('every help file carries the Gaston marker and version', () => {
    const files = renderHelpModule();
    expect(files.length).toBeGreaterThan(SCREENS.length);

    for (const file of files) {
      if (COMMENT_MARKED.includes(file.path)) {
        const marker = parseMarker(file.content);
        expect(marker?.version, file.path).toBe(HELP_MODULE_VERSION);
        expect(marker?.id, file.path).toMatch(/^help-/);
        continue;
      }
      const { frontmatter } = parse(file.content);
      expect(frontmatter['managed_by'], file.path).toBe('gaston');
      expect(frontmatter['template_version'], file.path).toBe(HELP_MODULE_VERSION);
    }
  });

  it('pages are English concept pages of the help module', () => {
    const pages = renderHelpModule().filter((file) => file.path.includes('/wiki/concepts/'));

    for (const page of pages) {
      const { frontmatter } = parse(page.content);
      expect(frontmatter['type'], page.path).toBe('concept');
      expect(frontmatter['module'], page.path).toBe(HELP_MODULE_SLUG);
      expect(frontmatter['lang'], page.path).toBe('en');
      expect(frontmatter['sources'], page.path).toEqual([]);
    }
  });

  it('renders the same text on every call', () => {
    expect(renderHelpModule()).toEqual(renderHelpModule());
  });
});
