/* GPU detection in the machine scan (story 019a, D2), the manually entered
 * VRAM override on top of it (story 028, D3), and the resource budget the
 * whole sizing math plans against (story 029, D3).
 *
 * Nothing here spawns a process: every case goes through the injected
 * `execFileFn` seam. What is checked:
 *   - one happy path per platform, including the subtleties that decide the
 *     result (WMI's 32-bit VRAM ceiling, Apple Silicon without a VRAM field,
 *     the discrete card on a hybrid Linux laptop),
 *   - every failure mode — missing tool, non-zero exit, unparseable output, a
 *     process that never returns, an unsupported platform — ends as
 *     `gpuDetection: 'unknown'` with a reason, never as a throw and never as a
 *     hang (guardrail 1: an honest state instead of a dead screen),
 *   - the argument vectors stay fixed and carry the hard timeout,
 *   - the `llm:scanMachine` handler merges the GPU result into the facts and
 *     resolves even when detection fails,
 *   - `llm:setVramOverride` persists through `SettingsService.patchApp`
 *     (never through a vault write), rejects an invalid figure without
 *     persisting anything, and `null` clears it again,
 *   - `llm:setResourceBudget` does the same for the budget percentage, and
 *     the percentage reaches *every* verdict this file produces — including
 *     the one behind `scanCapacityVerdict`, which is what the model
 *     recommendation is sized against and the one place a missing thread
 *     would leave no trace on any screen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as NodeOs from 'node:os';
import { tmpdir as realTmpdir } from 'node:os';
import { join } from 'node:path';
import type { CatalogueEntry } from '@core/llm';
import { recommendModels } from '@core/llm';
import { DEFAULT_RESOURCE_BUDGET_PERCENT } from '@shared/llm/resource-budget';
import type { ProviderConfig, RecommendationSet } from '@shared/types';
import type { ExecFileFn } from '../../../src/main/ipc/machine-scan';
import {
  detectGpuFacts,
  machineScanHandlers,
  scanCapacityVerdict,
} from '../../../src/main/ipc/machine-scan';
import { createMachineScanCache } from '../../../src/main/machine-scan-cache';
import type { Services } from '../../../src/main/services';

/* The handler registry imports `ipcMain`; a machine scan never touches it. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
}));

/** 32 GB of RAM and 8 cores, pinned: the budget tests below assert which
 *  model still fits, and that answer must come from the fixture rather than
 *  from whatever machine happens to run the suite. Everything else (`homedir`,
 *  `tmpdir` for the free-disk probe) stays real. */
const FIXTURE_RAM_MB = 32_768;

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOs>();
  return {
    ...actual,
    default: actual,
    totalmem: () => FIXTURE_RAM_MB * 1024 * 1024,
    cpus: () => Array.from({ length: 8 }) as ReturnType<typeof actual.cpus>,
  };
});

/**
 * A settings fake carrying just enough of `SettingsService` for 028's
 * override and 029's budget: `snapshot()` reads the current values, `patchApp`
 * writes them (mutating the same closure so a `scan` right after a
 * `setVramOverride`/`setResourceBudget` observes it — the same round trip the
 * real settings store gives). Like the real `patchApp`, a patch only touches
 * the fields it actually carries, so writing one of the two never clears the
 * other. `patchVault`/`setVaultSection` are spied on too, so a test can assert
 * neither setting ever reaches the vault's own settings file.
 */
function fakeServices(
  vramOverrideMb: number | null = null,
  resourceBudgetPercent: number = DEFAULT_RESOURCE_BUDGET_PERCENT,
): Services {
  let currentVram = vramOverrideMb;
  let currentBudget = resourceBudgetPercent;
  return {
    settings: {
      snapshot: () => ({
        app: { machine: { vramOverrideMb: currentVram, resourceBudgetPercent: currentBudget } },
        vault: null,
      }),
      patchApp: vi.fn(
        async (patch: {
          machine?: { vramOverrideMb?: number | null; resourceBudgetPercent?: number };
        }) => {
          if (patch.machine?.vramOverrideMb !== undefined) {
            currentVram = patch.machine.vramOverrideMb;
          }
          if (patch.machine?.resourceBudgetPercent !== undefined) {
            currentBudget = patch.machine.resourceBudgetPercent;
          }
          return {} as never;
        },
      ),
      patchVault: vi.fn(),
      setVaultSection: vi.fn(),
    },
  } as unknown as Services;
}

