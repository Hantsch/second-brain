/* Which llama.cpp engine build to preselect for this machine (033, D2). Pure
   classifier over the two facts a GPU scan already produces (`gpuName`,
   `gpuDetection` from `MachineFacts`) plus the platform and CPU
   architecture the plan runs on — no filesystem, no process, no Electron,
   platform and arch passed in as data rather than read from
   `process.platform`/`process.arch`.

   Decision (033, "Q1-fallback"): vendor is read out of `gpuName` when the
   scan is confident (`gpuDetection: 'detected'`); when the scan found a name
   but isn't confident (`'unknown'`), the vendor guess is not trusted and the
   build falls back to `vulkan` — the one accelerated build that runs on any
   vendor. No GPU name at all, in any detection state (including
   `'not-attempted'`, i.e. the scan didn't run or failed), means `cpu` — the
   only build that cannot fail for a missing driver.

   The result is always checked against D1's real asset table
   (`descriptors.ts`) before being returned: a platform/arch that doesn't
   ship the vendor-preferred build (there is no Linux CUDA entry, and no
   Windows-on-ARM vulkan entry) downgrades along the same "vulkan runs
   everywhere, cpu never fails" ladder, so every returned `buildId` is
   guaranteed to exist for the given platform *and architecture* rather than
   merely being asserted to by a docstring.

   Architecture is a separate axis from vendor, and only the vendor axis
   collapses on darwin: Apple Silicon's GPU is on-die and always
   Metal-backed, so there is no vendor branching inside darwin — but the
   release ships separate x64 (Intel Mac) and arm64 (Apple Silicon) tarballs,
   so `macos` is one build id over two real assets, not one universal binary.
   Handing an Intel Mac the arm64 archive would install an engine that
   cannot execute, which is why `arch` is threaded all the way into the
   table lookup instead of being assumed. */

import type { EngineBuildId, EngineBuildReason, MachineDetection, RuntimeId } from '@shared/types';
import { getEngineAsset } from './descriptors';

const LLAMACPP: RuntimeId = 'llamacpp';

/** Inputs a GPU-informed build choice needs — the subset of `MachineFacts`
    this judgement reads, plus the platform and architecture (passed as data,
    per guardrail 5). */
export interface EngineBuildInput {
  /** `os.platform()` value, e.g. `'win32'`, `'darwin'`, `'linux'`. */
  platform: string;
  /** `os.arch()` value, e.g. `'x64'`, `'arm64'`. A value the table has no
      asset for (`'ia32'`, say) yields no build rather than a wrong-arch one. */
  arch: string;
  gpuName: string | null;
  gpuDetection: MachineDetection;
}

export type { EngineBuildReason };

export interface EngineBuildChoice {
  buildId: EngineBuildId;
  /** Structured reasoning (`@shared/types`'s `EngineBuildReason`) — never a
      composed English sentence, so the renderer can translate it via `t()`
      (CLAUDE.md guardrail 7 applies both ways: an English sentence hardcoded
      into a German dialog is the same violation with the languages swapped). */
  reason: EngineBuildReason;
}

/** GPU vendor as read out of a free-text adapter name. Closed set plus
    `'unknown'` for a name that matches none of the known markers. */
type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';

const VENDOR_MARKERS: Record<Exclude<GpuVendor, 'unknown'>, RegExp> = {
  nvidia: /nvidia|geforce|rtx|quadro|tesla/i,
  amd: /amd|radeon/i,
  intel: /intel|arc|iris/i,
  apple: /apple m\d/i,
};

function classifyVendor(gpuName: string): GpuVendor {
  for (const [vendor, marker] of Object.entries(VENDOR_MARKERS) as [
    Exclude<GpuVendor, 'unknown'>,
    RegExp,
  ][]) {
    if (marker.test(gpuName)) return vendor;
  }
  return 'unknown';
}

/** The vendor-preferred build, before checking whether this platform's asset
    table actually ships it. */
