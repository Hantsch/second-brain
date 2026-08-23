/* The asset table behind an in-app engine fetch (033, D1): for each runtime
   and platform (and, for llama.cpp, each build variant and CPU architecture),
   what to download, how large it is, and where it lands under `<userData>`. A
   pinned, curated table — not a live query of a releases API — so a plan is
   reproducible and unit-testable without network; bumping a release is a
   one-line edit here.
   Model files (the other half of `RuntimeDownloadPlan`, see `plan.ts`) have
   no table entry: they come from wherever the user picked them (an Ollama
   tag, a Hugging Face file), so only their size and target path are known at
   plan time, not a fixed descriptor. */

import type { EngineBuildId, RuntimeId } from '@shared/types';

/** How a release asset is packed. llama.cpp ships ZIPs on Windows and
    gzipped tarballs on macOS and Linux, and the two need different
    extractors in main (`unzip.ts` vs `untar.ts`) — so the format is data on
    the descriptor rather than something the extractor guesses. */
export type ArchiveFormat = 'zip' | 'tar.gz';

/** CPU architecture an asset is built for, in `os.arch()`'s own vocabulary.
    Not a cosmetic label: an x64 binary on an arm64 machine (or the reverse)
    is a download that cannot execute. */
export type EngineArch = 'x64' | 'arm64';

/** A companion archive that must be downloaded alongside the main engine
    archive — today only the Windows CUDA build's `cudart-*` redistributable.
    Its size is added to the main archive's size for one combined progress
    (033 decision "CUDA companion archive"), never a second download step. */
export interface ExtraArchive {
  /** Release asset file name, verbatim. */
  name: string;
  sizeMb: number;
  /** Absent means `'zip'` — see `archiveFormatOf`. */
  archiveFormat?: ArchiveFormat;
}

/** One buildable/downloadable engine for one runtime on one platform. Ollama
    has a single entry per installable platform (no build variants, and one
    universal installer per platform, hence no `arch`); llama.cpp has one
    entry per platform × build id × architecture, since the choice between
    builds is the whole point of this runtime (Decisions, Q1) and the release
    ships a separate archive per architecture. */
export interface EngineAssetDescriptor {
  runtime: RuntimeId;
  /** `os.platform()` value this entry applies to, e.g. `'win32'`. */
  platform: string;
  /** Only set for llama.cpp — Ollama's engine has no build variants. */
  build?: EngineBuildId;
  /** `os.arch()` value this entry applies to. Absent means "any
      architecture", which is Ollama's case, not llama.cpp's. */
  arch?: EngineArch;
  /** Release asset file name, verbatim — the one string a bumped release tag
      has to be checked against. Only llama.cpp entries carry one: Ollama's
      installer URLs live in `main/ipc/ollama-install.ts`, which is also the
      only place that knows a URL (core never does). */
  assetName?: string;
  /** Absent means `'zip'` — see `archiveFormatOf`. */
  archiveFormat?: ArchiveFormat;
  /** Size of the main archive/installer, in MB. */
  sizeMb: number;
  /** Directory the engine is unpacked/placed into, relative to `<userData>`. */
  targetSubdir: string;
  extraArchives?: ExtraArchive[];
}

/** Pinned llama.cpp release tag every asset name and size below was read
    from — `github.com/ggml-org/llama.cpp/releases/tag/b10603`, the newest tag
    at the time this table was last checked. A pin, not a promise that it is
    still the newest: bump the tag, the names and the sizes together, and let
    `descriptors.test.ts` catch a half-done bump. */
export const LLAMACPP_RELEASE_TAG = 'b10603';

/** Common prefix of every llama.cpp binary asset, so the pinned tag appears
    exactly once per name. */
const BIN = `llama-${LLAMACPP_RELEASE_TAG}-bin`;

/** The one CUDA toolkit minor this table curates. The release also ships
    13.3-x64 and 13.4-arm64 builds; carrying every minor version would turn a
    curated pin into a matrix nobody verifies, and 12.4 is the widest-driver
    option of the three. The `cudart-*` companion must match this exactly —
    that pairing is the reason the version is a named constant. */
const CUDA_VERSION = '12.4';

