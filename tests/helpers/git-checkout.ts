import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export type EolGuardPlan = { run: true } | { run: false; reason: string };

/* A downloaded zip has no `.git` entry (file for worktrees/submodules, folder
   otherwise). Only that case may skip; a checkout with git missing must stay
   red rather than pass unchecked. */
export function eolGuardPlan(root: string | URL): EolGuardPlan {
  const gitEntry = new URL(
    '.git',
    root instanceof URL ? root : `file:///${root.replace(/\\/g, '/')}/`,
  );
  return existsSync(gitEntry)
    ? { run: true }
    : { run: false, reason: 'no .git at the repo root (downloaded zip)' };
}

/* Deliberately uncaught: an unrunnable git inside a checkout is a failure. */
export function indexEolLines(root: string | URL, git = 'git'): string[] {
  const output = execFileSync(git, ['ls-files', '--eol'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.split('\n').filter((line) => line.trim() !== '');
}
