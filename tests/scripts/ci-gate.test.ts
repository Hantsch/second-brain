/* Guards the CI gate wired up in story 065 (docs/requirements/065-the-gate-runs-on-every-push.md).
   A loose semver range on prettier (e.g. `^3.9.6`) would let the next `npm install`
   pull in a newer patch release with different formatting decisions, silently
   reformatting the whole tree and turning `format:check` red in CI without anyone
   having touched a single line of source. Pinning it exactly is what makes
   `npm run format` reproducible across machines and over time.
   This file collects the CI-gate deliverables of story 065 as they land; later
   deliverables (D2/D3) are expected to add further `describe` blocks here rather
   than opening new files, so don't assume this is the only guard it will ever hold. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const packageJsonRaw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
const packageJson = JSON.parse(packageJsonRaw) as {
  devDependencies: Record<string, string>;
};

describe('prettier is pinned to an exact version', () => {
  it('devDependencies.prettier has no ^ or ~ — a patch bump must not silently reformat the tree', () => {
    expect(packageJson.devDependencies.prettier).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

/* D2 — the verify lane (story 065). Mirrors tests/scripts/e2e-wiring.test.ts: read the
   actual workflow file, parse it as real YAML rather than pattern-matching alone where a
   structural assertion is possible, and fall back to raw-text checks for the "must never
   appear anywhere" guards (continue-on-error, ||-swallowing, secrets.) since those are
   properties of the whole file, not of one parsed node. */

const verifyWorkflowPath = new URL('../../.github/workflows/verify.yml', import.meta.url);
const verifyWorkflowRaw = readFileSync(verifyWorkflowPath, 'utf8');

type WorkflowStep = { run?: string; uses?: string; with?: Record<string, unknown> };
type WorkflowJob = {
  'runs-on'?: string;
  'timeout-minutes'?: number;
  steps?: WorkflowStep[];
};
type Workflow = {
  on?: Record<string, unknown> | unknown[];
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, WorkflowJob>;
};

const verifyWorkflow = parse(verifyWorkflowRaw) as Workflow;
const verifyJobs = Object.values(verifyWorkflow.jobs ?? {});
const verifySteps = verifyJobs.flatMap((job) => job.steps ?? []);

describe('verify.yml runs npm run verify on pull requests into main on a windows runner', () => {
  it('triggers only on pull_request targeting main', () => {
    const triggers = verifyWorkflow.on as Record<string, unknown>;
    expect(triggers, 'verify.yml must set an "on" trigger block').toBeTruthy();
    expect(Object.keys(triggers)).toEqual(['pull_request']);
    const pullRequestTrigger = triggers.pull_request as { branches?: string[] } | null;
    expect(pullRequestTrigger?.branches).toEqual(['main']);
  });

  it('runs on a windows-latest runner', () => {
    expect(verifyJobs.some((job) => job['runs-on'] === 'windows-latest')).toBe(true);
  });

  it('has a step whose run is exactly "npm run verify"', () => {
    expect(verifySteps.some((step) => step.run?.trim() === 'npm run verify')).toBe(true);
  });

  it('runs npm ci before npm run verify', () => {
    const runSteps = verifySteps.filter((step) => typeof step.run === 'string');
    const ciIndex = runSteps.findIndex((step) => step.run!.trim() === 'npm ci');
    const verifyIndex = runSteps.findIndex((step) => step.run!.trim() === 'npm run verify');
    expect(ciIndex, 'no step runs "npm ci"').toBeGreaterThanOrEqual(0);
    expect(verifyIndex, 'no step runs "npm run verify"').toBeGreaterThanOrEqual(0);
    expect(ciIndex, '"npm ci" must run before "npm run verify"').toBeLessThan(verifyIndex);
  });

  it('sets permissions: contents: read at the top level', () => {
    expect(verifyWorkflow.permissions).toEqual({ contents: 'read' });
  });

  it('sets a concurrency group with cancel-in-progress', () => {
    expect(verifyWorkflow.concurrency?.group).toBeTruthy();
    expect(verifyWorkflow.concurrency?.['cancel-in-progress']).toBe(true);
  });
});

describe("the verify job's status is the signal — no continue-on-error, no swallowed exit code", () => {
  it('contains no continue-on-error anywhere in the file', () => {
    expect(verifyWorkflowRaw).not.toMatch(/continue-on-error/);
  });

  it('contains no "|| true" or equivalent silent-swallow pattern', () => {
    expect(verifyWorkflowRaw).not.toMatch(/\|\|\s*true/);
    expect(verifyWorkflowRaw).not.toMatch(/\|\|\s*exit\s*0/);
  });
});

describe('the workflows reference no secrets and set no API key environment', () => {
  it('verify.yml contains no "secrets." anywhere', () => {
    expect(verifyWorkflowRaw).not.toMatch(/secrets\./);
  });

  it('ui-smoke.yml contains no "secrets." anywhere', () => {
    expect(uiSmokeWorkflowRaw).not.toMatch(/secrets\./);
  });

  it('neither workflow sets an API-key-shaped env var', () => {
    /* "no API key environment" is the second half of this describe's title — checked
       against both files' raw text, since an env: block can appear at workflow, job or
       step level and a structural check would have to walk all three. */
    const apiKeyEnvPattern = /(API_KEY|_TOKEN|_SECRET)\s*:/i;
    expect(verifyWorkflowRaw).not.toMatch(apiKeyEnvPattern);
    expect(uiSmokeWorkflowRaw).not.toMatch(apiKeyEnvPattern);
  });
});

