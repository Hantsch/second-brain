/* Reindumpen und Einordnen. Grundsatz: Die KI schlägt vor, der Mensch bestätigt. */

import type { Scope } from './vault';
import type { CoachMode, WaitingOn } from './domain';

export type CaptureOrigin = 'window' | 'quick-capture' | 'chat' | 'clipboard' | 'drop' | 'cli';

/** Ein Dump: unsortierter Text, der als Datei in `inbox/` landet. */
export interface DumpItem {
  path: string;
  id: string;
  title: string;
  text: string;
  created: string;
  origin: CaptureOrigin;
  /** Vorschlag liegt vor, aber noch nicht bestätigt. */
  status: 'raw' | 'proposed' | 'filed' | 'kept';
  /** Wie lange der Dump schon liegt, in Tagen. */
  ageDays: number;
  wordCount: number;
  /** Vom Nutzer beim Erfassen gesetzte Tags. */
  tags: string[];
  /** Scope, wenn beim Erfassen schon klar. */
  scope: Scope | null;
}

/** Wohin ein Dump wandert. */
export type FilingTarget =
  /** In eine Projektdatei, Abschnitt „Notizen" bzw. „Todos". */
  | 'project'
  /** In den Tageseintrag. */
  | 'journal'
  /** Als eigenständige Notiz in einen Bereich. */
  | 'area'
  /** Als Rohquelle plus Wiki-Verdichtung in ein Modul. */
  | 'module'
  /** Neues Projekt anlegen. */
  | 'new-project'
  /** Bleibt bewusst in der Inbox. */
  | 'inbox';

export interface FilingAction {
  target: FilingTarget;
  /** Zieldatei relativ zur Vault-Wurzel. Bei `new-project` der geplante Pfad. */
  path: string;
  /** Abschnitt in der Zieldatei, unter dem angehängt wird. */
  section: string | null;
  /** Was tatsächlich geschrieben wird — der Nutzer kann es vor dem Bestätigen ändern. */
  content: string;
}

/** Ein vollständiger Ablage-Vorschlag zu einem Dump. */
export interface FilingProposal {
  dumpPath: string;
  /** Vorgeschlagener Titel des Inhalts. */
  title: string;
  scope: Scope;
  tags: string[];
  /** Der Hauptvorschlag. */
  primary: FilingAction;
  /** Weitere Schreibvorgänge, die dazugehören (z. B. Todo in Projektdatei). */
  extras: FilingAction[];
  /** Andere sinnvolle Ziele, ein Klick entfernt. */
  alternatives: FilingAction[];
  /** 0..1 — wie sicher die Einordnung ist. */
  confidence: number;
  /** Ein Satz, warum dieses Ziel. Immer sichtbar, nie versteckt. */
  reason: string;
  /** Erkannte Todos mit Fristen. */
  todos: ProposedTodo[];
  /** Erkannte Warte-auf-Einträge. */
  waitingOn: WaitingOn[];
  /** Erkannte Personen, Orte, Begriffe — Kandidaten für Wiki-Entitäten. */
  entities: string[];
  /** Ohne LLM erzeugt (Heuristik), damit die App auch ohne Modell arbeitet. */
  heuristic: boolean;
  createdAt: string;
}

export interface ProposedTodo {
  text: string;
  scope: Scope;
  due: string | null;
  waitingFor: string | null;
  priority: number;
  /** Projekt-Slug, in dessen Datei das Todo soll. */
  project: string | null;
}

/** Ergebnis des Ausführens eines Vorschlags. */
export interface FilingResult {
  dumpPath: string;
  /** Geschriebene bzw. geänderte Dateien. */
  written: string[];
  /** Wohin der Dump selbst verschoben wurde, oder null wenn er in der Inbox blieb. */
  movedTo: string | null;
  /** Rückgängig-Marke: Kopie unter `.secondbrain/trash/`. */
  undoToken: string | null;
}

/** Was der Coach im Journal-Dialog tun soll — pro Gespräch übersteuerbar. */
export interface CoachRequest {
  mode: CoachMode;
  /** Datum des Tageseintrags, auf den sich das Gespräch bezieht. */
  date: string;
  message: string;
  /** Frühere Einträge als Kontext heranziehen (nur bei `analyze`). */
  useHistory: boolean;
}