/** Curated asset table. Sizes are the pinned release's real compressed asset
    sizes, rounded to whole MB — good enough for a disk-fit judgement and a
    progress bar, not a byte-exact promise, since the download's own
    `Content-Length` overrides them per archive. */
export const ENGINE_ASSETS: readonly EngineAssetDescriptor[] = [
  /* Ollama: a single official installer per platform, no build variants and
     no per-architecture archive. Linux has no downloadable installer (`019c`
     — shell-script install is forbidden by the no-shell-string guardrail), so
     it gets no entry here.
     Only `runtimeSupportsPlatform` reads these two rows today; the installer
     that actually gets fetched, and the size the Ollama plan judges against,
     live in `main/ipc/ollama-install.ts`'s `INSTALLER_SOURCES`. The sizes are
     kept equal to that file's `installerSizeMb` on purpose: two different
     numbers for one installer would leave the reader unable to tell which is
     the stale one. */
  { runtime: 'ollama', platform: 'win32', sizeMb: 300, targetSubdir: 'runtimes/ollama' },
  { runtime: 'ollama', platform: 'darwin', sizeMb: 200, targetSubdir: 'runtimes/ollama' },

  /* llama.cpp: plain archives on every platform (033, Q4) — no installer, no
     shell string, so Linux is included unlike Ollama above. Windows ships
     ZIPs, macOS and Linux gzipped tarballs. */
  {
    runtime: 'llamacpp',
    platform: 'win32',
    build: 'cuda',
    arch: 'x64',
    assetName: `${BIN}-win-cuda-${CUDA_VERSION}-x64.zip`,
    sizeMb: 239,
    targetSubdir: 'runtimes/llamacpp',
    // The CUDA runtime redistributable carries no release tag in its name.
    extraArchives: [{ name: `cudart-llama-bin-win-cuda-${CUDA_VERSION}-x64.zip`, sizeMb: 373 }],
  },
  {
    runtime: 'llamacpp',
    platform: 'win32',
    build: 'vulkan',
    arch: 'x64',
    assetName: `${BIN}-win-vulkan-x64.zip`,
    sizeMb: 33,
    targetSubdir: 'runtimes/llamacpp',
  },
  {
    runtime: 'llamacpp',
    platform: 'win32',
    build: 'cpu',
    arch: 'x64',
    assetName: `${BIN}-win-cpu-x64.zip`,
    sizeMb: 17,
    targetSubdir: 'runtimes/llamacpp',
  },
  /* Windows on ARM: the release has no vulkan-arm64 asset and its only
     arm64 CUDA build is a 13.4 preview, so this native CPU build is the one
     curated entry — an arm64 machine therefore downgrades to `cpu` instead of
     being handed an x64 binary. */
  {
    runtime: 'llamacpp',
    platform: 'win32',
    build: 'cpu',
    arch: 'arm64',
    assetName: `${BIN}-win-cpu-arm64.zip`,
    sizeMb: 11,
    targetSubdir: 'runtimes/llamacpp',
  },
  {
    runtime: 'llamacpp',
    platform: 'linux',
    build: 'vulkan',
    arch: 'x64',
    assetName: `${BIN}-ubuntu-vulkan-x64.tar.gz`,
    archiveFormat: 'tar.gz',
    sizeMb: 31,
    targetSubdir: 'runtimes/llamacpp',
  },
  {
    runtime: 'llamacpp',
    platform: 'linux',
    build: 'vulkan',
    arch: 'arm64',
    assetName: `${BIN}-ubuntu-vulkan-arm64.tar.gz`,
    archiveFormat: 'tar.gz',
    sizeMb: 26,
    targetSubdir: 'runtimes/llamacpp',
  },
  // The plain `ubuntu-<arch>` assets are the CPU builds — no marker in the name.
  {
    runtime: 'llamacpp',
    platform: 'linux',
    build: 'cpu',
    arch: 'x64',
    assetName: `${BIN}-ubuntu-x64.tar.gz`,
    archiveFormat: 'tar.gz',
    sizeMb: 16,
    targetSubdir: 'runtimes/llamacpp',
  },
  {
    runtime: 'llamacpp',
    platform: 'linux',
    build: 'cpu',
    arch: 'arm64',
    assetName: `${BIN}-ubuntu-arm64.tar.gz`,
    archiveFormat: 'tar.gz',
    sizeMb: 12,
    targetSubdir: 'runtimes/llamacpp',
  },
  /* macOS: one build id (`macos`, always Metal-backed) but two real
     architectures. Intel Macs need the x64 tarball and Apple Silicon the
     arm64 one — there is no universal binary in the release, so getting this
     wrong installs an engine that cannot execute. */
  {
    runtime: 'llamacpp',
    platform: 'darwin',
    build: 'macos',
    arch: 'x64',
    assetName: `${BIN}-macos-x64.tar.gz`,
    archiveFormat: 'tar.gz',
    sizeMb: 11,
    targetSubdir: 'runtimes/llamacpp',
  },
  {
    runtime: 'llamacpp',
    platform: 'darwin',
    build: 'macos',
    arch: 'arm64',
    assetName: `${BIN}-macos-arm64.tar.gz`,
    archiveFormat: 'tar.gz',
    sizeMb: 10,
    targetSubdir: 'runtimes/llamacpp',
  },
];

