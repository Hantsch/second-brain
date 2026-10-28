/* Type declaration for lane-minutes.mjs — the scripts folder is not in
   tsconfig.node.json's include, so an import from a test would otherwise
   have no type information. The signature must match the implementation
   exactly; no any. */

export declare function laneReport(input: {
  startedAtMs: number;
  endedAtMs: number;
  budgetMinutes: number;
}): { summary: string; warning: string | null };