const stdoutExec = (stdout: string): ExecFileFn => vi.fn(async () => ({ stdout }));
const rejectingExec = (error: unknown): ExecFileFn => vi.fn(() => Promise.reject(error));
const hangingExec = (): ExecFileFn => vi.fn(() => new Promise<{ stdout: string }>(() => {}));

/** How `execFile` reports a tool that isn't installed. */
const enoent = Object.assign(new Error('spawn lspci ENOENT'), { code: 'ENOENT' });
/** How it reports a non-zero exit. */
const exitOne = Object.assign(new Error('Command failed'), { code: 1, killed: false });
/** How it reports its own `timeout` having killed the child. */
const killedByTimeout = Object.assign(new Error('Command failed'), {
  code: null,
  killed: true,
  signal: 'SIGKILL',
});

/* Captured verbatim from `Get-CimInstance Win32_VideoController | Select-Object
   Name,AdapterRAM | ConvertTo-Json` on a machine with a 16 GB card: a single
   controller comes back as a bare object, and AdapterRAM saturates at 4095 MB. */
const WIN32_SATURATED = `{
    "Name":  "NVIDIA GeForce RTX 4080",
    "AdapterRAM":  4293918720
}`;

const WIN32_TWO_CONTROLLERS = JSON.stringify([
  { Name: 'Intel(R) UHD Graphics', AdapterRAM: 134217728 },
  { Name: 'NVIDIA GeForce GTX 1050 Ti', AdapterRAM: 2147483648 },
]);

const WIN32_INTEGRATED_PLUS_SATURATED = JSON.stringify([
  { Name: 'Intel(R) UHD Graphics', AdapterRAM: 134217728 },
  { Name: 'NVIDIA GeForce RTX 4080', AdapterRAM: 4293918720 },
]);

const DARWIN_INTEL = JSON.stringify({
  SPDisplaysDataType: [
    { _name: 'kHW_AMDRadeonPro560XItem', sppci_model: 'Radeon Pro 560X', spdisplays_vram: '4 GB' },
  ],
});

const DARWIN_SILICON = JSON.stringify({
  SPDisplaysDataType: [
    { _name: 'Apple M2 Pro', sppci_model: 'Apple M2 Pro', spdisplays_ndrvs: [] },
  ],
});

/* `lspci -mm` on a hybrid laptop: integrated chip first, discrete card second. */
const LSPCI_HYBRID = [
  '00:02.0 "VGA compatible controller" "Intel Corporation" "AlderLake-S GT1" -ra1 "Dell" "Device 0a01"',
  '01:00.0 "3D controller" "NVIDIA Corporation" "GA104M [GeForce RTX 3070 Mobile]" -ra1 "Dell" "Device 0a02"',
  '',
].join('\n');

const LSPCI_NO_GPU = '00:1f.3 "Audio device" "Intel Corporation" "Alder Lake PCH-P" -ra1 "" ""';

afterEach(() => {
  vi.useRealTimers();
});

