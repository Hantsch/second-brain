import { describe, expect, it } from 'vitest';
import { selectEngineBuild } from '@core/llm';
import type { EngineBuildInput } from '@core/llm';
import { ENGINE_ASSETS, getEngineAsset } from '@core/llm';
import type { MachineDetection } from '@shared/types';

/* Fixtures for `selectEngineBuild` (033, D2): the GPU-scan-informed build
   choice, exercised across the vendor markers named in the decision
   ("NVIDIA/GeForce/RTX/Quadro/Tesla" → cuda, "AMD/Radeon" → vulkan,
   "Intel/Arc/Iris" → vulkan, "Apple M" → macos), the confidence fallback
   (gpuDetection: 'unknown' with a name → vulkan), and the no-evidence case
   (no GPU name, or a scan that never ran at all → cpu). Every case asserts
   its buildId exists in D1's real asset table *for the machine's own
   architecture*, not a hardcoded literal — that is the acceptance criterion,
   not an incidental check.

   Architecture is its own axis: the x64 cases below are the historic ones,
   and the arm64 block covers what the table really ships there (no
   Windows-on-ARM vulkan, both macOS architectures, both Linux ones). */

/** x64 unless a case says otherwise — the architecture every pre-existing
    fixture here implicitly assumed. */
function input(overrides: Partial<EngineBuildInput>): EngineBuildInput {
  return {
    platform: 'win32',
    arch: 'x64',
    gpuName: null,
    gpuDetection: 'not-attempted',
    ...overrides,
  };
}

/** Asserts the build D2 chose is one D1's descriptor table actually ships
    for this platform + architecture + llamacpp — the acceptance criterion,
    checked against the real table rather than a literal expected value. */
function expectBuildExistsInTable(platform: string, buildId: string, arch = 'x64') {
  const found = ENGINE_ASSETS.some(
    (asset) =>
      asset.runtime === 'llamacpp' &&
      asset.platform === platform &&
      asset.arch === arch &&
      asset.build === buildId,
  );
  expect(found).toBe(true);
}

const PLATFORMS = ['win32', 'darwin', 'linux'];

