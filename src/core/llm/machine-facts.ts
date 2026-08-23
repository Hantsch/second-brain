/* Merges what platform detection measured with what the user typed in by hand
   (028). This is the one seam both `llm:scanMachine` and
   `scanCapacityVerdict()` (main-side, D3) call through before `judgeCapacity`
   ever sees the facts — so it must stay pure and total: no Electron, no `os`,
   no I/O, and it must never throw, because a later deliverable's IPC path
   depends on that. */

import type { MachineFacts } from '@shared/types';

/**
 * Applies a manual VRAM override on top of facts as detection produced them.
 *
 * `facts.vramMb` is read as the detected value (whatever platform detection
 * found, or `null`); the returned object's `vramMb` becomes the effective
 * value that `judgeCapacity` and every other consumer read — manual wins over
 * detected when both exist. Provenance survives the merge in `detectedVramMb`
 * / `manualVramMb` / `vramSource`, and `vramConflict` flags a disagreement
 * for the UI to surface (Q2) without picking a winner itself.
 *
 * Pure: does not mutate `facts`, always returns a new object.
 */
export function applyVramOverride(facts: MachineFacts, overrideMb: number | null): MachineFacts {
  const detectedVramMb = facts.vramMb;
  const hasOverride = overrideMb !== null;
  const hasDetected = detectedVramMb !== null;

  const vramMb = hasOverride ? overrideMb : detectedVramMb;
  const vramSource: NonNullable<MachineFacts['vramSource']> = hasOverride
    ? 'manual'
    : hasDetected
      ? 'detected'
      : 'none';
  const vramConflict = hasOverride && hasDetected && overrideMb !== detectedVramMb;

  return {
    ...facts,
    vramMb,
    detectedVramMb,
    manualVramMb: overrideMb,
    vramSource,
    vramConflict,
  };
}
