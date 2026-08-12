/* Das yt-dlp-Binary finden und holen — mit gefaelschtem `spawn` und gefaelschtem
   `fetch`. Kein Test startet einen Prozess und keiner laedt etwas herunter.
   Wichtig ist auch, was NICHT passiert: `resolveYtdlp` laedt nie von selbst. */

import { describe, expect, it } from 'vitest';
import {
  assetName,
  installYtdlp,
  managedBinaryPath,
  probeVersion,
  resolveYtdlp,
} from '@core/ingest';
import { fakeFetch, fakeFileSystem, fakeRun } from './fakes';

const BIN_DIR = 'C:/Users/test/AppData/Roaming/second-brain/bin';
const MANAGED = `${BIN_DIR}/yt-dlp.exe`;

describe('assetName', () => {
  it('waehlt den Standalone-Build je Plattform', () => {
    expect(assetName('win32')).toBe('yt-dlp.exe');
    expect(assetName('darwin')).toBe('yt-dlp_macos');
    expect(assetName('linux')).toBe('yt-dlp_linux');
  });

  it('nennt die verwaltete Kopie', () => {
    const fs = fakeFileSystem();
    expect(managedBinaryPath(fs, BIN_DIR, 'win32')).toBe(MANAGED);
    expect(managedBinaryPath(fs, '/opt/sb/bin', 'linux')).toBe('/opt/sb/bin/yt-dlp');
  });
});

describe('resolveYtdlp', () => {
  it('nimmt den konfigurierten Pfad, wenn er laeuft', async () => {
    const fs = fakeFileSystem({ 'D:/tools/yt-dlp.exe': 'binaer' });
    const run = fakeRun((binary) =>
      binary === 'D:/tools/yt-dlp.exe' ? { stdout: '2026.08.01\n' } : null,
    );

    const status = await resolveYtdlp({
      configuredPath: 'D:/tools/yt-dlp.exe',
      binDir: BIN_DIR,
      fs,
      run: run.runner,
      platform: 'win32',
    });

    expect(status).toEqual({
      available: true,
      path: 'D:/tools/yt-dlp.exe',
      version: '2026.08.01',
      source: 'configured',
      managedPath: MANAGED,
    });
    // Genau ein Aufruf: der konfigurierte Pfad gewinnt, ohne den PATH zu behelligen.
    expect(run.calls).toHaveLength(1);
  });

  it('ueberspringt einen konfigurierten Pfad, den es nicht gibt', async () => {
    const fs = fakeFileSystem();
    const run = fakeRun((binary) => (binary === 'yt-dlp.exe' ? { stdout: '2026.07.01' } : null));

    const status = await resolveYtdlp({
      configuredPath: 'D:/weg/yt-dlp.exe',
      binDir: BIN_DIR,
      fs,
      run: run.runner,
      platform: 'win32',
    });

    expect(status.source).toBe('path');
    expect(status.path).toBe('yt-dlp.exe');
    expect(run.calls.map((call) => call.binary)).not.toContain('D:/weg/yt-dlp.exe');
  });

  it('findet die verwaltete Kopie, wenn im PATH nichts liegt', async () => {
    const fs = fakeFileSystem({ [MANAGED]: 'binaer' });
    const run = fakeRun((binary) => (binary === MANAGED ? { stdout: '2026.08.02' } : null));

    const status = await resolveYtdlp({ binDir: BIN_DIR, fs, run: run.runner, platform: 'win32' });

    expect(status).toMatchObject({ available: true, source: 'managed', version: '2026.08.02' });
    expect(run.calls.map((call) => call.binary)).toEqual(['yt-dlp.exe', 'yt-dlp.cmd', MANAGED]);
  });

  it('sagt ehrlich, wenn nichts da ist — und laedt von selbst nichts', async () => {
    const fs = fakeFileSystem();
    const run = fakeRun(() => null);

    const status = await resolveYtdlp({ binDir: BIN_DIR, fs, run: run.runner, platform: 'linux' });

    expect(status).toEqual({
      available: false,
      path: null,
      version: null,
      source: null,
      managedPath: `${BIN_DIR}/yt-dlp`,
    });
    expect(Object.keys(fs.written())).toEqual([]);
  });

  it('nimmt eine Binary nicht, die nur Muell ausgibt', async () => {
    const fs = fakeFileSystem();
    const run = fakeRun(() => ({ code: 0, stdout: '   \n' }));
    const status = await resolveYtdlp({ binDir: BIN_DIR, fs, run: run.runner, platform: 'linux' });
    expect(status.available).toBe(false);
  });

  it('haelt einen abstuerzenden Prozess aus', async () => {
    const run = fakeRun(() => {
      throw new Error('ENOENT');
    });
    expect(
      await probeVersion('yt-dlp', { fs: fakeFileSystem(), run: run.runner, platform: 'linux' }),
    ).toBeNull();
  });
});

describe('installYtdlp', () => {
  it('laedt, benennt um und prueft, dass die Datei laeuft', async () => {
    const fs = fakeFileSystem();
    const run = fakeRun((binary) => (binary === MANAGED ? { stdout: '2026.08.10' } : null));
    const fetch = fakeFetch({ body: 'binaerer-inhalt', headers: { 'content-length': '15' } });
    const progress: number[] = [];

    const status = await installYtdlp({
      binDir: BIN_DIR,
      fs,
      run: run.runner,
      platform: 'win32',
      fetchImpl: fetch.fetchImpl,
      onProgress: (event) => progress.push(event.received),
    });

    expect(fetch.urls[0]).toBe(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    );
    expect(status).toMatchObject({ available: true, path: MANAGED, version: '2026.08.10' });
    expect(Object.keys(fs.written())).toContain(MANAGED);
    // Die .part-Datei ist nach dem Umbenennen weg.
    expect(Object.keys(fs.written())).not.toContain(`${MANAGED}.part`);
    expect(progress.at(-1)).toBe(15);
  });

  it('setzt ausserhalb von Windows das Ausfuehrbar-Bit', async () => {
    const fs = fakeFileSystem();
    const run = fakeRun(() => ({ stdout: '2026.08.10' }));
    const fetch = fakeFetch({ body: 'binaer' });

    await installYtdlp({
      binDir: '/opt/sb/bin',
      fs,
      run: run.runner,
      platform: 'linux',
      fetchImpl: fetch.fetchImpl,
    });

    expect(fs.chmods()['/opt/sb/bin/yt-dlp.part']).toBe(0o755);
  });

  it('entfernt eine geladene Datei wieder, die nicht laeuft', async () => {
    const fs = fakeFileSystem();
    const run = fakeRun(() => null);
    const fetch = fakeFetch({ body: 'kaputt' });

    await expect(
      installYtdlp({
        binDir: BIN_DIR,
        fs,
        run: run.runner,
        platform: 'win32',
        fetchImpl: fetch.fetchImpl,
      }),
    ).rejects.toThrow(/laeuft aber nicht/);

    expect(Object.keys(fs.written())).not.toContain(MANAGED);
  });

  it('meldet einen Fehlerstatus des Servers', async () => {
    const fetch = fakeFetch({ status: 503, body: '' });
    await expect(
      installYtdlp({
        binDir: BIN_DIR,
        fs: fakeFileSystem(),
        run: fakeRun(() => ({ stdout: '1' })).runner,
        platform: 'win32',
        fetchImpl: fetch.fetchImpl,
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});
