/**
 * `ClaudeSessionReader` — die Arbeitsspur der Agenten-CLI, gelesen wie ein
 * Verzeichnis: Ordner auflisten, Dateien nach mtime sortieren, von den neuesten
 * Kopf und Ende lesen. Der Rest bleibt liegen; ein Vault mit 29 Projektordnern
 * darf keine zwei Sekunden kosten.
 *
 * Nie geoeffnet wird: eine Datei, die nicht in die Auswahl kommt. Nie erfunden
 * wird: eine Sitzung ohne Records — eine leere Datei ist keine Arbeitsspur.
 */

import type { ClaudeSession } from '@shared/types';
import { readSessionFacts } from './jsonl';
import { projectNameOf, resolveProjectPath } from './paths';
import type { ClaudeFileInfo, ClaudeFileSystem, SessionFacts, SessionListOptions } from './types';
import type { SessionReader } from './types';
import {
  DEFAULT_SESSION_LIMIT,
  HEAD_BYTES,
  HEAD_LINES,
  READ_CONCURRENCY,
  TAIL_BYTES,
  TRANSCRIPT_EXTENSION,
} from './types';

export interface ClaudeReaderOptions {
  fs: ClaudeFileSystem;
  /** Wurzel der Projektordner. Leer oder fehlend = `~/.claude/projects`. */
  projectsDir?: string | null;
  headBytes?: number;
  headLines?: number;
  tailBytes?: number;
  /** So viele Dateien werden gleichzeitig gelesen. */
  concurrency?: number;
}

/** Der Standardort der Verlaufsdateien, wenn die Einstellung leer ist. */
export function claudeProjectsDir(fs: ClaudeFileSystem, override?: string | null): string {
  const trimmed = override?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fs.join(fs.homeDir(), '.claude', 'projects');
}

/** Eine Kandidatendatei mit dem Ordner, in dem sie liegt. */
interface Candidate {
  dirName: string;
  file: ClaudeFileInfo;
}

export class ClaudeSessionReader implements SessionReader {
  private readonly fs: ClaudeFileSystem;
  private readonly concurrency: number;
  private readonly factsOptions: { headBytes: number; headLines: number; tailBytes: number };
  /** Wurzel der Projektordner, absolut. */
  readonly root: string;

  constructor(options: ClaudeReaderOptions) {
    this.fs = options.fs;
    this.root = claudeProjectsDir(options.fs, options.projectsDir ?? null);
    this.concurrency = Math.max(1, options.concurrency ?? READ_CONCURRENCY);
    this.factsOptions = {
      headBytes: options.headBytes ?? HEAD_BYTES,
      headLines: options.headLines ?? HEAD_LINES,
      tailBytes: options.tailBytes ?? TAIL_BYTES,
    };
  }

  /**
   * Die neuesten Sitzungen. Fehlt das Verzeichnis, ist die Antwort eine leere
   * Liste — auf einem Rechner ohne Claude Code ist das die Wahrheit, kein Fehler.
   */
  async list(options: SessionListOptions = {}): Promise<ClaudeSession[]> {
    const limit =
      options.limit === undefined || options.limit <= 0 ? DEFAULT_SESSION_LIMIT : options.limit;
    const candidates = await this.candidates(options.since);
    const chosen = candidates.slice(0, limit);

    const facts = await this.readAll(chosen);
    const paths = await this.resolvePaths(chosen, facts);

    const sessions: ClaudeSession[] = [];
    for (let index = 0; index < chosen.length; index += 1) {
      const candidate = chosen[index]!;
      const fact = facts[index]!;
      if (fact.records === 0) continue;
      sessions.push(toSession(candidate, fact, paths.get(candidate.dirName)!));
    }
    sessions.sort((a, b) =>
      a.lastActivity === b.lastActivity
        ? a.id.localeCompare(b.id)
        : a.lastActivity < b.lastActivity
          ? 1
          : -1,
    );
    return sessions;
  }

  /** Alle Verlaufsdateien unter der Wurzel, neueste zuerst. */
  private async candidates(since?: string): Promise<Candidate[]> {
    const dirs = await this.fs.listDirs(this.root);
    const found: Candidate[] = [];
    for (const dirName of dirs.sort()) {
      const files = await this.fs.listFiles(this.fs.join(this.root, dirName));
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith(TRANSCRIPT_EXTENSION)) continue;
        if (file.size <= 0) continue;
        if (since !== undefined && file.modified < since) continue;
        found.push({ dirName, file });
      }
    }
    found.sort((a, b) =>
      a.file.modified === b.file.modified
        ? a.file.name.localeCompare(b.file.name)
        : a.file.modified < b.file.modified
          ? 1
          : -1,
    );
    return found;
  }

  /** Kopf und Ende der ausgewaehlten Dateien, mit begrenzter Gleichzeitigkeit. */
  private async readAll(candidates: readonly Candidate[]): Promise<SessionFacts[]> {
    const facts: SessionFacts[] = [];
    for (let start = 0; start < candidates.length; start += this.concurrency) {
      const batch = candidates.slice(start, start + this.concurrency);
      const read = await Promise.all(
        batch.map((candidate) => readSessionFacts(this.fs, candidate.file, this.factsOptions)),
      );
      facts.push(...read);
    }
    return facts;
  }

  /**
   * Je Ordner ein Arbeitsverzeichnis. Die `cwd`-Felder der gelesenen Dateien
   * entscheiden; nur wo keines steht, wird geraten und gegen die Platte geprueft.
   */
  private async resolvePaths(
    candidates: readonly Candidate[],
    facts: readonly SessionFacts[],
  ): Promise<Map<string, { path: string; name: string; verified: boolean }>> {
    const cwds = new Map<string, string[]>();
    for (let index = 0; index < candidates.length; index += 1) {
      const dirName = candidates[index]!.dirName;
      const cwd = facts[index]!.cwd;
      const list = cwds.get(dirName) ?? [];
      if (cwd !== null && !list.includes(cwd)) list.push(cwd);
      cwds.set(dirName, list);
    }
    const resolved = new Map<string, { path: string; name: string; verified: boolean }>();
    for (const [dirName, list] of cwds) {
      resolved.set(
        dirName,
        await resolveProjectPath(dirName, {
          cwds: list,
          exists: (path) => this.fs.exists(path),
        }),
      );
    }
    return resolved;
  }
}

/** Fakten plus Verzeichnis zu einer Sitzung, wie der Renderer sie liest. */
function toSession(
  candidate: Candidate,
  facts: SessionFacts,
  project: { path: string; name: string },
): ClaudeSession {
  const id = candidate.file.name.slice(0, -TRANSCRIPT_EXTENSION.length);
  const cwd = facts.cwd ?? project.path;
  const lastActivity = facts.lastActivity ?? candidate.file.modified;
  return {
    id: facts.sessionId ?? id,
    cwd,
    projectName: facts.cwd === null ? project.name : projectNameOf(facts.cwd),
    // Die Zuordnung zum Vault-Projekt macht `link.ts` — der Leser kennt keinen Vault.
    vaultProject: null,
    gitBranch: facts.gitBranch,
    startedAt: facts.startedAt ?? lastActivity,
    lastActivity,
    messageCount: facts.messageCount,
    firstPrompt: facts.firstPrompt ?? '',
    summary: facts.summary,
    files: facts.files,
  };
}
