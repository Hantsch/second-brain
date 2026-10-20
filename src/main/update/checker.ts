/* The one place that talks to `electron-updater`. Everything else sees only the
   plain `check()` result, so the library stays swappable and tests never load it. */

import { htmlReleaseNotesToMarkdown } from '@core/release/release-notes';
import type { UpdateDistribution, UpdateFailure, UpdateOffer } from '../../shared/types/update';

export const UPDATE_FEED = { provider: 'github', owner: 'Hantsch', repo: 'second-brain' } as const;

/** Append `v<version>` for the release page of one version. */
export const RELEASE_TAG_URL_PREFIX = `https://github.com/${UPDATE_FEED.owner}/${UPDATE_FEED.repo}/releases/tag/v`;

export type UpdateCheckResult =
  | { kind: 'up-to-date' }
  | ({ kind: 'available' } & UpdateOffer)
  | { kind: 'failed'; reason: UpdateFailure };

export interface UpdateChecker {
  check(): Promise<UpdateCheckResult>;
}

type ReleaseNotes = string | Array<{ note?: string | null }> | null | undefined;

export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  setFeedURL(options: unknown): void;
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean;
    updateInfo: { version: string; releaseNotes?: ReleaseNotes; releaseDate?: string | null };
  } | null>;
}

/** Notes come from a foreign feed: capped, and never rendered as HTML. */
const NOTES_MAX_LENGTH = 20_000;

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
]);

export function detectDistribution(env: Record<string, string | undefined>): UpdateDistribution {
  const dir = env['PORTABLE_EXECUTABLE_DIR'];
  return typeof dir === 'string' && dir !== '' ? 'portable' : 'installed';
}

function joinNotes(raw: ReleaseNotes): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  return raw.map((entry) => entry.note ?? '').join('\n\n');
}

export function classifyError(error: unknown): UpdateFailure {
  const info = (typeof error === 'object' && error !== null ? error : {}) as {
    statusCode?: unknown;
    code?: unknown;
  };
  if (typeof info.statusCode === 'number') return 'http';
  const code = typeof info.code === 'string' ? info.code : '';
  if (NETWORK_CODES.has(code)) return 'network';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (code.startsWith('ERR_UPDATER_') || /yaml|parse|latest\.yml/i.test(message)) return 'feed';
  return 'unknown';
}

/**
 * One export of `electron-updater`. Check and download share the `autoUpdater`
 * singleton on purpose: a download needs the update info its check left behind.
 */
export async function importUpdaterExport(
  name: 'autoUpdater' | 'CancellationToken',
): Promise<unknown> {
  const mod = (await import('electron-updater')) as unknown as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  // `autoUpdater` is a lazy getter that a packaged bundle only exposes on `default`.
  const value = mod[name] ?? mod.default?.[name];
  if (value === undefined) throw new Error(`electron-updater exposed no ${name}`);
  return value;
}

/** Nothing downloads or installs on its own: every step is the user's explicit action. */
export function configureAutoUpdater(updater: AutoUpdaterLike): void {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.setFeedURL({ ...UPDATE_FEED });
}

export function createUpdateChecker(
  options: { autoUpdater?: AutoUpdaterLike } = {},
): UpdateChecker {
  // Memoised only on success: a failed import must be retried on the next check.
  let loaded: AutoUpdaterLike | undefined;

  async function resolve(): Promise<AutoUpdaterLike> {
    if (loaded !== undefined) return loaded;
    const updater =
      options.autoUpdater ?? ((await importUpdaterExport('autoUpdater')) as AutoUpdaterLike);
    configureAutoUpdater(updater);
    loaded = updater;
    return updater;
  }

  return {
    async check() {
      try {
        const result = await (await resolve()).checkForUpdates();
        if (result === null || !result.isUpdateAvailable) return { kind: 'up-to-date' };
        const { version, releaseNotes, releaseDate } = result.updateInfo;
        return {
          kind: 'available',
          version,
          notes: htmlReleaseNotesToMarkdown(joinNotes(releaseNotes)).slice(0, NOTES_MAX_LENGTH),
          releasedAt: releaseDate ?? null,
        };
      } catch (error) {
        return { kind: 'failed', reason: classifyError(error) };
      }
    },
  };
}
