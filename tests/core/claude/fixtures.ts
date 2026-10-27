/* Werkzeug fuer die Tests der Claude-Spur. Keine `.test.ts`-Datei, damit vitest
   sie nicht als Suite sammelt.

   Wichtig: hier steht ein Speicher-Adapter fuer `ClaudeFileSystem`. Kein Test liest
   das echte `~/.claude` — die einzige Datei, die von der Platte kommt, ist der
   nachgebaute Bestand unter `tests/fixtures/claude/`. */

import type { ClaudeFileInfo, ClaudeFileSystem } from '@core/claude';
import type { ClaudeRecord } from '@core/claude';

/** Wurzel der nachgebauten Projektordner im Speicher-Adapter. */
export const FAKE_ROOT = '/claude/projects';

/** Ordnername des Beispielprojekts — genau so kodiert Claude Code ihn. */
export const SB_DIR = 'c--development-Hantsch-second-brain';

/** Das Arbeitsverzeichnis dahinter, wie es in den Records steht. */
export const SB_CWD = 'c:\\development\\Hantsch\\second-brain';

export interface FakeFile {
  /** Ordnername unter der Wurzel. */
  dir: string;
  name: string;
  text: string;
  /** mtime als ISO. */
  modified: string;
}

export interface FakeClaudeFs extends ClaudeFileSystem {
  /** Protokoll aller Byte-Fenster, die gelesen wurden. */
  readonly reads: { path: string; start: number; length: number }[];
  /** Summe der angeforderten Bytes — der Beweis, dass nichts ganz gelesen wird. */
  bytesRequested(): number;
}

export interface FakeFsOptions {
  files: readonly FakeFile[];
  /** Pfade, die `exists` bejaht — fuer die Aufloesung ohne `cwd` in den Records. */
  existing?: readonly string[];
  root?: string;
}

