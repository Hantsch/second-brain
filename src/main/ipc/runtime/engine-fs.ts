/* The filesystem an engine install touches (033, D6), as one injectable seam
 * plus its Node implementation — split out of `llamacpp-install.ts` so the
 * staging discipline there reads as logic rather than as `fs` plumbing, and so
 * D7's model-file download can stream through the same seam.
 *
 * Every method is one the install actually needs, and every one of them is
 * total: a directory that is already there is a successful `mkdir`, a directory
 * that is already gone is a successful `removeDir`, and a directory that does
 * not exist lists as empty. Cleanup code that has to handle "it wasn't there
 * anyway" as an error is cleanup code that gets skipped.
 */

import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import type { WriteSink } from '../ollama-install';
import { nodeWriteSink } from '../ollama-install';
import type { UnzipFs } from './unzip';

export interface EngineFs extends UnzipFs {
  createSink(target: string): WriteSink;
  /** Recursive; an existing directory is success. */
  mkdir(dir: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Recursive; a missing directory is success — the point of calling this is
      "make sure it's gone". */
  removeDir(dir: string): Promise<void>;
  exists(target: string): Promise<boolean>;
  /** Whether this existing directory accepts writes — the measurement
      `planRuntimeDownload` turns into `no-write-permission`. */
  writable(dir: string): Promise<boolean>;
}

export const nodeEngineFs: EngineFs = {
  createSink: nodeWriteSink,
  mkdir: async (dir) => {
    await fsPromises.mkdir(dir, { recursive: true });
  },
  rename: (from, to) => fsPromises.rename(from, to),
  removeDir: (dir) => fsPromises.rm(dir, { recursive: true, force: true }),
  exists: async (target) => {
    try {
      await fsPromises.access(target);
      return true;
    } catch {
      return false;
    }
  },
  writable: async (dir) => {
    try {
      await fsPromises.access(dir, fsConstants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
  list: async (dir) => {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    } catch {
      // A directory that isn't there has no entries; walking on is correct.
      return [];
    }
  },
  chmod: (target, mode) => fsPromises.chmod(target, mode),
};