describe('dependencies are cached — npm cache via setup-node and the electron binary cache keyed on the lockfile', () => {
  it('the setup-node step sets cache: npm', () => {
    const setupNodeStep = verifySteps.find((step) => step.uses?.startsWith('actions/setup-node'));
    expect(setupNodeStep, 'no actions/setup-node step found').toBeTruthy();
    expect(setupNodeStep!.with?.cache).toBe('npm');
    expect(setupNodeStep!.with?.['node-version']).toBe('20.x');
  });

  it('a separate actions/cache step keys on package-lock.json', () => {
    const cacheStep = verifySteps.find((step) => step.uses?.startsWith('actions/cache'));
    expect(cacheStep, 'no actions/cache step found').toBeTruthy();
    expect(String(cacheStep!.with?.key)).toMatch(/package-lock\.json/);
  });
});

/* D3 — the advisory UI lane (story 065). Own workflow file, own status check, and
   continue-on-error so it can never dilute or block the verify signal (AC2/AC5). */

const uiSmokeWorkflowPath = new URL('../../.github/workflows/ui-smoke.yml', import.meta.url);
const uiSmokeWorkflowRaw = readFileSync(uiSmokeWorkflowPath, 'utf8');

type UiSmokeWorkflow = {
  name?: string;
  on?: Record<string, unknown> | unknown[];
  jobs?: Record<string, WorkflowJob & { 'continue-on-error'?: boolean }>;
};

const uiSmokeWorkflow = parse(uiSmokeWorkflowRaw) as UiSmokeWorkflow;
const uiSmokeJobs = Object.entries(uiSmokeWorkflow.jobs ?? {});
const uiSmokeSteps = uiSmokeJobs.flatMap(([, job]) => job.steps ?? []);

describe(
  'ui-smoke.yml seeds, builds, shots and uploads the screenshots as an artifact, ' +
    'without blocking',
  () => {
    it('the job (or a step) sets continue-on-error: true', () => {
      const jobLevel = uiSmokeJobs.some(([, job]) => job['continue-on-error'] === true);
      const stepLevel = uiSmokeSteps.some(
        (step) =>
          (step as WorkflowStep & { 'continue-on-error'?: boolean })['continue-on-error'] === true,
      );
      expect(jobLevel || stepLevel).toBe(true);
    });

    it('runs npm run seed, npm run build and npm run shot in that order', () => {
      const runSteps = uiSmokeSteps.filter((step) => typeof step.run === 'string');
      const seedIndex = runSteps.findIndex((step) => step.run!.trim() === 'npm run seed');
      const buildIndex = runSteps.findIndex((step) => step.run!.trim() === 'npm run build');
      const shotIndex = runSteps.findIndex((step) => step.run!.trim() === 'npm run shot');
      expect(seedIndex, 'no step runs "npm run seed"').toBeGreaterThanOrEqual(0);
      expect(buildIndex, 'no step runs "npm run build"').toBeGreaterThanOrEqual(0);
      expect(shotIndex, 'no step runs "npm run shot"').toBeGreaterThanOrEqual(0);
      expect(seedIndex, '"npm run seed" must run before "npm run build"').toBeLessThan(buildIndex);
      expect(buildIndex, '"npm run build" must run before "npm run shot"').toBeLessThan(shotIndex);
    });

    it('uploads .screenshots/ via actions/upload-artifact', () => {
      const uploadStep = uiSmokeSteps.find((step) =>
        step.uses?.startsWith('actions/upload-artifact'),
      );
      expect(uploadStep, 'no actions/upload-artifact step found').toBeTruthy();
      expect(String(uploadStep!.with?.path)).toMatch(/\.screenshots/);
    });
  },
);

describe('the advisory UI lane lives in its own workflow file', () => {
  it('ui-smoke.yml and verify.yml are two distinct files with different job names', () => {
    expect(uiSmokeWorkflowPath.pathname).not.toBe(verifyWorkflowPath.pathname);
    const uiSmokeJobNames = Object.keys(uiSmokeWorkflow.jobs ?? {});
    const verifyJobNames = Object.keys(verifyWorkflow.jobs ?? {});
    expect(uiSmokeJobNames.length).toBeGreaterThan(0);
    expect(verifyJobNames.length).toBeGreaterThan(0);
    uiSmokeJobNames.forEach((name) => expect(verifyJobNames).not.toContain(name));
  });

  it('ui-smoke.yml has no "npm run verify" step — it is not a copy of the required lane', () => {
    expect(uiSmokeSteps.some((step) => step.run?.trim() === 'npm run verify')).toBe(false);
  });
});

describe('ui-smoke.yml triggers only on pull_request targeting main', () => {
  it('does not trigger on push to any branch', () => {
    const triggers = uiSmokeWorkflow.on as Record<string, unknown>;
    expect(triggers, 'ui-smoke.yml must set an "on" trigger block').toBeTruthy();
    expect(Object.keys(triggers)).toEqual(['pull_request']);
    const pullRequestTrigger = triggers.pull_request as { branches?: string[] } | null;
    expect(pullRequestTrigger?.branches).toEqual(['main']);
  });
});