function key(path: string): string {
  return path
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Speicher-Adapter. `readRange` arbeitet ueber `Buffer`, damit Byte-Fenster
 * dieselben Kanten haben wie auf der Platte; die Puffer werden je Inhalt
 * zwischengespeichert, sonst kostet ein 5-MB-Text pro Lesevorgang eine Kopie.
 */
export function fakeClaudeFs(options: FakeFsOptions): FakeClaudeFs {
  const root = options.root ?? FAKE_ROOT;
  const files = options.files;
  const existing = new Set((options.existing ?? []).map(key));
  const buffers = new Map<string, Buffer>();
  const reads: { path: string; start: number; length: number }[] = [];

  const bufferFor = (text: string): Buffer => {
    const known = buffers.get(text);
    if (known !== undefined) return known;
    const buffer = Buffer.from(text, 'utf8');
    buffers.set(text, buffer);
    return buffer;
  };
  const pathOf = (file: FakeFile): string => `${root}/${file.dir}/${file.name}`;
  const infoOf = (file: FakeFile): ClaudeFileInfo => ({
    path: pathOf(file),
    name: file.name,
    size: bufferFor(file.text).length,
    modified: file.modified,
  });

  return {
    reads,
    bytesRequested: () => reads.reduce((sum, read) => sum + read.length, 0),

    listDirs: async (path: string) => {
      if (key(path) !== key(root)) return [];
      return [...new Set(files.map((file) => file.dir))].sort();
    },

    listFiles: async (path: string) =>
      files.filter((file) => key(`${root}/${file.dir}`) === key(path)).map(infoOf),

    readRange: async (path: string, start: number, length: number) => {
      reads.push({ path, start, length });
      const file = files.find((candidate) => key(pathOf(candidate)) === key(path));
      if (file === undefined) return '';
      return bufferFor(file.text)
        .subarray(Math.max(0, start), Math.max(0, start) + length)
        .toString('utf8');
    },

    exists: async (path: string) =>
      existing.has(key(path)) || files.some((file) => key(pathOf(file)) === key(path)),

    join: (...parts: string[]) => parts.join('/').replace(/\/{2,}/g, '/'),
    homeDir: () => '/home/test',
  };
}

/** Eine JSONL-Zeile aus einem Record. */
export function line(record: ClaudeRecord): string {
  return JSON.stringify(record);
}

/** Mehrere Records als Datei, mit Schlusszeilenumbruch. */
export function jsonl(records: readonly ClaudeRecord[]): string {
  return `${records.map(line).join('\n')}\n`;
}

interface TurnOptions {
  cwd?: string;
  branch?: string;
  at: string;
}

/** Ein Nutzer-Prompt, wie Claude Code ihn schreibt. */
export function prompt(text: string, options: TurnOptions): ClaudeRecord {
  return {
    type: 'user',
    uuid: `u-${options.at}`,
    sessionId: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
    timestamp: options.at,
    cwd: options.cwd ?? SB_CWD,
    gitBranch: options.branch ?? 'main',
    message: { role: 'user', content: [{ type: 'text', text }] },
  };
}

/** Zusaetzliche, optionale Felder eines Assistant-Turns fuer die D6-Fakten. */
interface AssistantExtras {
  /** Werkzeugaufruf auf eine Datei. */
  file?: string;
  model?: string;
  usage?: Record<string, unknown>;
  /** Traegt einen `Task`-Werkzeugaufruf mit diesem `subagent_type`. */
  subagentType?: string;
}

/** Eine Modellantwort, optional mit Werkzeugaufruf, Modell, Token-Verbrauch und Subagent. */
export function assistant(text: string, options: TurnOptions & AssistantExtras): ClaudeRecord {
  const content: Record<string, unknown>[] = [{ type: 'text', text }];
  if (options.file !== undefined) {
    content.push({
      type: 'tool_use',
      id: `t-${options.at}`,
      name: 'Read',
      input: { file_path: options.file },
    });
  }
  if (options.subagentType !== undefined) {
    content.push({
      type: 'tool_use',
      id: `task-${options.at}`,
      name: 'Task',
      input: { subagent_type: options.subagentType },
    });
  }
  const message: Record<string, unknown> = { role: 'assistant', content };
  if (options.model !== undefined) message.model = options.model;
  if (options.usage !== undefined) message.usage = options.usage;
  return {
    type: 'assistant',
    uuid: `a-${options.at}`,
    sessionId: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
    timestamp: options.at,
    cwd: options.cwd ?? SB_CWD,
    gitBranch: options.branch ?? 'main',
    message: message as never,
  };
}

/** Ein Werkzeugergebnis — als `user`-Record, genau wie auf der Platte. */
export function toolResult(at: string, forUuid: string): ClaudeRecord {
  return {
    type: 'user',
    uuid: `r-${at}`,
    timestamp: at,
    cwd: SB_CWD,
    toolUseResult: { stdout: 'ok' },
    sourceToolAssistantUUID: forUuid,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t-${at}` }] },
  };
}

/** Buchhaltung: die letzte Zeile ist meistens keine Nachricht (RESEARCH.md §2). */
export function bookkeeping(at: string): ClaudeRecord {
  return { type: 'last-prompt', timestamp: at, leafUuid: `u-${at}` };
}

/** A ~5 MB transcript, built once and shared by every file of `scaleFiles()`. */
function hugeTranscript(): string {
  const head = jsonl([
    prompt('Grosse Sitzung mit viel Werkzeugverkehr', { at: '2026-08-01T08:00:00.000Z' }),
  ]);
  const filler = line(
    assistant('Zwischenschritt mit reichlich Text, damit die Zeile realistisch lang wird.', {
      at: '2026-08-01T08:30:00.000Z',
      file: 'c:\\development\\Hantsch\\second-brain\\src\\core\\index\\build.ts',
    }),
  );
  const parts: string[] = [head];
  let bytes = head.length;
  while (bytes < 5_000_000) {
    parts.push(filler);
    bytes += filler.length + 1;
  }
  parts.push(line(assistant('Ende', { at: '2026-08-01T09:00:00.000Z' })));
  return `${parts.join('\n')}\n`;
}

/** A real-sized history (`../claude-control/docs/RESEARCH.md` §2 measured 290 files,
 *  ~247 MB): 29 project folders with three 5 MB files each — 435 MB nobody may load. */
export function scaleFiles(): { text: string; files: FakeFile[] } {
  const text = hugeTranscript();
  const files: FakeFile[] = [];
  for (let project = 0; project < 29; project += 1) {
    for (let session = 0; session < 3; session += 1) {
      files.push({
        dir: `c--development-projekt-${String(project).padStart(2, '0')}`,
        name: `s-${session}.jsonl`,
        text,
        modified: `2026-08-${String((project % 28) + 1).padStart(2, '0')}T0${session}:00:00.000Z`,
      });
    }
  }
  return { text, files };
}
