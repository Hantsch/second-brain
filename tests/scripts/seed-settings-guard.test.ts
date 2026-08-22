/* Sichert den Wächter aus scripts/seed/settings-guard.mjs gegen nach außen
   zeigende Pfade in settings.json — siehe die Begründung dort. Arbeitet auf
   echten temporären Ordnern (mkdtemp), weil der Wächter Existenz/Leere per
   fs prüft und ein Speicher-Fake das nicht ehrlich abbilden könnte. */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkSettingsGuard } from '../../scripts/seed/settings-guard.mjs';

describe('checkSettingsGuard', () => {
  let vaultRoot: string;

  beforeEach(async () => {
    vaultRoot = await mkdtemp(join(tmpdir(), 'sb-settings-guard-'));
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  it('reports nothing for well-formed, in-vault settings', async () => {
    const claudeProjectsDir = join(vaultRoot, '.secondbrain', 'claude-projects');
    const codexSessionsDir = join(vaultRoot, '.secondbrain', 'codex-sessions');
    await mkdir(claudeProjectsDir, { recursive: true });
    await mkdir(codexSessionsDir, { recursive: true });
    await writeFile(join(claudeProjectsDir, 'session.jsonl'), '{}', 'utf8');
    await writeFile(join(codexSessionsDir, 'session.jsonl'), '{}', 'utf8');

    const settings = {
      overview: {
        claudeProjectsDir,
        useClaudeSessions: true,
        codexSessionsDir,
        useCodexSessions: true,
      },
    };

    expect(checkSettingsGuard(settings, vaultRoot)).toEqual([]);
  });

  it('flags an empty session dir', async () => {
    const claudeProjectsDir = join(vaultRoot, '.secondbrain', 'claude-projects');
    const codexSessionsDir = join(vaultRoot, '.secondbrain', 'codex-sessions');
    await mkdir(claudeProjectsDir, { recursive: true });
    await mkdir(codexSessionsDir, { recursive: true });
    await writeFile(join(claudeProjectsDir, 'session.jsonl'), '{}', 'utf8');
    // codexSessionsDir stays empty on purpose.

    const settings = {
      overview: {
        claudeProjectsDir,
        useClaudeSessions: true,
        codexSessionsDir,
        useCodexSessions: true,
      },
    };

    const problems = checkSettingsGuard(settings, vaultRoot);
    expect(problems.some((problem) => problem.includes('codexSessionsDir'))).toBe(true);
  });

  it('flags a home-directory-style session path outside the vault', async () => {
    const claudeProjectsDir = join(vaultRoot, '.secondbrain', 'claude-projects');
    await mkdir(claudeProjectsDir, { recursive: true });
    await writeFile(join(claudeProjectsDir, 'session.jsonl'), '{}', 'utf8');

    const settings = {
      overview: {
        claudeProjectsDir,
        useClaudeSessions: true,
        codexSessionsDir: '~/.codex/sessions',
        useCodexSessions: true,
      },
    };

    const problems = checkSettingsGuard(settings, vaultRoot);
    expect(problems.some((problem) => problem.includes('codexSessionsDir'))).toBe(true);
  });

  it('flags an unrelated absolute path outside the vault via the generic sweep', async () => {
    const claudeProjectsDir = join(vaultRoot, '.secondbrain', 'claude-projects');
    const codexSessionsDir = join(vaultRoot, '.secondbrain', 'codex-sessions');
    await mkdir(claudeProjectsDir, { recursive: true });
    await mkdir(codexSessionsDir, { recursive: true });
    await writeFile(join(claudeProjectsDir, 'session.jsonl'), '{}', 'utf8');
    await writeFile(join(codexSessionsDir, 'session.jsonl'), '{}', 'utf8');

    const settings = {
      overview: {
        claudeProjectsDir,
        useClaudeSessions: true,
        codexSessionsDir,
        useCodexSessions: true,
      },
      llm: {
        someUnrelatedPath: 'C:\\Users\\someone\\outside\\vault',
      },
    };

    const problems = checkSettingsGuard(settings, vaultRoot);
    expect(problems.some((problem) => problem.includes('llm.someUnrelatedPath'))).toBe(true);
  });
});
