/* Judges what size of local model this machine can carry, from the facts a
   machine scan produces (see `MachineFacts` in `@shared/types`). Pure
   arithmetic over numbers that are already known or `null` — no filesystem,
   no process, no Electron. Every threshold below is a named constant with a
   comment on where the number comes from, because none of them are measured:
   this is a rule-of-thumb sizing aid, not a benchmark. `heuristic: true` is
   therefore permanent, not a toggle. */

import type {
  CapacityVerdict,
  LimitingFactor,
  MachineDetection,
  MachineFacts,
} from '@shared/types';

/* `LimitingFactor` and `CapacityVerdict` live in `@shared/types` (not here), so
   the renderer's separate TypeScript project (`tsconfig.web.json`) can type
   `MachineScanResult.verdict` without pulling in the rest of `core/llm` —
   only main may import and call `judgeCapacity` itself. Re-exported here so
   existing callers of `./capacity` and the `core/llm` barrel keep working. */
export type { CapacityVerdict, LimitingFactor };

/**
 * GB of memory per billion parameters at Q4 quantization. Q4 is ~4 bits per
 * weight (0.5 bytes/param); this rounds up a bit for KV-cache and runtime
 * overhead. Widely cited llama.cpp/Ollama rule of thumb, not measured on any
 * specific machine.
 */
const GB_PER_PARAM_B_AT_Q4 = 0.55;

/** VRAM reserved for context/KV-cache/driver overhead before sizing weights. */
const VRAM_HEADROOM_MB = 1024;

/** RAM reserved for the OS and the rest of the app before sizing weights. */
const RAM_OS_RESERVE_MB = 4096;

/**
 * CPU-only inference is far slower than GPU inference at the same parameter
 * count; "comfortable" on RAM alone means noticeably smaller than the raw
 * memory ceiling, or answers take too long to be usable. Rule of thumb, not
 * measured throughput.
 */
const RAM_ONLY_PENALTY_FACTOR = 0.5;

/** Extra margin subtracted from any GPU-based ceiling to reach "comfortable". */
const COMFORTABLE_HEADROOM_FACTOR = 0.8;

/** Below this many cores, CPU itself — not memory — becomes the bottleneck. */
const MIN_COMFORTABLE_CORES = 4;
/** Penalty applied to the RAM-based ceiling when cores are below the minimum. */
const LOW_CORE_PENALTY_FACTOR = 0.5;

/**
 * Coarse, common open-weight sizes used to report "what fits" in buckets a
 * user recognizes, rather than a precise-looking single number. Not a
 * catalog of actually available models — just familiar landmarks.
 */
const TIER_LANDMARKS_B: readonly number[] = [3, 7, 8, 13, 34, 70];

function tiersThatFit(maxComfortableParamsB: number | null): string[] {
  if (maxComfortableParamsB === null) return [];
  return TIER_LANDMARKS_B.filter((b) => b <= maxComfortableParamsB).map((b) => `${b}B`);
}

/** True when a GPU is known to exist by name, even if its VRAM size isn't. */
function hasNamedGpu(detection: MachineDetection, gpuName: string | null): boolean {
  return detection === 'detected' && gpuName !== null;
}

/**
 * Facts → verdict. Never throws, never guesses a specific number for a
 * missing fact — an unusable input degrades to `null`/`'unknown'` and is
 * named in `unknowns` so the caller can say so honestly.
 */
export function judgeCapacity(facts: MachineFacts): CapacityVerdict {
  const unknowns: string[] = [];

  if (facts.totalRamMb === null) unknowns.push('ram');
  if (facts.cpuCores === null) unknowns.push('cpu');
  // A GPU that was detected by name but whose VRAM size is unknown (the win32
  // 32-bit AdapterRAM truncation, see D2) is a distinct unknown from "there is
  // no GPU at all" — in the latter case, vramMb being null isn't missing data,
  // it's the correct answer.
  const namedGpuWithUnknownVram =
    hasNamedGpu(facts.gpuDetection, facts.gpuName) && facts.vramMb === null;
  if (namedGpuWithUnknownVram) unknowns.push('vram');

  const vramCeiling = vramBasedCeiling(facts.vramMb);
  const ramCeiling = ramBasedCeiling(facts.totalRamMb, facts.cpuCores);

  if (vramCeiling === null && ramCeiling === null) {
    return {
      limitingFactor: 'unknown',
      maxComfortableParamsB: null,
      maxPossibleParamsB: null,
      tiersThatFit: [],
      heuristic: true,
      unknowns,
    };
  }

  // Both ceilings can exist (GPU + a lot of RAM); the tighter one governs —
  // a model that doesn't fit in VRAM but would fit in RAM still has to run
  // on the CPU, and vice versa a large-RAM/small-VRAM box is VRAM-bound only
  // if VRAM is actually smaller.
  let limitingFactor: LimitingFactor;
  let comfortable: number;
  let possible: number;
  if (
    vramCeiling !== null &&
    (ramCeiling === null || vramCeiling.comfortable <= ramCeiling.comfortable)
  ) {
    limitingFactor = 'vram';
    comfortable = vramCeiling.comfortable;
    possible = vramCeiling.possible;
  } else {
    limitingFactor = ramCeiling!.cpuBound ? 'cpu' : 'ram';
    comfortable = ramCeiling!.comfortable;
    possible = ramCeiling!.possible;
  }

  return {
    limitingFactor,
    maxComfortableParamsB: comfortable,
    maxPossibleParamsB: possible,
    tiersThatFit: tiersThatFit(comfortable),
    heuristic: true,
    unknowns,
  };
}

interface Ceiling {
  comfortable: number;
  possible: number;
  /** Whether low core count, not memory, drove the comfortable ceiling down. */
  cpuBound: boolean;
}

function vramBasedCeiling(vramMb: number | null): Ceiling | null {
  if (vramMb === null) return null;
  const usableMb = Math.max(0, vramMb - VRAM_HEADROOM_MB);
  const possible = usableMb / 1024 / GB_PER_PARAM_B_AT_Q4;
  const comfortable = possible * COMFORTABLE_HEADROOM_FACTOR;
  return { comfortable, possible, cpuBound: false };
}

function ramBasedCeiling(totalRamMb: number | null, cpuCores: number | null): Ceiling | null {
  if (totalRamMb === null) return null;
  const usableMb = Math.max(0, totalRamMb - RAM_OS_RESERVE_MB);
  const possible = usableMb / 1024 / GB_PER_PARAM_B_AT_Q4;
  const lowCores = cpuCores !== null && cpuCores < MIN_COMFORTABLE_CORES;
  const penalty = lowCores
    ? RAM_ONLY_PENALTY_FACTOR * LOW_CORE_PENALTY_FACTOR
    : RAM_ONLY_PENALTY_FACTOR;
  const comfortable = possible * penalty;
  return { comfortable, possible, cpuBound: lowCores };
}