function preferredBuild(vendor: GpuVendor): EngineBuildId {
  if (vendor === 'nvidia') return 'cuda';
  if (vendor === 'apple') return 'macos';
  // amd, intel, unknown: vulkan is the one accelerated build every vendor's
  // driver can run.
  return 'vulkan';
}

/** Downgrade ladder for a build the platform's asset table doesn't ship:
    cuda → vulkan → cpu; anything already at vulkan or cpu has nowhere lower
    to fall except cpu. `macos` never falls back — it is darwin's only build
    id (over two architectures), so its absence means this machine truly has
    no llama.cpp asset, which `plan.ts` already turns into
    `unsupported-platform`. */
function downgradeFrom(buildId: EngineBuildId): EngineBuildId | null {
  if (buildId === 'cuda') return 'vulkan';
  if (buildId === 'vulkan') return 'cpu';
  return null;
}

/** Walks the downgrade ladder until it finds a build this platform *and
    architecture* actually has an asset for, or runs out of rungs. Never
    hardcodes which platform ships which build — it asks D1's table
    (`getEngineAsset`) directly, so this stays correct if the table changes.
    Passing `arch` matters here and not only at the end: on Windows-on-ARM,
    cuda and vulkan exist for x64 only, so a downgrade that ignored arch
    would stop at vulkan and hand the machine an x64 archive. */
function firstAvailableBuild(
  platform: string,
  arch: string,
  buildId: EngineBuildId,
): EngineBuildId | null {
  let candidate: EngineBuildId | null = buildId;
  while (candidate !== null) {
    if (getEngineAsset(LLAMACPP, platform, candidate, arch) !== undefined) return candidate;
    candidate = downgradeFrom(candidate);
  }
  return null;
}

/**
 * Picks the llama.cpp build to preselect in the install dialog, from the
 * facts a machine scan already gathered. Never throws; returns a `buildId`
 * that exists in `descriptors.ts`'s asset table for the given platform *and*
 * architecture whenever the table has anything for that pair, because every
 * branch below is checked against the table before it is returned (see
 * `firstAvailableBuild`). For a machine the table covers not at all (an
 * unknown platform, an unsupported architecture) the ladder's bottom rung is
 * reported anyway and the missing asset becomes `plan.ts`'s
 * `unsupported-platform` — an honest refusal, not a wrong download.
 */
export function selectEngineBuild(input: EngineBuildInput): EngineBuildChoice {
  const { platform, arch, gpuName, gpuDetection } = input;

  // No vendor branching inside darwin: the GPU is on-die and always
  // Metal-backed, so `macos` is the build id whatever the scan says (033,
  // Decisions — "Apple M → the macOS build"). Which *archive* that is still
  // depends on `arch` — Intel and Apple Silicon get different tarballs.
  if (platform === 'darwin') {
    const build = firstAvailableBuild(platform, arch, 'macos') ?? 'macos';
    return { buildId: build, reason: { kind: 'macos' } };
  }

  const hasName = gpuName !== null && gpuName.length > 0;

  if (!hasName) {
    // No GPU name in any detection state — including 'not-attempted', which
    // covers a scan that failed to run at all — means no evidence of a GPU.
    const build = firstAvailableBuild(platform, arch, 'cpu') ?? 'cpu';
    return { buildId: build, reason: { kind: 'no-gpu' } };
  }

  const vendor = classifyVendor(gpuName);
  const confident = gpuDetection === 'detected';
  // A name the scan isn't confident about ('unknown') is not trusted enough
  // to pick a vendor-specific build — fall back to vulkan, the one
  // accelerated build every vendor's driver can run.
  const requested: EngineBuildId = confident ? preferredBuild(vendor) : 'vulkan';
  const build = firstAvailableBuild(platform, arch, requested) ?? 'cpu';

  return {
    buildId: build,
    reason: {
      kind: 'gpu',
      gpuName,
      confident,
      requestedBuild: requested,
      actualBuild: build,
    },
  };
}
