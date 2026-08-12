/* Dumping and filing. Principle: the AI proposes, the human confirms. */

import type { Scope } from './vault';
import type { CoachMode, WaitingOn } from './domain';

export type CaptureOrigin = 'window' | 'quick-capture' | 'chat' | 'clipboard' | 'drop' | 'cli';

/** A dump: unsorted text that lands as a file in `inbox/`. */
export interface DumpItem {
  path: string;
  id: string;
  title: string;
  text: string;
  created: string;
  origin: CaptureOrigin;
  /** A proposal exists, but hasn't been confirmed yet. */
  status: 'raw' | 'proposed' | 'filed' | 'kept';
  /** How long the dump has been sitting there, in days. */
  ageDays: number;
  wordCount: number;
  /** Tags set by the user while capturing. */
  tags: string[];
  /** Scope, if already clear at capture time. */
  scope: Scope | null;
}

/** Where a dump ends up. */
export type FilingTarget =
  /** Into a project file, "Notes" or "Todos" section. */
  | 'project'
  /** Into the journal entry. */
  | 'journal'
  /** As a standalone note in an area. */
  | 'area'
  /** As a raw source plus wiki distillation into a module. */
  | 'module'
  /** Create a new project. */
  | 'new-project'
  /** Deliberately stays in the inbox. */
  | 'inbox';

export interface FilingAction {
  target: FilingTarget;
  /** Target file relative to the vault root. For `new-project`, the planned path. */
  path: string;
  /** Section in the target file to append under. */
  section: string | null;
  /** What actually gets written — the user can change it before confirming. */
  content: string;
}

/** A complete filing proposal for a dump. */
export interface FilingProposal {
  dumpPath: string;
  /** Proposed title of the content. */
  title: string;
  scope: Scope;
  tags: string[];
  /** The main proposal. */
  primary: FilingAction;
  /** Additional write operations that belong with it (e.g. a todo in a project file). */
  extras: FilingAction[];
  /** Other reasonable targets, one click away. */
  alternatives: FilingAction[];
  /** 0..1 — how confident the classification is. */
  confidence: number;
  /** One sentence on why this target. Always visible, never hidden. */
  reason: string;
  /** Detected todos with deadlines. */
  todos: ProposedTodo[];
  /** Detected "waiting on" entries. */
  waitingOn: WaitingOn[];
  /** Detected people, places, terms — candidates for wiki entities. */
  entities: string[];
  /** Produced without an LLM (heuristic), so the app also works without a model. */
  heuristic: boolean;
  createdAt: string;
}

export interface ProposedTodo {
  text: string;
  scope: Scope;
  due: string | null;
  waitingFor: string | null;
  priority: number;
  /** Project slug into whose file the todo should go. */
  project: string | null;
}

/** Result of executing a proposal. */
export interface FilingResult {
  dumpPath: string;
  /** Files written or changed. */
  written: string[];
  /** Where the dump itself was moved to, or null if it stayed in the inbox. */
  movedTo: string | null;
  /** Undo marker: a copy under `.secondbrain/trash/`. */
  undoToken: string | null;
}

/** What the coach should do in the journal dialog — overridable per conversation. */
export interface CoachRequest {
  mode: CoachMode;
  /** Date of the journal entry the conversation relates to. */
  date: string;
  message: string;
  /** Pull in earlier entries as context (only for `analyze`). */
  useHistory: boolean;
}
