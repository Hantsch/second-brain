/* GPU detection in the machine scan (story 019a, D2).
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
 *     resolves even when detection fails.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecFileFn } from '../../../src/main/ipc/machine-scan';
import { detectGpuFacts, machineScanHandlers } from '../../../src/main/ipc/machine-scan';
import type { Services } from '../../../src/main/services';

/* The handler registry imports `ipcMain`; a machine scan never touches it. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
}));

/** The scan doesn't read the vault, so an empty stand-in is enough. */
const services = {} as Services;

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
    const handler = machineScanHandlers(services, deps)['llm:scanMachine'];
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