describe('selectEngineBuild', () => {
  describe('NVIDIA GPU names → cuda where the platform ships it', () => {
    for (const platform of PLATFORMS) {
      for (const gpuName of ['NVIDIA GeForce RTX 4070', 'NVIDIA Quadro P2000', 'Tesla T4']) {
        it(`${platform} / "${gpuName}"`, () => {
          const choice = selectEngineBuild(input({ platform, gpuName, gpuDetection: 'detected' }));
          expectBuildExistsInTable(platform, choice.buildId);
          expect(['gpu', 'macos']).toContain(choice.reason.kind);
          if (choice.reason.kind === 'gpu') expect(choice.reason.gpuName).toBe(gpuName);
          if (platform === 'darwin') {
            expect(choice.buildId).toBe('macos');
          } else if (platform === 'linux') {
            // No Linux CUDA asset in the table — must downgrade to vulkan.
            expect(choice.buildId).toBe('vulkan');
          } else {
            expect(choice.buildId).toBe('cuda');
          }
        });
      }
    }
  });

  describe('AMD GPU names → vulkan', () => {
    for (const platform of PLATFORMS) {
      it(`${platform} / "AMD Radeon RX 7600"`, () => {
        const choice = selectEngineBuild(
          input({ platform, gpuName: 'AMD Radeon RX 7600', gpuDetection: 'detected' }),
        );
        expectBuildExistsInTable(platform, choice.buildId);
        expect(choice.buildId).toBe(platform === 'darwin' ? 'macos' : 'vulkan');
      });
    }
  });

  describe('Intel GPU names → vulkan', () => {
    for (const platform of PLATFORMS) {
      for (const gpuName of ['Intel Arc A770', 'Intel Iris Xe Graphics']) {
        it(`${platform} / "${gpuName}"`, () => {
          const choice = selectEngineBuild(input({ platform, gpuName, gpuDetection: 'detected' }));
          expectBuildExistsInTable(platform, choice.buildId);
          expect(choice.buildId).toBe(platform === 'darwin' ? 'macos' : 'vulkan');
        });
      }
    }
  });

  describe('Apple M-series GPU name → the macOS build', () => {
    for (const platform of PLATFORMS) {
      it(`${platform} / "Apple M2 Pro"`, () => {
        const choice = selectEngineBuild(
          input({ platform, gpuName: 'Apple M2 Pro', gpuDetection: 'detected' }),
        );
        expectBuildExistsInTable(platform, choice.buildId);
        if (platform === 'darwin') {
          expect(choice.buildId).toBe('macos');
        } else {
          // Vendor-classified as 'apple' but on a platform whose table has
          // no macos asset (win32/linux) — not a physically real
          // combination, but the classifier is pure over its two inputs and
          // must still land on a build the table actually ships.
          expect(['cuda', 'vulkan', 'cpu']).toContain(choice.buildId);
        }
      });
    }
  });

  describe('no GPU detected → cpu', () => {
    for (const platform of PLATFORMS) {
      it(`${platform} / gpuDetection 'detected', no name`, () => {
        const choice = selectEngineBuild(
          input({ platform, gpuName: null, gpuDetection: 'detected' }),
        );
        expectBuildExistsInTable(platform, choice.buildId);
        expect(choice.buildId).toBe(platform === 'darwin' ? 'macos' : 'cpu');
        expect(choice.reason.kind).toBe(platform === 'darwin' ? 'macos' : 'no-gpu');
      });
    }
  });

  it('reports the structured reason a downgrade happened, with both the requested and actual build (033, D2/D10)', () => {
    // Linux has no CUDA asset (descriptors.ts) — an NVIDIA card must downgrade
    // to vulkan, and the renderer needs both builds to compose "X has no
    // asset here, falling back to Y" in the UI language, not baked-in English.
    const choice = selectEngineBuild(
      input({ platform: 'linux', gpuName: 'NVIDIA GeForce RTX 4070', gpuDetection: 'detected' }),
    );
    expect(choice.reason).toEqual({
      kind: 'gpu',
      gpuName: 'NVIDIA GeForce RTX 4070',
      confident: true,
      requestedBuild: 'cuda',
      actualBuild: 'vulkan',
    });
  });

  describe("gpuDetection: 'unknown' WITH a GPU name → vulkan (scan unsure, vendor guess not trusted)", () => {
    for (const platform of PLATFORMS) {
      it(`${platform} / "NVIDIA GeForce RTX 3060" but unconfirmed`, () => {
        const choice = selectEngineBuild(
          input({ platform, gpuName: 'NVIDIA GeForce RTX 3060', gpuDetection: 'unknown' }),
        );
        expectBuildExistsInTable(platform, choice.buildId);
        expect(choice.buildId).toBe(platform === 'darwin' ? 'macos' : 'vulkan');
        if (platform !== 'darwin') {
          expect(choice.reason).toMatchObject({ kind: 'gpu', confident: false });
        }
      });
    }
  });

  describe('scan failed entirely (not-attempted, no name) → cpu', () => {
    for (const platform of PLATFORMS) {
      const detections: MachineDetection[] = ['not-attempted', 'unknown'];
      for (const gpuDetection of detections) {
        it(`${platform} / gpuDetection '${gpuDetection}', no name`, () => {
          const choice = selectEngineBuild(input({ platform, gpuName: null, gpuDetection }));
          expectBuildExistsInTable(platform, choice.buildId);
          expect(choice.buildId).toBe(platform === 'darwin' ? 'macos' : 'cpu');
        });
      }
    }
  });

  describe('arm64: the downgrade ladder must land on a build this architecture has', () => {
    it('win32/arm64 with a confident NVIDIA card downgrades all the way to cpu', () => {
      // The table curates no arm64 CUDA and no arm64 vulkan asset for Windows,
      // so both rungs above cpu are unavailable *for this architecture* even
      // though they exist for x64 — the bug this fixture pins down is a
      // downgrade that ignores arch and stops at an x64-only build.
      const choice = selectEngineBuild(
        input({
          platform: 'win32',
          arch: 'arm64',
          gpuName: 'NVIDIA GeForce RTX 4070',
          gpuDetection: 'detected',
        }),
      );

      expect(choice.buildId).toBe('cpu');
      expectBuildExistsInTable('win32', 'cpu', 'arm64');
      expect(choice.reason).toEqual({
        kind: 'gpu',
        gpuName: 'NVIDIA GeForce RTX 4070',
        confident: true,
        requestedBuild: 'cuda',
        actualBuild: 'cpu',
      });
    });

    it('win32/arm64 with an AMD card downgrades to cpu as well', () => {
      const choice = selectEngineBuild(
        input({
          platform: 'win32',
          arch: 'arm64',
          gpuName: 'AMD Radeon RX 7600',
          gpuDetection: 'detected',
        }),
      );

      expect(choice.buildId).toBe('cpu');
      expectBuildExistsInTable('win32', 'cpu', 'arm64');
    });

    it('linux/arm64 keeps vulkan — that tarball really exists for arm64', () => {
      const choice = selectEngineBuild(
        input({
          platform: 'linux',
          arch: 'arm64',
          gpuName: 'NVIDIA GeForce RTX 4070',
          gpuDetection: 'detected',
        }),
      );

      expect(choice.buildId).toBe('vulkan');
      expectBuildExistsInTable('linux', 'vulkan', 'arm64');
    });

    it('linux/arm64 without a GPU falls to the arm64 cpu build', () => {
      const choice = selectEngineBuild(input({ platform: 'linux', arch: 'arm64' }));

      expect(choice.buildId).toBe('cpu');
      expectBuildExistsInTable('linux', 'cpu', 'arm64');
    });

    it('both Mac architectures reach the macos build — one build id, two assets', () => {
      for (const arch of ['x64', 'arm64']) {
        const choice = selectEngineBuild(
          input({ platform: 'darwin', arch, gpuName: 'Apple M2 Pro', gpuDetection: 'detected' }),
        );

        expect(choice.buildId).toBe('macos');
        expect(choice.reason).toEqual({ kind: 'macos' });
        expectBuildExistsInTable('darwin', 'macos', arch);
      }
    });

    it('an Intel Mac is still the macos build, not a vendor-derived one', () => {
      // The GPU name would classify as 'intel' → vulkan on any other
      // platform; darwin has no vendor branching, only arch branching.
      const choice = selectEngineBuild(
        input({
          platform: 'darwin',
          arch: 'x64',
          gpuName: 'Intel Iris Plus Graphics',
          gpuDetection: 'detected',
        }),
      );

      expect(choice.buildId).toBe('macos');
      expectBuildExistsInTable('darwin', 'macos', 'x64');
    });

    it('an architecture the table knows nothing about yields no asset instead of a wrong one', () => {
      const choice = selectEngineBuild(input({ platform: 'win32', arch: 'ia32' }));

      // The bottom rung is still reported (this classifier never throws), but
      // no descriptor backs it — which `plan.ts` turns into
      // `unsupported-platform` rather than an x64 download on a 32-bit machine.
      expect(choice.buildId).toBe('cpu');
      expect(getEngineAsset('llamacpp', 'win32', choice.buildId, 'ia32')).toBeUndefined();
    });
  });

  it('is pure: same input always yields the same choice', () => {
    const a = selectEngineBuild(
      input({ platform: 'win32', gpuName: 'AMD Radeon RX 6800', gpuDetection: 'detected' }),
    );
    const b = selectEngineBuild(
      input({ platform: 'win32', gpuName: 'AMD Radeon RX 6800', gpuDetection: 'detected' }),
    );
    expect(a).toEqual(b);
  });

  it('never throws for an unrecognised platform string', () => {
    expect(() =>
      selectEngineBuild(
        input({ platform: 'freebsd', gpuName: null, gpuDetection: 'not-attempted' }),
      ),
    ).not.toThrow();
  });
});
