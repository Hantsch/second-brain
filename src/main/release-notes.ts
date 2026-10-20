/* Notes of the installed version, cut out of the CHANGELOG.md bundled with the
   app, so they are readable offline and match exactly what shipped. */

import { readFileSync } from 'node:fs';
import { extractVersionSection } from '@core/release/release-notes';
import type { ReleaseNotes } from '@shared/ipc';
import changelogRaw from '../../CHANGELOG.md?raw';

/** The CHANGELOG.md text as bundled into the app. */
export const BUNDLED_CHANGELOG: string = changelogRaw;

const ENV_VAR = 'SB_E2E_CHANGELOG';

/** Unset: the bundled text. Set: that file instead; unreadable means no notes, never a throw. */
function changelogText(): string | null {
  const override = process.env[ENV_VAR];
  if (!override) return BUNDLED_CHANGELOG;
  try {
    return readFileSync(override, 'utf8');
  } catch {
    return null;
  }
}

export function installedReleaseNotes(version: string): ReleaseNotes {
  const text = changelogText();
  return { version, markdown: text === null ? null : extractVersionSection(text, version) };
}
