import { describe, expect, it } from 'vitest';
import { planRuntimeInstall } from '@core/llm';
import type { RuntimePlanInput } from '@core/llm';

/* Fixtures for the two blocked reasons named in the 019c plan (unsupported
   platform, insufficient disk) plus the happy path. `planRuntimeInstall`
   never detects anything itself — every fact comes in as a plain parameter,
   exactly as the story's D1 describes. */

function input(overrides: Partial<RuntimePlanInput>): RuntimePlanInput {
  return {
    platform: 'win32',
    freeDiskMb: 8192,
    installerSizeMb: 350,
    tempDir: 'C:\\Users\\test\\AppData\\Local\\Temp',
    writable: true,
    ...overrides,
  };
}

describe('planRuntimeInstall', () => {
  it('plenty of disk on Windows: install can be attempted', () => {
    const plan = planRuntimeInstall(input({}));

    expect(plan.canInstall).toBe(true);
    expect(plan.blockedReason).toBeNull();
    expect(plan.downloadMb).toBe(350);
    expect(plan.installerPath).toBe('C:\\Users\\test\\AppData\\Local\\Temp\\OllamaSetup.exe');
    expect(plan.modelDirHint).toContain('.ollama');
    expect(plan.modelDirHint).toContain('models');
  });

  it('plenty of disk on macOS: install can be attempted too', () => {
    const plan = planRuntimeInstall(input({ platform: 'darwin', tempDir: '/tmp' }));

    expect(plan.canInstall).toBe(true);
    expect(plan.blockedReason).toBeNull();
    expect(plan.installerPath).toBe('/tmp/Ollama.dmg');
  });

  it('Linux: blocked as unsupported-platform — no official GUI installer', () => {
    const plan = planRuntimeInstall(input({ platform: 'linux' }));

    expect(plan.canInstall).toBe(false);
    expect(plan.blockedReason).toBe('unsupported-platform');
  });

  it('any other platform is unsupported the same way', () => {
    const plan = planRuntimeInstall(input({ platform: 'freebsd' }));

    expect(plan.canInstall).toBe(false);
    expect(plan.blockedReason).toBe('unsupported-platform');
  });

  it('too little free disk: blocked as insufficient-disk', () => {
    // 350 MB installer + 500 MB safety margin = 850 MB required; 300 is short.
    const plan = planRuntimeInstall(input({ freeDiskMb: 300 }));

    expect(plan.canInstall).toBe(false);
    expect(plan.blockedReason).toBe('insufficient-disk');
  });

  it('no write permission on the temp dir: blocked as no-write-permission', () => {
    const plan = planRuntimeInstall(input({ writable: false }));

    expect(plan.canInstall).toBe(false);
    expect(plan.blockedReason).toBe('no-write-permission');
  });

  it('an unsupported platform is reported even when the temp dir is also unwritable', () => {
    const plan = planRuntimeInstall(input({ platform: 'linux', writable: false }));

    expect(plan.blockedReason).toBe('unsupported-platform');
  });

  it('insufficient disk is reported before a write-permission problem is even checked', () => {
    // 350 MB installer + 500 MB safety margin = 850 MB required; 300 is short.
    const plan = planRuntimeInstall(input({ freeDiskMb: 300, writable: false }));

    expect(plan.blockedReason).toBe('insufficient-disk');
  });

  it('exactly at the margin still counts as enough', () => {
    const plan = planRuntimeInstall(input({ freeDiskMb: 850 }));

    expect(plan.canInstall).toBe(true);
    expect(plan.blockedReason).toBeNull();
  });

  it('unknown free disk (null) does not block — the download step fails honestly instead', () => {
    const plan = planRuntimeInstall(input({ freeDiskMb: null }));

    expect(plan.canInstall).toBe(true);
    expect(plan.blockedReason).toBeNull();
  });

  it('an unsupported platform is reported even when disk is also short', () => {
    // Platform is checked first: the plan doesn't claim a disk problem on a
    // platform that could never install in the first place.
    const plan = planRuntimeInstall(input({ platform: 'linux', freeDiskMb: 10 }));

    expect(plan.blockedReason).toBe('unsupported-platform');
  });

  it('always reports a download size and paths, even when blocked', () => {
    // The card needs these to render "here's why, plus what it would have
    // been" — not just a blocked flag with no context.
    const plan = planRuntimeInstall(input({ platform: 'linux' }));

    expect(plan.downloadMb).toBe(350);
    expect(plan.installerPath).not.toBe('');
    expect(plan.modelDirHint).not.toBe('');
  });
});
