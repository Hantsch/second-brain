/* Env-gated scripted update check for the e2e suite: the suite forbids real
   network requests, so `SB_E2E_UPDATE_FIXTURE` names the outcomes of successive
   checks. Unset, empty or invalid means "use the real checker". */

import type { UpdateCheckResult } from './checker';

const ENV_VAR = 'SB_E2E_UPDATE_FIXTURE';

const OUTCOMES: Record<string, UpdateCheckResult> = {
  offline: { kind: 'failed', reason: 'network' },
  http: { kind: 'failed', reason: 'http' },
  'up-to-date': { kind: 'up-to-date' },
  available: {
    kind: 'available',
    version: '99.0.0',
    notes: '### Added\n- Fixture release',
    releasedAt: null,
  },
};

/** One outcome per call; the last one repeats. */
export function updateFixtureFor(): (() => Promise<UpdateCheckResult>) | undefined {
  const raw = process.env[ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const names = raw.split(',').map((name) => name.trim());
  const script: UpdateCheckResult[] = [];
  for (const name of names) {
    const outcome = OUTCOMES[name];
    if (outcome === undefined) return undefined;
    script.push(outcome);
  }
  let next = 0;
  return async () => script[Math.min(next++, script.length - 1)]!;
}
