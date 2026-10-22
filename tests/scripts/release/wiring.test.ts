/* Covers .github/workflows/release.yml against the flags and commit message scripts/ produce. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { planRelease } from '../../../scripts/lib/release/plan.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any -- parsed YAML is untyped by nature */
const workflow: any = parse(readFileSync(resolve(__dirname, '../../../.github/workflows/release.yml'), 'utf8'));
const job: any = workflow.jobs.release;
const steps: any[] = job.steps;
const releaseStep = steps.find((s) => typeof s.run === 'string' && s.run.includes('scripts/release.mjs'));
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('release workflow', () => {
  it('triggers on pushes to main and on manual dispatch with the three inputs', () => {
    expect(workflow.on.push.branches).toEqual(['main']);
    const inputs = workflow.on.workflow_dispatch.inputs;
    expect(inputs.version.type).toBe('string');
    expect(inputs.bump.type).toBe('choice');
    expect(inputs.bump.options).toEqual(['', 'patch', 'minor', 'major']);
    expect(inputs.dry_run.type).toBe('boolean');
  });

  it('may write contents and never runs two releases at once', () => {
    expect(workflow.permissions).toEqual({ contents: 'write' });
    expect(workflow.concurrency).toEqual({ group: 'release', 'cancel-in-progress': false });
  });

  it('runs on Windows only, with full history and Node 20', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['release']);
    expect(job['runs-on']).toBe('windows-latest');
    const checkout = steps.find((s) => String(s.uses).startsWith('actions/checkout'));
    expect(checkout.with['fetch-depth']).toBe(0);
    const node = steps.find((s) => String(s.uses).startsWith('actions/setup-node'));
    expect(node.with['node-version']).toBe('20.x');
  });

  it('installs and verifies before releasing, then sets the bot identity', () => {
    const runs = steps.map((s) => s.run ?? '');
    const at = (needle: string) => runs.findIndex((r) => r.includes(needle));
    expect(at('npm ci')).toBeGreaterThan(-1);
    expect(at('npm run verify')).toBeGreaterThan(at('npm ci'));
    expect(at('git config user.name "github-actions[bot]"')).toBeGreaterThan(at('npm run verify'));
    expect(runs[at('git config user.name')]).toContain(
      'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
    );
    expect(at('scripts/release.mjs')).toBeGreaterThan(at('git config user.name'));
  });

  it('maps push to --if-pending and the dispatch inputs to flags, through env vars', () => {
    const run: string = releaseStep.run;
    expect(run).toContain('--if-pending');
    expect(run).toContain('--version');
    expect(run).toContain('--bump');
    expect(run).toContain('--dry-run');
    expect(run).not.toContain('${{');
    expect(releaseStep.env.CI).toBe('true');
    expect(releaseStep.env.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
    expect(releaseStep.env.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
    expect(releaseStep.env.RELEASE_VERSION_INPUT).toBe('${{ inputs.version }}');
    expect(releaseStep.env.RELEASE_BUMP_INPUT).toBe('${{ inputs.bump }}');
    expect(releaseStep.env.RELEASE_DRY_RUN_INPUT).toBe('${{ inputs.dry_run }}');
  });

  it('fast-forwards dev to the release commit after releasing, never merging into it', () => {
    const at = (needle: string) => steps.findIndex((s) => (s.run ?? '').includes(needle));
    const sync = steps[at('HEAD:dev')];
    expect(at('HEAD:dev')).toBeGreaterThan(at('scripts/release.mjs'));
    expect(sync.if).toContain("github.ref_name == 'main'");
    expect(sync.if).toContain('inputs.dry_run != true');
    expect(sync.run).toContain('git merge-base --is-ancestor origin/dev HEAD');
    // The warnings name `git merge origin/main` as advice; only an executed line would be a bug.
    const lines: string[] = sync.run.split('\n').map((l: string) => l.trim());
    expect(lines.some((l) => l.startsWith('git merge '))).toBe(false);
  });

  it('only passes flags the runner parses', () => {
    const runner = readFileSync(resolve(__dirname, '../../../scripts/lib/release/runner.mjs'), 'utf8');
    for (const flag of ['--if-pending', '--version', '--bump', '--dry-run']) {
      expect(runner).toContain(`'${flag}'`);
    }
  });

  it('the release commit carries [skip ci] and the workflow skips such a commit', () => {
    const plan = planRelease({
      changelogText: '# Changelog\n\n## Unreleased\n\n### Fixed\n\n- A fix.\n',
      pkgText: '{\n  "name": "gaston",\n  "version": "1.0.0"\n}\n',
      lockText: '{\n  "name": "gaston",\n  "version": "1.0.0",\n  "packages": {\n    "": {\n      "version": "1.0.0"\n    }\n  }\n}\n',
      tags: [],
      dryRun: false,
      isCi: true,
      today: '2026-01-01',
    });
    const commit = plan.commands.find((c: { cmd: string; args: string[] }) => c.args[0] === 'commit');
    const message = commit?.args[commit.args.indexOf('-m') + 1] ?? '';
    expect(message).toContain('[skip ci]');
    expect(job.if).toContain('[skip ci]');
    expect(job.if).toContain('github.event.head_commit.message');
  });
});
