import { describe, expect, it } from 'vitest';
import { planRuntimeDownload } from '@core/llm';
import type { RuntimeDownloadInput, RuntimeDownloadKind } from '@core/llm';
import type { RuntimeId } from '@shared/types';

/* Fixtures for the generalised `planRuntimeDownload` (033, D1): the same
   platform/disk/writability judgement `runtime-plan.test.ts` already covers
   for Ollama's installer, now exercised across both runtimes and both
   download kinds (engine archive, model file) — the whole point of pulling
   the decision logic out of `runtime-plan.ts` in the first place. */

function input(overrides: Partial<RuntimeDownloadInput>): RuntimeDownloadInput {
  return {
    runtime: 'ollama',
    kind: 'engine',
    platform: 'win32',
    freeDiskMb: 8192,
    downloadMb: 350,
    targetPath: 'C:\\Users\\test\\AppData\\Roaming\\Gaston\\runtimes\\ollama',
    writable: true,
    assetAvailable: true,
    ...overrides,
  };
}

describe('planRuntimeDownload', () => {
  describe('plan per platform x runtime x kind', () => {
    const platforms = ['win32', 'darwin', 'linux'];
    const runtimes: RuntimeId[] = ['ollama', 'llamacpp'];
    const kinds: RuntimeDownloadKind[] = ['engine', 'model'];

    for (const platform of platforms) {
      for (const runtime of runtimes) {
        for (const kind of kinds) {
          it(`${runtime}/${platform}/${kind}: plenty of disk, asset available → can download`, () => {
            const plan = planRuntimeDownload(
              input({ platform, runtime, kind, assetAvailable: true }),
            );

            expect(plan.canDownload).toBe(true);
            expect(plan.blockedReason).toBeNull();
            expect(plan.runtime).toBe(runtime);
            expect(plan.kind).toBe(kind);
            expect(plan.downloadMb).toBe(350);
            expect(plan.freeDiskMb).toBe(8192);
          });
        }
      }
    }
  });

  describe('the three blockedReason values', () => {
    it('unsupported-platform: no known asset for this runtime/platform/kind', () => {
      const plan = planRuntimeDownload(input({ assetAvailable: false }));

      expect(plan.canDownload).toBe(false);
      expect(plan.blockedReason).toBe('unsupported-platform');
    });

    it('insufficient-disk: download plus safety margin exceeds free disk', () => {
      // 350 MB download + 500 MB safety margin = 850 MB required; 300 is short.
      const plan = planRuntimeDownload(input({ freeDiskMb: 300 }));

      expect(plan.canDownload).toBe(false);
      expect(plan.blockedReason).toBe('insufficient-disk');
    });

    it('no-write-permission: the target directory refused the probe write', () => {
      const plan = planRuntimeDownload(input({ writable: false }));

      expect(plan.canDownload).toBe(false);
      expect(plan.blockedReason).toBe('no-write-permission');
    });

    it('unsupported-platform wins over an also-short disk', () => {
      const plan = planRuntimeDownload(input({ assetAvailable: false, freeDiskMb: 10 }));

      expect(plan.blockedReason).toBe('unsupported-platform');
    });

    it('insufficient-disk is reported before a write-permission problem is even checked', () => {
      const plan = planRuntimeDownload(input({ freeDiskMb: 300, writable: false }));

      expect(plan.blockedReason).toBe('insufficient-disk');
    });

    it('exactly at the margin still counts as enough', () => {
      const plan = planRuntimeDownload(input({ freeDiskMb: 850 }));

      expect(plan.canDownload).toBe(true);
      expect(plan.blockedReason).toBeNull();
    });
  });

  it('unknown free disk (null) does not block — the download step fails honestly instead', () => {
    const plan = planRuntimeDownload(input({ freeDiskMb: null }));

    expect(plan.canDownload).toBe(true);
    expect(plan.blockedReason).toBeNull();
    expect(plan.freeDiskMb).toBeNull();
  });

  it('a model download larger than free disk is refused, with the free-disk number in the result', () => {
    const plan = planRuntimeDownload(
      input({
        runtime: 'llamacpp',
        kind: 'model',
        downloadMb: 4200,
        freeDiskMb: 2000,
        targetPath: 'C:\\Users\\test\\AppData\\Roaming\\Gaston\\models\\gguf\\model.gguf',
      }),
    );

    expect(plan.canDownload).toBe(false);
    expect(plan.blockedReason).toBe('insufficient-disk');
    expect(plan.downloadMb).toBe(4200);
    expect(plan.freeDiskMb).toBe(2000);
  });

  it('always reports download size, target path and runtime/kind, even when blocked', () => {
    const plan = planRuntimeDownload(input({ assetAvailable: false }));

    expect(plan.downloadMb).toBe(350);
    expect(plan.targetPath).not.toBe('');
    expect(plan.runtime).toBe('ollama');
    expect(plan.kind).toBe('engine');
  });
});
