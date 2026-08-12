/**
 * Das yt-dlp-Binary: finden, pruefen, auf ausdrueckliche Bitte holen. Portiert aus
 * `../yougrab/src/main/ytdlp.js`.
 *
 * Reihenfolge beim Aufloesen:
 *   1. der in den Einstellungen genannte Pfad,
 *   2. `yt-dlp` im PATH (System-Installation, etwa per winget oder brew),
 *   3. die von der App verwaltete Kopie unter `<binDir>`.
 *
 * **Nie ohne Zustimmung herunterladen.** `installYtdlp` wird ausschliesslich
 * aufgerufen, wenn der Nutzer es angestossen hat — es gibt keinen stillen Aufruf aus
 * `resolveYtdlp` heraus.
 */

import { IngestError } from './types';
import type { FetchLike, IngestFileSystem, ProcessRunner } from './types';

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

const VERSION_TIMEOUT_MS = 20_000;

export type Platform = 'win32' | 'darwin' | 'linux' | string;

export interface YtdlpDeps {
  fs: IngestFileSystem;
  run: ProcessRunner;
  /** Plattform; injiziert, damit die Namenswahl testbar bleibt. */
  platform: Platform;
}

export interface YtdlpStatus {
  available: boolean;
  path: string | null;
  version: string | null;
  /** Woher die gefundene Binary kam. */
  source: 'configured' | 'path' | 'managed' | null;
  /** Wo die verwaltete Kopie liegen wuerde. */
  managedPath: string;
}

/** Standalone-Builds — kein Python auf dem Zielsystem noetig. */
export function assetName(platform: Platform): string {
  if (platform === 'win32') return 'yt-dlp.exe';
  if (platform === 'darwin') return 'yt-dlp_macos';
  return 'yt-dlp_linux';
}

export function managedBinaryPath(
  fs: IngestFileSystem,
  binDir: string,
  platform: Platform,
): string {
  return fs.join(binDir, platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
}

/**
 * CreateProcess durchsucht den PATH, haengt aber kein PATHEXT an — unter Windows
 * muss die Endung deshalb mitgegeben werden.
 */
function pathCandidates(platform: Platform): string[] {
  return platform === 'win32' ? ['yt-dlp.exe', 'yt-dlp.cmd'] : ['yt-dlp'];
}

function isAbsolutePath(path: string): boolean {
  return /^([a-z]:[\\/]|\\\\|\/)/i.test(path);
}

/** `--version` aufrufen. Die Versionsnummer, oder null wenn die Binary nicht laeuft. */
export async function probeVersion(binary: string, deps: YtdlpDeps): Promise<string | null> {
  try {
    const result = await deps.run(binary, ['--version'], { timeoutMs: VERSION_TIMEOUT_MS });
    if (result.code !== 0) return null;
    const version = (result.stdout.trim().split(/\r?\n/)[0] ?? '').trim();
    return version.length > 0 ? version : null;
  } catch {
    return null;
  }
}

/** Wo liegt ein brauchbares yt-dlp? Fragt nur, laedt nichts. */
export async function resolveYtdlp(
  options: { configuredPath?: string | null; binDir: string } & YtdlpDeps,
): Promise<YtdlpStatus> {
  const managedPath = managedBinaryPath(options.fs, options.binDir, options.platform);
  const candidates: { binary: string; source: YtdlpStatus['source'] }[] = [];

  const configured = (options.configuredPath ?? '').trim();
  if (configured.length > 0) candidates.push({ binary: configured, source: 'configured' });
  for (const binary of pathCandidates(options.platform))
    candidates.push({ binary, source: 'path' });
  candidates.push({ binary: managedPath, source: 'managed' });

  for (const candidate of candidates) {
    // Absolute Pfade vorab pruefen, damit wir nicht sinnlos einen Prozess starten.
    if (isAbsolutePath(candidate.binary) && (await options.fs.stat(candidate.binary)) === null) {
      continue;
    }
    const version = await probeVersion(candidate.binary, options);
    if (version !== null) {
      return {
        available: true,
        path: candidate.binary,
        version,
        source: candidate.source,
        managedPath,
      };
    }
  }
  return { available: false, path: null, version: null, source: null, managedPath };
}

export interface InstallProgress {
  received: number;
  /** Gesamtgroesse, wenn der Server sie nennt. */
  total: number | null;
}

export interface InstallOptions extends YtdlpDeps {
  binDir: string;
  fetchImpl: FetchLike;
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
}

/**
 * Den aktuellen Standalone-Build holen. Erst in eine `.part`-Datei, dann umbenennen
 * — ein abgebrochener Download hinterlaesst so keine kaputte Binary. Am Ende wird
 * geprueft, dass die Datei wirklich laeuft; sonst wird sie wieder entfernt.
 */
export async function installYtdlp(options: InstallOptions): Promise<YtdlpStatus> {
  const { fs, binDir, platform } = options;
  const target = managedBinaryPath(fs, binDir, platform);
  const url = `${RELEASE_BASE}/${assetName(platform)}`;

  await fs.mkdir(binDir);
  const tempPath = `${target}.part`;

  let response: Response;
  try {
    response = await options.fetchImpl(url, {
      redirect: 'follow',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    throw new IngestError('io', 'yt-dlp konnte nicht geladen werden.', { cause: error });
  }
  if (!response.ok) {
    throw new IngestError('io', `Download fehlgeschlagen: HTTP ${response.status}.`);
  }

  const totalHeader = response.headers.get('content-length');
  const total = totalHeader === null ? null : Number(totalHeader);
  const data = await readWithProgress(
    response,
    Number.isFinite(total) ? total : null,
    options.onProgress,
  );

  try {
    await fs.writeBytes(tempPath, data);
    if (platform !== 'win32') await fs.chmod(tempPath, 0o755);
    await fs.remove(target);
    await fs.rename(tempPath, target);
  } catch (error) {
    await fs.remove(tempPath).catch(() => undefined);
    throw new IngestError('io', 'yt-dlp konnte nicht gespeichert werden.', { cause: error });
  }

  const executable = await fs.isExecutable(target);
  const version = executable ? await probeVersion(target, options) : null;
  if (version === null) {
    await fs.remove(target).catch(() => undefined);
    throw new IngestError(
      'io',
      'yt-dlp wurde geladen, laeuft aber nicht. Bitte manuell installieren.',
    );
  }
  return { available: true, path: target, version, source: 'managed', managedPath: target };
}

/** Antwortrumpf lesen und dabei den Fortschritt melden. */
async function readWithProgress(
  response: Response,
  total: number | null,
  onProgress?: (progress: InstallProgress) => void,
): Promise<Uint8Array> {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (body === null || body === undefined || typeof body.getReader !== 'function') {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress?.({ received: buffer.byteLength, total });
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done === true) break;
    if (value === undefined) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({ received, total });
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
