/* Placeholders for the protection files. Their content, runtime and file names belong to
 * the later protection story; they exist now so the registry and installer have the
 * final set of paths to manage. */

import type { SetupTemplate } from '../setup-types';

export const SETTINGS_TEMPLATE: SetupTemplate = {
  id: 'settings',
  path: '.claude/settings.json',
  version: 1,
  format: 'json',
  body: `{
  "permissions": {
    "deny": []
  }
}
`,
};

const HOOK_PLACEHOLDER = `#!/usr/bin/env bash
# Placeholder. The check arrives with Gaston's protection rules.
exit 0
`;

export const HOOK_SHELL_GUARD_TEMPLATE: SetupTemplate = {
  id: 'hook-gaston-shell-guard',
  path: '.claude/hooks/gaston-shell-guard.sh',
  version: 1,
  format: 'script',
  body: HOOK_PLACEHOLDER,
};

export const HOOK_WIKI_CHECK_TEMPLATE: SetupTemplate = {
  id: 'hook-gaston-wiki-check',
  path: '.claude/hooks/gaston-wiki-check.sh',
  version: 1,
  format: 'script',
  body: HOOK_PLACEHOLDER,
};
