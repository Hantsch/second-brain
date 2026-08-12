/* LLM-Schicht: Provider, Modelle, Aufgaben-Kategorien und deren Zuordnung.
   Kein Aufrufer außerhalb von `core/llm` weiß, welcher Provider läuft. */

/** Wie mit einem Provider gesprochen wird. */
export type ProviderKind =
  /** Anthropic Messages API. */
  | 'anthropic'
  /** Alles OpenAI-kompatible: OpenAI, OpenRouter, Ollama, LM Studio, vLLM, Azure. */
  | 'openai-compatible'
  /** Deterministischer Antwortgeber für Tests und den Demo-Modus. */
  | 'fake';

/** Vorlage, mit der ein Provider in zwei Klicks angelegt ist. */
export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Braucht dieser Provider einen API-Key? Lokale Runtimes nicht. */
  needsKey: boolean;
  /** Läuft auf dieser Maschine — darf für sensible Aufgaben empfohlen werden. */
  local: boolean;
  /** Kann die Modell-Liste live abgefragt werden? */
  canListModels: boolean;
  hint?: string;
}

export interface ProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Nur ein Marker: der Key selbst liegt verschlüsselt in userData, nie im Vault. */
  hasKey: boolean;
  local: boolean;
  enabled: boolean;
  /** Zuletzt bekannte Modelle (aus `canListModels` oder manuell gepflegt). */
  models: string[];
  /** Ergebnis des letzten Verbindungstests. */
  probe?: ProviderProbe;
  createdAt: string;
}

export interface ProviderProbe {
  ok: boolean;
  at: string;
  latencyMs?: number;
  error?: string;
  modelCount?: number;
}

/** Grobe Leistungsklasse. Steuert die Vorschläge, nicht die Technik. */
export type ModelTier = 'cheap' | 'balanced' | 'strong';

export const MODEL_TIERS: readonly ModelTier[] = ['cheap', 'balanced', 'strong'];

/**
 * Jede LLM-gestützte Aufgabe der App ist eine dieser Kategorien. Der Nutzer
 * ordnet jeder Kategorie Provider + Modell zu — Querien darf ein kleines
 * Modell erledigen, das Verdichten von Wissen ein großes.
 */
export type TaskKind =
  /** Dump lesen und einen Ablage-Vorschlag machen. */
  | 'classify-dump'
  /** Titel, Slug und Tags vorschlagen. Billigste Aufgabe der App. */
  | 'title-tags'
  /** Todos, Deadlines, Warte-auf-Einträge aus Text ziehen. */
  | 'extract-tasks'
  /** Eine Quelle zu einer Wiki-Source-Seite verdichten. */
  | 'summarize-source'
  /** Entity-/Concept-Seiten schreiben und verknüpfen. */
  | 'wiki-ingest'
  /** Frage gegen das Second Brain beantworten, mit Zitaten. */
  | 'query-answer'
  /** Suchtreffer für eine Frage sortieren/filtern. */
  | 'query-rerank'
  /** Tagebuch-/Coaching-Dialog. */
  | 'journal-chat'
  /** Projekt-Status, nächster Schritt, Stagnations-Diagnose. */
  | 'project-status'
  /** Pflegelauf: Widersprüche, veraltete Claims, Lücken finden. */
  | 'gardener-audit';

export interface TaskDefinition {
  kind: TaskKind;
  /** i18n-Key für den Namen. */
  labelKey: string;
  /** i18n-Key für die Erklärung, warum diese Aufgabe welches Modell braucht. */
  hintKey: string;
  /** Empfohlene Leistungsklasse. */
  suggested: ModelTier;
  /** Läuft über sensible, persönliche Inhalte — lokales Modell bevorzugen. */
  sensitive: boolean;
  /** Antwortet streamend (Chat-Charakter). */
  streams: boolean;
  /** Erwartet strukturiertes JSON zurück. */
  structured: boolean;
}

/** Ein konkretes Ziel: Provider + Modell. */
export interface ModelRef {
  providerId: string;
  model: string;
}

/**
 * Zuordnung Aufgabe → Modell. Fehlt ein Eintrag, greift `defaults[tier]`;
 * fehlt auch der, ist die Aufgabe ohne LLM — die App bleibt benutzbar.
 */
export interface Routing {
  tasks: Partial<Record<TaskKind, ModelRef>>;
  defaults: Partial<Record<ModelTier, ModelRef>>;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  task: TaskKind;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  /** JSON-Schema, wenn strukturiert geantwortet werden soll. */
  schema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: ModelRef;
  usage?: Usage;
  latencyMs: number;
}

/** Warum eine LLM-Aufgabe nicht laufen konnte — als Zustand, nicht als Absturz. */
export interface LlmUnavailable {
  reason: 'no-route' | 'provider-disabled' | 'no-key' | 'unreachable' | 'error';
  task: TaskKind;
  detail?: string;
}