describe('GPU detection per platform', () => {
  it('reads name and VRAM from Win32_VideoController', async () => {
    const facts = await detectGpuFacts('win32', stdoutExec(WIN32_TWO_CONTROLLERS));
    expect(facts).toEqual({
      gpuName: 'NVIDIA GeForce GTX 1050 Ti',
      vramMb: 2048,
      gpuDetection: 'detected',
    });
  });

  it('keeps VRAM null when WMI saturates its 32-bit AdapterRAM field', async () => {
    /* 4095 MB is what WMI reports for every card of 4 GB or more. Passing it on
       would be a wrong number; the name is still a fact. */
    const facts = await detectGpuFacts('win32', stdoutExec(WIN32_SATURATED));
    expect(facts).toEqual({
      gpuName: 'NVIDIA GeForce RTX 4080',
      vramMb: null,
      gpuDetection: 'detected',
    });
  });

  it('still prefers the saturated discrete card over an integrated one', async () => {
    const facts = await detectGpuFacts('win32', stdoutExec(WIN32_INTEGRATED_PLUS_SATURATED));
    expect(facts.gpuName).toBe('NVIDIA GeForce RTX 4080');
    expect(facts.vramMb).toBeNull();
  });

  it('reads model and VRAM from system_profiler', async () => {
    const facts = await detectGpuFacts('darwin', stdoutExec(DARWIN_INTEL));
    expect(facts).toEqual({ gpuName: 'Radeon Pro 560X', vramMb: 4096, gpuDetection: 'detected' });
  });

  it('reports a model without VRAM on Apple Silicon rather than guessing', async () => {
    const facts = await detectGpuFacts('darwin', stdoutExec(DARWIN_SILICON));
    expect(facts).toEqual({ gpuName: 'Apple M2 Pro', vramMb: null, gpuDetection: 'detected' });
  });

  it('takes the discrete card from lspci and leaves VRAM unknown', async () => {
    const facts = await detectGpuFacts('linux', stdoutExec(LSPCI_HYBRID));
    expect(facts).toEqual({
      gpuName: 'NVIDIA Corporation GA104M [GeForce RTX 3070 Mobile]',
      vramMb: null,
      gpuDetection: 'detected',
    });
  });

  it('says unknown on a platform it has no probe for, without spawning anything', async () => {
    const exec = stdoutExec('');
    const facts = await detectGpuFacts('freebsd', exec);
    expect(facts).toEqual({
      gpuName: null,
      vramMb: null,
      gpuDetection: 'unknown',
      gpuDetectionReason: 'unsupported-platform',
    });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('every failure mode ends as unknown', () => {
  it('maps a missing tool to unknown', async () => {
    const facts = await detectGpuFacts('linux', rejectingExec(enoent));
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('tool-missing');
    expect(facts.gpuName).toBeNull();
    expect(facts.vramMb).toBeNull();
  });

  it('maps a non-zero exit to unknown', async () => {
    const facts = await detectGpuFacts('win32', rejectingExec(exitOne));
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('tool-failed');
  });

  it('maps a rejection that is not an object at all to unknown', async () => {
    const facts = await detectGpuFacts('darwin', rejectingExec('boom'));
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('tool-failed');
  });

  it('maps a synchronous throw to unknown', async () => {
    const exec: ExecFileFn = () => {
      throw enoent;
    };
    const facts = await detectGpuFacts('win32', exec);
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('tool-missing');
  });

  it("maps execFile's own timeout kill to unknown", async () => {
    const facts = await detectGpuFacts('linux', rejectingExec(killedByTimeout));
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('timeout');
  });

  it.each([
    ['not JSON at all', 'powershell : Get-CimInstance is not recognized'],
    ['empty output', '   '],
    ['JSON of the wrong shape', JSON.stringify({ SPSomethingElse: 1 })],
  ])('maps %s to unknown', async (_case, stdout) => {
    const facts = await detectGpuFacts('darwin', stdoutExec(stdout));
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('unparseable-output');
  });

  it('says no-gpu-found when a tool ran fine but named no GPU', async () => {
    const facts = await detectGpuFacts('linux', stdoutExec(LSPCI_NO_GPU));
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('no-gpu-found');
  });

  it('resolves as unknown when the process never returns', async () => {
    /* The watchdog above execFile's own timeout: a child whose pipes stay open
       must not leave the scan pending, or the models tab waits forever. */
    vi.useFakeTimers();
    const pending = detectGpuFacts('win32', hangingExec());
    await vi.advanceTimersByTimeAsync(5_000);
    const facts = await pending;
    expect(facts.gpuDetection).toBe('unknown');
    expect(facts.gpuDetectionReason).toBe('timeout');
  });
});

describe('the spawned command', () => {
  it('is a fixed argument vector with a hard timeout and a kill signal', async () => {
    const exec = stdoutExec(WIN32_SATURATED);
    await detectGpuFacts('win32', exec);
    expect(exec).toHaveBeenCalledTimes(1);
    const [file, args, options] = vi.mocked(exec).mock.calls[0] ?? [];
    expect(file).toBe('powershell.exe');
    expect(args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json',
    ]);
    expect(options?.timeout).toBe(2_000);
    expect(options?.killSignal).toBe('SIGKILL');
    expect(options?.windowsHide).toBe(true);
    // No shell: there is nothing to interpolate into, now or later.
    expect(options).not.toHaveProperty('shell');
  });

  it('asks lspci and system_profiler with their fixed arguments too', async () => {
    const linuxExec = stdoutExec(LSPCI_HYBRID);
    await detectGpuFacts('linux', linuxExec);
    expect(linuxExec).toHaveBeenCalledWith('lspci', ['-mm'], expect.anything());

    const darwinExec = stdoutExec(DARWIN_SILICON);
    await detectGpuFacts('darwin', darwinExec);
    expect(darwinExec).toHaveBeenCalledWith(
      'system_profiler',
      ['SPDisplaysDataType', '-json'],
      expect.anything(),
    );
  });
});

describe('llm:scanMachine', () => {
  async function scan(deps: { platform: string; execFileFn: ExecFileFn }) {
    const handler = machineScanHandlers(fakeServices(), deps)['llm:scanMachine'];
    if (!handler) throw new Error('llm:scanMachine has no handler');
    return await handler(undefined);
  }

  it('merges the detected GPU into the cheap facts', async () => {
    const result = await scan({ platform: 'linux', execFileFn: stdoutExec(LSPCI_HYBRID) });
    expect(result.facts.gpuName).toBe('NVIDIA Corporation GA104M [GeForce RTX 3070 Mobile]');
    expect(result.facts.gpuDetection).toBe('detected');
    expect(result.facts.platform).toBe('linux');
    expect(result.facts.cpuCores).not.toBeNull();
    expect(Number.isNaN(Date.parse(result.scannedAt))).toBe(false);
  });

  it('still returns facts when GPU detection fails', async () => {
    const result = await scan({ platform: 'win32', execFileFn: rejectingExec(enoent) });
    expect(result.facts.gpuDetection).toBe('unknown');
    expect(result.facts.gpuDetectionReason).toBe('tool-missing');
    expect(result.facts.gpuName).toBeNull();
    expect(result.facts.totalRamMb).not.toBeNull();
  });
});

/* 028, D3: the one setting the renderer can write outside the vault. */
describe('llm:setVramOverride', () => {
  const deps = { platform: 'linux', execFileFn: stdoutExec(LSPCI_NO_GPU) };

  function handlerFor(services: Services) {
    const handler = machineScanHandlers(services, deps)['llm:setVramOverride'];
    if (!handler) throw new Error('llm:setVramOverride has no handler');
    return handler;
  }

  it('persists a valid value through patchApp and the fresh scan carries it', async () => {
    const services = fakeServices(null);

    const result = await handlerFor(services)({ vramMb: 16384 });

    expect(result.facts.vramMb).toBe(16384);
    expect(result.facts.manualVramMb).toBe(16384);
    expect(result.facts.vramSource).toBe('manual');
    expect(services.settings.patchApp).toHaveBeenCalledWith({
      machine: { vramOverrideMb: 16384 },
    });
  });

  it('clears the override with null and the verdict falls back', async () => {
    const services = fakeServices(16384);

    const result = await handlerFor(services)({ vramMb: null });

    expect(result.facts.vramMb).toBeNull();
    expect(result.facts.vramSource).toBe('none');
    expect(services.settings.patchApp).toHaveBeenCalledWith({
      machine: { vramOverrideMb: null },
    });
  });

  it.each([0, -1, 999_999_999, NaN])('rejects %s as invalid and persists nothing', async (bad) => {
    const services = fakeServices(null);

    await expect(handlerFor(services)({ vramMb: bad })).rejects.toMatchObject({
      code: 'invalid',
    });
    expect(services.settings.patchApp).not.toHaveBeenCalled();
  });

  it('rejects a non-number payload the same way', async () => {
    const services = fakeServices(null);

    await expect(
      handlerFor(services)({ vramMb: 'abc' as unknown as number }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(services.settings.patchApp).not.toHaveBeenCalled();
  });

  it('never writes to the vault settings — only the machine-local app settings', async () => {
    const services = fakeServices(null);

    await handlerFor(services)({ vramMb: 16384 });

    expect(services.settings.patchVault).not.toHaveBeenCalled();
    expect(services.settings.setVaultSection).not.toHaveBeenCalled();
  });
});

/* 029, D3: the resource budget — persisted like the override above, and, unlike
   it, applied to *every* verdict this file hands out. */
describe('llm:setResourceBudget', () => {
  const deps = { platform: 'linux', execFileFn: stdoutExec(LSPCI_NO_GPU) };

  function handlerFor(services: Services) {
    const handler = machineScanHandlers(services, deps)['llm:setResourceBudget'];
    if (!handler) throw new Error('llm:setResourceBudget has no handler');
    return handler;
  }

  it('persists a valid percentage through patchApp and the fresh verdict carries it', async () => {
    const services = fakeServices(null, 100);

    const result = await handlerFor(services)({ percent: 40 });

    expect(result.verdict.budgetPercent).toBe(40);
    expect(services.settings.patchApp).toHaveBeenCalledWith({
      machine: { resourceBudgetPercent: 40 },
    });
    expect(Number.isNaN(Date.parse(result.scannedAt))).toBe(false);
  });

  it('plans with less memory at a lower percentage', async () => {
    const wide = await handlerFor(fakeServices(null, 100))({ percent: 100 });
    const narrow = await handlerFor(fakeServices(null, 100))({ percent: 40 });

    // (32768 − 4096 MB OS reserve) × percent — the budget applies after the
    // fixed reserve, never to the raw figure.
    expect(wide.verdict.plannedRamMb).toBe(28_672);
    expect(narrow.verdict.plannedRamMb).toBeCloseTo(11_468.8, 1);
    expect(narrow.verdict.maxPossibleParamsB!).toBeLessThan(wide.verdict.maxPossibleParamsB!);
  });

  it('leaves a stored VRAM override untouched while writing the budget', async () => {
    const services = fakeServices(16_384, 100);

    const result = await handlerFor(services)({ percent: 50 });

    expect(result.facts.manualVramMb).toBe(16_384);
    expect(result.facts.vramMb).toBe(16_384);
  });

  it.each([0, -1, 101, 9, 40.5, NaN, Infinity])(
    'rejects %s as invalid and persists nothing',
    async (bad) => {
      const services = fakeServices(null, 80);

      await expect(handlerFor(services)({ percent: bad })).rejects.toMatchObject({
        code: 'invalid',
      });
      expect(services.settings.patchApp).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-number payload the same way', async () => {
    const services = fakeServices(null, 80);

    await expect(
      handlerFor(services)({ percent: '40' as unknown as number }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(services.settings.patchApp).not.toHaveBeenCalled();
  });

  it('never writes to the vault settings — only the machine-local app settings', async () => {
    const services = fakeServices(null, 80);

    await handlerFor(services)({ percent: 40 });

    expect(services.settings.patchVault).not.toHaveBeenCalled();
    expect(services.settings.setVaultSection).not.toHaveBeenCalled();
  });
});

/* The point of 029's D3: `judgeCapacity` is called in three places in this
   file, and only one of them — `scanCapacityVerdict` — feeds the model
   recommendation. A budget threaded into the two handler call sites but not
   into that one would show the new percentage on the machine card while
   recommendations kept planning at the old default, with no error, no empty
   state and no screen that could reveal it (028 hit exactly this shape with
   the VRAM override). */
describe('the budget reaches every verdict, including the recommendation path', () => {
  const deps = { platform: 'linux', execFileFn: stdoutExec(LSPCI_NO_GPU) };

  it('carries the stored percentage into llm:scanMachine', async () => {
    const handler = machineScanHandlers(fakeServices(null, 40), deps)['llm:scanMachine'];
    if (!handler) throw new Error('llm:scanMachine has no handler');

    expect((await handler(undefined)).verdict.budgetPercent).toBe(40);
  });

  it('carries it into the fresh scan a VRAM override returns', async () => {
    const handler = machineScanHandlers(fakeServices(null, 40), deps)['llm:setVramOverride'];
    if (!handler) throw new Error('llm:setVramOverride has no handler');

    expect((await handler({ vramMb: 16_384 })).verdict.budgetPercent).toBe(40);
  });

  it('carries it into scanCapacityVerdict, the verdict recommendations are sized against', async () => {
    const verdict = await scanCapacityVerdict(fakeServices(null, 40), deps);

    expect(verdict.budgetPercent).toBe(40);
  });

  it('falls back to the default when the stored value is unusable', async () => {
    /* A hand-edited settings file, or one written before this setting
       existed: the sizing math must not inherit `NaN` or an out-of-range
       factor from it. */
    const verdict = await scanCapacityVerdict(fakeServices(null, NaN), deps);

    expect(verdict.budgetPercent).toBe(DEFAULT_RESOURCE_BUDGET_PERCENT);
  });

  /* Same fixture catalogue, same providers, only the budget differs — exactly
     what `buildRecommendations` (main/llm-bridge.ts) composes: the verdict from
     `scanCapacityVerdict` plus the catalogue, handed to `recommendModels`. */
  function localEntry(id: string, paramsB: number, sizeOnDiskGb: number): CatalogueEntry {
    return {
      id,
      providerKind: 'openai-compatible',
      paramsB,
      // A disk footprint is what makes an entry local-capable, and only
      // local-capable entries are ever measured against the machine's ceiling.
      sizeOnDiskGb,
      quantisation: 'Q4_K_M',
      priceInPerMTok: null,
      priceOutPerMTok: null,
      dataPolicy: 'no-training',
      policySource: 'local model — never leaves the machine',
      policyReadAt: '2026-08-01',
    };
  }

  /* On this fixture machine (32 GB RAM, no GPU) the RAM ceiling allows ~50B at
     100% and ~20B at 40%: the 34B entry drops out, the 13B one survives. */
  const BIG = localEntry('ollama/big-model:34b', 34, 20);
  const SMALL = localEntry('ollama/small-model:13b', 13, 8);

  const CLOUD: CatalogueEntry = {
    id: 'anthropic/claude-sonnet-4-5',
    providerKind: 'anthropic',
    paramsB: null,
    sizeOnDiskGb: null,
    quantisation: null,
    priceInPerMTok: 3,
    priceOutPerMTok: 15,
    dataPolicy: 'no-training',
    policySource: 'https://example.invalid/policy',
    policyReadAt: '2026-08-01',
  };

  const CLOUD_PROVIDER: ProviderConfig = {
    id: 'anthropic-main',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.invalid',
    hasKey: true,
    local: false,
    enabled: true,
    models: [CLOUD.id],
    createdAt: '2026-08-01T00:00:00+02:00',
  };

  async function recommendAt(
    percent: number,
    entries: CatalogueEntry[],
    providers: ProviderConfig[] = [],
  ): Promise<RecommendationSet> {
    const verdict = await scanCapacityVerdict(fakeServices(null, percent), deps);
    return recommendModels(
      { generatedAt: '2026-08-01', entries, stale: false },
      providers,
      [],
      verdict,
    );
  }

  it('recommends a smaller local model at 40% than at 100%', async () => {
    const wide = await recommendAt(100, [BIG, SMALL]);
    const narrow = await recommendAt(40, [BIG, SMALL]);

    const downgraded = wide.tasks.filter(
      (task, index) => task.pick?.model === BIG.id && narrow.tasks[index]?.pick?.model === SMALL.id,
    );
    expect(downgraded.length).toBeGreaterThan(0);
    // And the model that no longer fits is gone everywhere, not just in the picks.
    const narrowIds = narrow.tasks.flatMap((task) => [
      ...(task.pick ? [task.pick.model] : []),
      ...task.alternatives.map((alternative) => alternative.model),
    ]);
    expect(narrowIds).not.toContain(BIG.id);
  });

  it('leaves a cloud recommendation identical at 100% and at 10%', async () => {
    /* Cloud models are not sized against the machine at all — the verdict is
       only consulted inside reachability's local branch. This is the
       regression test for that, not new behaviour. */
    const wide = await recommendAt(100, [CLOUD], [CLOUD_PROVIDER]);
    const narrow = await recommendAt(10, [CLOUD], [CLOUD_PROVIDER]);

    expect(narrow).toEqual(wide);
    expect(wide.tasks.some((task) => task.pick?.model === CLOUD.id)).toBe(true);
  });
});

/* 035, D1: the scan is remembered in userData, and the two setters re-judge
   that remembered scan instead of probing the GPU again.

   Two things are load-bearing here and neither shows up on screen when it is
   wrong. First, what goes into the cache is detection's *pre-override* output:
   store the merged facts instead and a manual figure would be frozen into the
   stored "detected" VRAM, so clearing the override later could never get back
   to what the card actually measured. Second, `scannedAt` means "when the scan
   ran" — moving a slider scans nothing, so the date must not jump to now. */
describe('the remembered scan (035, D1)', () => {
  let cacheDir = '';

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(realTmpdir(), 'gaston-scan-handlers-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  /** Deps with a real cache over a temp directory — the same object the app
   *  builds from `services.userDataDir`, only somewhere disposable. */
  function depsWithCache(execFileFn: ExecFileFn, platform = 'linux') {
    return { platform, execFileFn, cache: createMachineScanCache(cacheDir) };
  }

  async function storedFile(): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cacheDir, 'machine-scan.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  }

  async function callScan(services: Services, execFileFn: ExecFileFn, platform = 'linux') {
    const deps = depsWithCache(execFileFn, platform);
    const handler = machineScanHandlers(services, deps)['llm:scanMachine'];
    if (!handler) throw new Error('llm:scanMachine has no handler');
    return await handler(undefined);
  }

  it('writes the cache file on a scan', async () => {
    await callScan(fakeServices(), stdoutExec(LSPCI_HYBRID));

    const stored = await storedFile();
    expect(stored['version']).toBe(1);
    expect(typeof stored['scannedAt']).toBe('string');
    expect(stored['facts']).toMatchObject({
      platform: 'linux',
      gpuName: 'NVIDIA Corporation GA104M [GeForce RTX 3070 Mobile]',
      totalRamMb: FIXTURE_RAM_MB,
    });
  });

  it('stores what detection measured, not what the override made of it', async () => {
    const result = await callScan(fakeServices(16_384), stdoutExec(LSPCI_NO_GPU));

    // The result the card sees carries the override…
    expect(result.facts.vramMb).toBe(16_384);
    expect(result.facts.vramSource).toBe('manual');
    // …the file behind it does not, so clearing the override can undo it.
    const facts = (await storedFile())['facts'] as Record<string, unknown>;
    expect(facts['vramMb']).toBeNull();
    expect(facts).not.toHaveProperty('manualVramMb');
    expect(facts).not.toHaveProperty('vramSource');
  });

  it('re-judges the remembered scan on a budget change without probing again', async () => {
    const services = fakeServices(null, 100);
    const wide = await callScan(services, stdoutExec(LSPCI_NO_GPU));

    /* A second exec seam, untouched by the scan above: if the setter probed,
       this is where it would show. */
    const exec = stdoutExec(LSPCI_NO_GPU);
    const setBudget = machineScanHandlers(services, depsWithCache(exec))['llm:setResourceBudget'];
    if (!setBudget) throw new Error('llm:setResourceBudget has no handler');
    const narrow = await setBudget({ percent: 40 });

    expect(exec).not.toHaveBeenCalled();
    expect(narrow.verdict.budgetPercent).toBe(40);
    expect(narrow.verdict.plannedRamMb).toBeLessThan(wide.verdict.plannedRamMb!);
    // Nothing was scanned, so the date stays the one of the actual scan.
    expect(narrow.scannedAt).toBe(wide.scannedAt);
  });

  it('re-judges it on a VRAM change without probing, and clearing gets the detection back', async () => {
    const services = fakeServices(null);
    const scan = await callScan(services, stdoutExec(DARWIN_INTEL), 'darwin');
    expect(scan.facts.vramMb).toBe(4096);

    const exec = stdoutExec(DARWIN_INTEL);
    const setVram = machineScanHandlers(services, depsWithCache(exec, 'darwin'))[
      'llm:setVramOverride'
    ];
    if (!setVram) throw new Error('llm:setVramOverride has no handler');

    const entered = await setVram({ vramMb: 16_384 });
    expect(exec).not.toHaveBeenCalled();
    expect(entered.facts.vramMb).toBe(16_384);
    expect(entered.facts.detectedVramMb).toBe(4096);
    expect(entered.facts.vramConflict).toBe(true);
    expect(entered.scannedAt).toBe(scan.scannedAt);

    const cleared = await setVram({ vramMb: null });
    expect(cleared.facts.vramMb).toBe(4096);
    expect(cleared.facts.vramSource).toBe('detected');
    expect(cleared.facts.vramConflict).toBe(false);
    expect(cleared.scannedAt).toBe(scan.scannedAt);
  });

  it.each([
    ['a corrupt file', 'not json at all {'],
    ['a file from another version', JSON.stringify({ version: 99, scannedAt: '2026-01-01' })],
  ])('treats %s as "never scanned" and falls back to a probe', async (_case, contents) => {
    await writeFile(join(cacheDir, 'machine-scan.json'), contents, 'utf8');

    const exec = stdoutExec(LSPCI_HYBRID);
    const setBudget = machineScanHandlers(fakeServices(null, 100), depsWithCache(exec))[
      'llm:setResourceBudget'
    ];
    if (!setBudget) throw new Error('llm:setResourceBudget has no handler');
    const result = await setBudget({ percent: 40 });

    expect(exec).toHaveBeenCalledTimes(1);
    expect(result.facts.gpuName).toBe('NVIDIA Corporation GA104M [GeForce RTX 3070 Mobile]');
    expect(result.verdict.budgetPercent).toBe(40);
    expect(Number.isNaN(Date.parse(result.scannedAt))).toBe(false);
  });

  /* 035, D2: what the card asks for on mount, before any user interaction —
     the honest "never scanned" `null`, or the remembered scan re-judged
     against the settings as they stand now (never a re-probe). */
  describe('llm:getMachineScan', () => {
    function handlerFor(services: Services, execFileFn: ExecFileFn, platform = 'linux') {
      const handler = machineScanHandlers(services, depsWithCache(execFileFn, platform))[
        'llm:getMachineScan'
      ];
      if (!handler) throw new Error('llm:getMachineScan has no handler');
      return handler;
    }

    it('returns null when no cache file exists yet', async () => {
      const exec = stdoutExec(LSPCI_HYBRID);

      const result = await handlerFor(fakeServices(), exec)(undefined);

      expect(result).toBeNull();
      // The point of the handler: it reads the cache, it never probes.
      expect(exec).not.toHaveBeenCalled();
    });

    it('returns the derived facts, verdict and scannedAt from a cached scan', async () => {
      const services = fakeServices(null, 40);
      const scanned = await callScan(services, stdoutExec(LSPCI_HYBRID));

      const exec = stdoutExec(LSPCI_HYBRID);
      const result = await handlerFor(services, exec)(undefined);

      expect(exec).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.scannedAt).toBe(scanned.scannedAt);
      expect(result?.facts.gpuName).toBe('NVIDIA Corporation GA104M [GeForce RTX 3070 Mobile]');
      expect(result?.verdict.budgetPercent).toBe(40);
    });
  });
});
