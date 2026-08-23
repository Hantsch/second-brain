import { describe, expect, it } from 'vitest';
import {
  ENGINE_ASSETS,
  LLAMACPP_RELEASE_TAG,
  archiveFormatOf,
  availableEngineBuilds,
  getEngineAsset,
  runtimeSupportsPlatform,
  totalEngineDownloadMb,
} from '@core/llm';

/* Fixtures for the curated asset table (033, D1). The table is data, so what
   is worth testing is its *internal consistency* — the failure mode is not a
   crash but a download that succeeds and then cannot be extracted or cannot
   be executed:

   - every llama.cpp asset name carries the pinned release tag, so a bumped
     tag can never be half-applied;
   - every name's extension agrees with its declared `archiveFormat`, so the
     fetch never hands a tarball to the ZIP extractor;
   - every platform/build row exists per architecture, and a lookup with an
     architecture never returns another architecture's archive. */

const LLAMACPP = ENGINE_ASSETS.filter((asset) => asset.runtime === 'llamacpp');

describe('the curated engine asset table', () => {
  it('pins a plausible llama.cpp release tag', () => {
    // A `b`-prefixed build number, which is what llama.cpp tags releases as.
    expect(LLAMACPP_RELEASE_TAG).toMatch(/^b\d+$/);
  });

  it('names an archive for every llama.cpp row, carrying the pinned tag', () => {
    expect(LLAMACPP.length).toBeGreaterThan(0);
    for (const asset of LLAMACPP) {
      expect(asset.assetName, `${asset.platform}/${asset.build}/${asset.arch}`).toContain(
        LLAMACPP_RELEASE_TAG,
      );
    }
  });

  it('gives every llama.cpp row a build and an architecture', () => {
    for (const asset of LLAMACPP) {
      expect(asset.build).toBeDefined();
      expect(['x64', 'arm64']).toContain(asset.arch);
    }
  });

  it('keeps every asset name in step with its declared archive format', () => {
    for (const asset of LLAMACPP) {
      const expected = asset.assetName?.endsWith('.tar.gz') ? 'tar.gz' : 'zip';
      expect(archiveFormatOf(asset), asset.assetName).toBe(expected);
      for (const extra of asset.extraArchives ?? []) {
        const extraExpected = extra.name.endsWith('.tar.gz') ? 'tar.gz' : 'zip';
        expect(archiveFormatOf(extra), extra.name).toBe(extraExpected);
      }
    }
  });

  it('ships ZIPs on Windows and gzipped tarballs on macOS and Linux', () => {
    for (const asset of LLAMACPP) {
      const expected = asset.platform === 'win32' ? 'zip' : 'tar.gz';
      expect(archiveFormatOf(asset), `${asset.platform} ${asset.assetName}`).toBe(expected);
    }
  });

  it('defaults an archive with no declared format to zip', () => {
    expect(archiveFormatOf({})).toBe('zip');
  });

  it('has no two rows for the same runtime/platform/build/architecture', () => {
    const keys = ENGINE_ASSETS.map(
      (asset) => `${asset.runtime}:${asset.platform}:${asset.build}:${asset.arch}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('getEngineAsset', () => {
  it('picks the architecture-correct macOS tarball — Intel and Apple Silicon differ', () => {
    // The whole point of the arch axis: there is no universal macOS binary,
    // and the wrong one installs an engine that cannot execute.
    expect(getEngineAsset('llamacpp', 'darwin', 'macos', 'x64')?.assetName).toBe(
      `llama-${LLAMACPP_RELEASE_TAG}-bin-macos-x64.tar.gz`,
    );
    expect(getEngineAsset('llamacpp', 'darwin', 'macos', 'arm64')?.assetName).toBe(
      `llama-${LLAMACPP_RELEASE_TAG}-bin-macos-arm64.tar.gz`,
    );
  });

  it('picks the native archive on Windows on ARM instead of the x64 one', () => {
    expect(getEngineAsset('llamacpp', 'win32', 'cpu', 'arm64')?.assetName).toBe(
      `llama-${LLAMACPP_RELEASE_TAG}-bin-win-cpu-arm64.zip`,
    );
    expect(getEngineAsset('llamacpp', 'win32', 'cpu', 'x64')?.assetName).toBe(
      `llama-${LLAMACPP_RELEASE_TAG}-bin-win-cpu-x64.zip`,
    );
  });

  it('reports no asset for a build this architecture has none of', () => {
    // Windows-on-ARM has neither a curated CUDA nor a vulkan asset — the
    // honest answer is `undefined`, which becomes `unsupported-platform`.
    expect(getEngineAsset('llamacpp', 'win32', 'vulkan', 'arm64')).toBeUndefined();
    expect(getEngineAsset('llamacpp', 'win32', 'cuda', 'arm64')).toBeUndefined();
    expect(getEngineAsset('llamacpp', 'win32', 'cpu', 'ia32')).toBeUndefined();
  });

  it('pairs the Windows CUDA build with a matching cudart companion', () => {
    const cuda = getEngineAsset('llamacpp', 'win32', 'cuda', 'x64');
    expect(cuda?.extraArchives).toHaveLength(1);
    // Same toolkit minor in both names, or the DLLs do not match the binary.
    const version = /cuda-(\d+\.\d+)-x64\.zip$/.exec(cuda?.assetName ?? '')?.[1];
    expect(version).toBeDefined();
    expect(cuda?.extraArchives?.[0]?.name).toBe(`cudart-llama-bin-win-cuda-${version}-x64.zip`);
    expect(cuda).toBeDefined();
    if (cuda) {
      // One combined figure, so the dialog shows one download, not two.
      expect(totalEngineDownloadMb(cuda)).toBe(
        cuda.sizeMb + (cuda.extraArchives?.[0]?.sizeMb ?? 0),
      );
    }
  });

  it('ignores the architecture for a runtime whose rows do not name one', () => {
    // Ollama ships one universal installer per platform, so any arch matches.
    for (const arch of ['x64', 'arm64', undefined]) {
      expect(getEngineAsset('ollama', 'win32', undefined, arch)).toBeDefined();
    }
    expect(runtimeSupportsPlatform('ollama', 'darwin', 'arm64')).toBe(true);
    expect(runtimeSupportsPlatform('ollama', 'linux')).toBe(false);
  });

  it('still answers an arch-less lookup, as it did before architectures existed', () => {
    expect(getEngineAsset('llamacpp', 'darwin', 'macos')).toBeDefined();
    expect(getEngineAsset('llamacpp', 'linux', 'cpu')).toBeDefined();
  });
});

describe('availableEngineBuilds', () => {
  it('offers every build the architecture actually has, without repeats', () => {
    expect(availableEngineBuilds('llamacpp', 'win32', 'x64')).toEqual(['cuda', 'vulkan', 'cpu']);
    expect(availableEngineBuilds('llamacpp', 'win32', 'arm64')).toEqual(['cpu']);
    expect(availableEngineBuilds('llamacpp', 'linux', 'arm64')).toEqual(['vulkan', 'cpu']);
    expect(availableEngineBuilds('llamacpp', 'darwin', 'arm64')).toEqual(['macos']);
  });

  it('collapses the per-architecture rows when no architecture is given', () => {
    // Two `cpu` rows on win32 (x64 and arm64) must not become two options.
    expect(availableEngineBuilds('llamacpp', 'win32')).toEqual(['cuda', 'vulkan', 'cpu']);
    expect(availableEngineBuilds('llamacpp', 'darwin')).toEqual(['macos']);
  });

  it('is empty for a runtime without build variants and for an unknown platform', () => {
    expect(availableEngineBuilds('ollama', 'win32')).toEqual([]);
    expect(availableEngineBuilds('llamacpp', 'freebsd', 'x64')).toEqual([]);
  });
});