/** An archive's format, with the default applied: ZIP, because that is what
    the majority of entries are and what the pre-tarball table implied. One
    helper for both the main archive and its companions, so no caller has to
    remember the default. */
export function archiveFormatOf(archive: { archiveFormat?: ArchiveFormat }): ArchiveFormat {
  return archive.archiveFormat ?? 'zip';
}

/** Total size of an engine fetch: the main archive plus every companion
    archive, summed into the one progress figure the download loop reports
    against (033 decision "CUDA companion archive"). */
export function totalEngineDownloadMb(asset: EngineAssetDescriptor): number {
  const extras = asset.extraArchives ?? [];
  return asset.sizeMb + extras.reduce((sum, extra) => sum + extra.sizeMb, 0);
}

/** Look up the descriptor for one runtime/platform/build/arch combination.
    `build` and `arch` are each ignored when the entry doesn't specify one
    (Ollama has neither) and when the caller doesn't pass one — so an
    arch-less call still behaves like it did before architectures existed, and
    a caller that does pass `os.arch()` can never be handed an archive for a
    different architecture. Returns `undefined` when this combination has no
    known asset, which is exactly the case `plan.ts` turns into
    `blockedReason: 'unsupported-platform'`. */
export function getEngineAsset(
  runtime: RuntimeId,
  platform: string,
  build?: EngineBuildId,
  arch?: string,
): EngineAssetDescriptor | undefined {
  return ENGINE_ASSETS.find(
    (asset) =>
      asset.runtime === runtime &&
      asset.platform === platform &&
      (asset.build === undefined || build === undefined || asset.build === build) &&
      (asset.arch === undefined || arch === undefined || asset.arch === arch),
  );
}

/** Whether this runtime has any engine asset at all for this platform (and,
    when given, this architecture), regardless of build variant — the
    platform-support check both the engine fetch and the model fetch key off
    (a model is pointless on a platform that can't run the engine in the
    first place). */
export function runtimeSupportsPlatform(
  runtime: RuntimeId,
  platform: string,
  arch?: string,
): boolean {
  return getEngineAsset(runtime, platform, undefined, arch) !== undefined;
}

/** Every build id this platform/arch has an asset for, in the table's own
    order and without repeats — what an install dialog offers as alternatives
    to the preselected build (033, D10: "the preselected build can be
    changed"). Empty for a runtime with no build variants (Ollama) or an
    unsupported platform. */
export function availableEngineBuilds(
  runtime: RuntimeId,
  platform: string,
  arch?: string,
): EngineBuildId[] {
  const builds = ENGINE_ASSETS.filter(
    (asset) =>
      asset.runtime === runtime &&
      asset.platform === platform &&
      (asset.arch === undefined || arch === undefined || asset.arch === arch),
  )
    .map((asset) => asset.build)
    .filter((build): build is EngineBuildId => build !== undefined);
  // One build id can have several rows (one per architecture); the dialog
  // must not offer the same choice twice.
  return [...new Set(builds)];
}
