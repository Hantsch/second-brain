/* The one place that talks to `electron-updater`. Everything else sees only the
   plain `check()` result, so the library stays swappable and tests never load it. */

import type { UpdateDistribution, UpdateFailure, UpdateOffer } from '../../shared/types/update';

export const UPDATE_FEED = { provider: 'github', owner: 'Hantsch', repo: 'second-brain' } as const;

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

/** `&amp;` last, so an escaped `&amp;lt;` stays the literal text `&lt;`. */
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function notesToMarkdown(notes: string): string {
  if (!/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(notes)) return notes;
  return notes
    .replace(
      /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi,
      (_, inner: string) => `\n### ${stripTags(inner)}\n`,
    )
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => `\n- ${stripTags(inner)}\n`)
    .split('\n')
    .map((line) => (/^(### |- )/.test(line) ? line : stripTags(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function joinNotes(raw: ReleaseNotes): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  return raw.map((entry) => entry.note ?? '').join('\n\n');
}

function classifyError(error: unknown): UpdateFailure {
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

export function createUpdateChecker(
  options: { autoUpdater?: AutoUpdaterLike } = {},
): UpdateChecker {
  // Memoised only on success: a failed import must be retried on the next check.
  let loaded: AutoUpdaterLike | undefined;

  async function resolve(): Promise<AutoUpdaterLike> {
    if (loaded !== undefined) return loaded;
    let updater = options.autoUpdater;
    if (updater === undefined) {
      const mod = await import('electron-updater');
      // `autoUpdater` is a lazy getter that a packaged bundle only exposes on `default`.
      updater = (mod.autoUpdater ??
        (mod as { default?: { autoUpdater?: unknown } }).default?.autoUpdater) as
        AutoUpdaterLike | undefined;
      if (updater === undefined) throw new Error('electron-updater exposed no autoUpdater');
    }
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.setFeedURL({ ...UPDATE_FEED });
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
          notes: notesToMarkdown(joinNotes(releaseNotes)).slice(0, NOTES_MAX_LENGTH),
          releasedAt: releaseDate ?? null,
        };
      } catch (error) {
        return { kind: 'failed', reason: classifyError(error) };
      }
    },
  };
}
