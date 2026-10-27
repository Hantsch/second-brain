/* Type declaration for runner.mjs — the scripts folder is not in
   tsconfig.node.json's include. The signatures must match the implementation
   exactly; no any. */

export interface ExecOptions {
  cwd: string;
  shell?: boolean;
  /** Pipe stdout back instead of inheriting the terminal. */
  capture?: boolean;
}

export interface ExecResult {
  status: number | null;
  stdout: string;
  /** Set when the process did not start at all. */
  error?: Error;
}

export type Exec = (cmd: string, args: string[], options: ExecOptions) => ExecResult;

/** All paths are absolute. */
export interface ReleaseFs {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
  remove(path: string): void;
  /** Every file below `dir`, relative, `/`-separated, sorted. */
  listFiles(dir: string): string[];
}

export interface ReleaseDeps {
  argv: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  exec: Exec;
  fs: ReleaseFs;
  log: (line: string) => void;
  /** YYYY-MM-DD. */
  today: () => string;
  /** Path of the electron-builder CLI script; defaults to resolving the installed package. */
  builderCli?: () => string;
}

export declare const nodeExec: Exec;

export declare const nodeFs: ReleaseFs;

/** Returns the process exit code. */
export declare function runRelease(deps: ReleaseDeps): number;
