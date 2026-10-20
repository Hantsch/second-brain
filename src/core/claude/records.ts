/**
 * Was in einer Zeile einer Claude-Verlaufsdatei steht — und wie man es deutet.
 *
 * Das Format ist Claude-Code-intern und kann sich jederzeit aendern. Deshalb ist
 * hier jedes Feld optional und jeder Zugriff defensiv: unbekannte Record-Typen
 * gelten als Buchhaltung, nicht als Inhalt. Gemessene Grundlage:
 * `../claude-control/docs/RESEARCH.md` §2.
 */

/** Ein Block im `content`-Feld einer Nachricht. */
export interface ClaudeContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  /** Id eines `tool_use`-Blocks — ein spaeteres `tool_result` nennt sie in `tool_use_id`. */
  id?: string;
  tool_use_id?: string;
}

/** Eine Zeile der Verlaufsdatei. Alles optional — siehe Kopf der Datei. */
export interface ClaudeRecord {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: {
    role?: string;
    content?: string | ClaudeContentBlock[];
    /** Modellname, nur auf `assistant`-Records (RESEARCH.md §Assistant records). */
    model?: string;
    /** Token-Zahlen des Turns, z. B. `input_tokens`, `cache_read_input_tokens`. */
    usage?: Record<string, unknown>;
  };
  /** Werkzeugergebnisse kommen als `user`-Record mit diesem Feld. */
  toolUseResult?: unknown;
  sourceToolAssistantUUID?: string;
  /** `summary`- bzw. `ai-title`-Zeilen. */
  summary?: string;
  title?: string;
  aiTitle?: string;
  [key: string]: unknown;
}

/** Record-Typen, die Gespraechsinhalt tragen. Alles andere ist Buchhaltung. */
const SEMANTIC_TYPES = new Set(['user', 'assistant']);

/**
 * Felder eines Werkzeugaufrufs, die einen Dateipfad tragen. Exportiert, weil die
 * Codex-Seite das Ziel eines Aufrufs aus denselben Feldnamen liest — die
 * Konvention gehoert dem Werkzeug, nicht Claude (siehe `../codex/records.ts`).
 */
export const PATH_FIELDS = ['file_path', 'path', 'notebook_path'];

export function isSemantic(record: ClaudeRecord): boolean {
  return typeof record.type === 'string' && SEMANTIC_TYPES.has(record.type);
}

function blocks(record: ClaudeRecord): ClaudeContentBlock[] {
  const content = record.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is ClaudeContentBlock => !!block && typeof block === 'object',
  );
}

/** Ein `user`-Record, der ein Werkzeugergebnis ist — keine Nutzer-Nachricht. */
export function isToolResult(record: ClaudeRecord): boolean {
  if (record.type !== 'user') return false;
  if (record.toolUseResult !== undefined) return true;
  if (typeof record.sourceToolAssistantUUID === 'string') return true;
  return blocks(record).some((block) => block.type === 'tool_result');
}

/** Ein `user`-Record, den ein Mensch getippt hat. */
export function isPrompt(record: ClaudeRecord): boolean {
  return record.type === 'user' && record.isMeta !== true && !isToolResult(record);
}

/** Der Text aller `text`-Bloecke, oder der Text eines einfachen `content`. */
export function recordText(record: ClaudeRecord): string | null {
  const content = record.message?.content;
  if (typeof content === 'string') return content.trim() || null;
  const text = blocks(record)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text!.trim())
    .filter((part) => part.length > 0)
    .join('\n')
    .trim();
  return text || null;
}

/** Getrimmter Wert, oder `null` — nie eine leere Zeichenkette. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Das erste `PATH_FIELDS`-Feld, das diese Werkzeugeingabe traegt, oder `null`. */
function firstPathField(input: Record<string, unknown> | undefined): string | null {
  if (!input || typeof input !== 'object') return null;
  for (const field of PATH_FIELDS) {
    const value = str(input[field]);
    if (value !== null) return value;
  }
  return null;
}

/** Dateipfade aus den Werkzeugaufrufen dieses Records. */
export function toolFilePaths(record: ClaudeRecord): string[] {
  const paths: string[] = [];
  for (const block of blocks(record)) {
    if (block.type !== 'tool_use') continue;
    const path = firstPathField(block.input);
    if (path !== null) paths.push(path);
  }
  return paths;
}

/**
 * Ein `tool_use`-Block, auf das reduziert, was eine eingeklappte Verlaufszeile
 * braucht. `target` ist absichtlich ungekuerzt — wie lang eine Zeile sein darf,
 * entscheidet die Ansicht (`../agents/transcript.ts`), nicht diese Schicht.
 */
export interface ClaudeToolCall {
  /** Id des Blocks — ein spaeteres `tool_result` nennt sie in `tool_use_id`. */
  id: string | null;
  name: string | null;
  /** Worauf der Aufruf zielt: ein Dateipfad, sonst das erste Argument. */
  target: string | null;
  /** Der Block selbst, fuers Aufklappen. */
  raw: ClaudeContentBlock;
}

/**
 * Worauf ein Aufruf zielt, in einer Zeile: erst ein Pfadfeld, dann das erste
 * Zeichenketten-Argument (bei `Bash` ist das das Kommando), zuletzt das ganze
 * Eingabeobjekt als JSON. Nie erfunden: ohne Eingabe bleibt es `null`.
 */
function callTarget(input: Record<string, unknown> | undefined): string | null {
  if (!input || typeof input !== 'object') return null;
  const path = firstPathField(input);
  if (path !== null) return path;
  for (const value of Object.values(input)) {
    const text = str(value);
    if (text !== null) return text;
  }
  if (Object.keys(input).length === 0) return null;
  try {
    return JSON.stringify(input);
  } catch {
    return null;
  }
}

/**
 * Die `tool_use`-Bloecke dieses Records, in Blockreihenfolge. Ein Assistant-Record
 * kann Text *und* mehrere Aufrufe tragen — der Verlauf macht daraus getrennte
 * Zeilen, deshalb wird hier je Block einer geliefert und nicht zusammengefasst.
 */
export function toolCallsOf(record: ClaudeRecord): ClaudeToolCall[] {
  const calls: ClaudeToolCall[] = [];
  for (const block of blocks(record)) {
    if (block.type !== 'tool_use') continue;
    calls.push({
      id: str(block.id),
      name: str(block.name),
      target: callTarget(block.input),
      raw: block,
    });
  }
  return calls;
}

/**
 * Das Werkzeugergebnis, das ein `user`-Record traegt. Bevorzugt der
 * `tool_result`-Block, weil nur er die `tool_use_id` des Aufrufs nennt; sonst das
 * strukturierte `toolUseResult`, dessen Paarung ueber `sourceToolAssistantUUID`
 * laeuft. `null`, wenn der Record gar kein Ergebnis ist.
 */
export function toolResultOf(record: ClaudeRecord): { callId: string | null; raw: unknown } | null {
  if (!isToolResult(record)) return null;
  const block = blocks(record).find((candidate) => candidate.type === 'tool_result');
  if (block !== undefined) return { callId: str(block.tool_use_id), raw: block };
  return {
    callId: str(record.sourceToolAssistantUUID),
    raw: record.toolUseResult ?? null,
  };
}

/** Modellname eines Assistant-Turns, oder `null` — nur `assistant`-Records tragen ihn. */
export function modelOf(record: ClaudeRecord): string | null {
  if (record.type !== 'assistant') return null;
  const model = record.message?.model;
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : null;
}

/**
 * `subagent_type`-Werte aus `Task`-Werkzeugaufrufen in diesem Record. Meist
 * hoechstens einer, aber ein Record kann mehrere `tool_use`-Bloecke tragen.
 */
export function subagentTypesOf(record: ClaudeRecord): string[] {
  const types: string[] = [];
  for (const block of blocks(record)) {
    if (block.type !== 'tool_use' || block.name !== 'Task') continue;
    const value = block.input?.subagent_type;
    if (typeof value === 'string' && value.trim().length > 0) types.push(value.trim());
  }
  return types;
}

/** Felder aus `usage`, die zur Kontextgroesse eines Turns beitragen. */
const USAGE_TOKEN_FIELDS = [
  'input_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'output_tokens',
] as const;

/**
 * Naeherung fuer die Kontextgroesse eines Assistant-Turns. Claude legt anders
 * als Codex (`model_context_window`) keine eigene "aktuelle Kontextgroesse" ab
 * — `usage` traegt nur, was dieser Turn ein- und ausgegeben hat (RESEARCH.md
 * §Assistant records: `input_tokens`, `cache_creation_input_tokens`,
 * `cache_read_input_tokens`, `output_tokens`). Die Summe aller vorhandenen
 * Felder ist die beste verfuegbare Naeherung dafuer, wie viel Kontext dieser
 * Turn belegt hat; fehlt `usage` ganz, ist das Ergebnis `null` statt einer
 * erfundenen Zahl (Guardrail 3).
 */
export function contextTokensOf(record: ClaudeRecord): number | null {
  if (record.type !== 'assistant') return null;
  const usage = record.message?.usage;
  if (!usage || typeof usage !== 'object') return null;
  let total = 0;
  let found = false;
  for (const field of USAGE_TOKEN_FIELDS) {
    const value = usage[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}

/**
 * Zusammenfassung, die Claude selbst geschrieben hat. Zwei Formen sind belegt:
 * `type: 'summary'` mit `summary` (nach `/compact`) und `type: 'ai-title'` mit
 * `title`. Beide werden genommen, keine wird erfunden.
 */
export function summaryOf(record: ClaudeRecord): string | null {
  if (record.type !== 'summary' && record.type !== 'ai-title') return null;
  for (const key of ['summary', 'title', 'aiTitle'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Ein Slash-Kommando, wie es im Prompt steckt: Name plus Argumente. */
function slashCommand(text: string): string | null {
  const name = /<command-name>\s*([^<]{1,80}?)\s*<\/command-name>/.exec(text);
  if (!name) return null;
  const args = /<command-args>\s*([^<]{0,200}?)\s*<\/command-args>/.exec(text);
  const command = (name[1] ?? '').trim();
  const rest = (args?.[1] ?? '').trim();
  if (command.length === 0) return null;
  return rest.length > 0 ? `${command} ${rest}` : command;
}

/**
 * Den Prompt so weit saeubern, dass ein Mensch ihn im Dashboard lesen kann.
 *
 * Weg muss alles, was die CLI selbst hineinschreibt: der Caveat-Absatz vor
 * Kommando-Ausgaben, System-Reminder, IDE-Auswahl, die Huellen der
 * Slash-Kommandos und eingefuegte Datei-Inhalte (Code-Zaeune). Bleibt danach
 * nichts uebrig, faellt die Antwort auf das Slash-Kommando selbst zurueck:
 * „/sprint" sagt mehr darueber, woran gearbeitet wurde, als eine leere Zeile.
 */
export function cleanPromptText(text: string | null): string | null {
  if (text === null) return null;
  const command = slashCommand(text);
  const stripped = text
    .replace(/^Caveat:[\s\S]*?asks you to\.\s*/i, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ')
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, ' ')
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi, ' ')
    .replace(/<local-command-std(?:out|err)>[\s\S]*?<\/local-command-std(?:out|err)>/gi, ' ')
    .replace(/<command-message>[\s\S]*?<\/command-message>/gi, ' ')
    .replace(/<command-(?:name|args|contents)>[\s\S]*?<\/command-(?:name|args|contents)>/gi, ' ')
    // Eingefuegte Datei-Inhalte: erst geschlossene Zaeune, dann ein offener am Ende.
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/, ' ')
    .replace(/<\/?[a-z][\w-]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length > 0) return stripped;
  return command;
}

/** Eine Zeile, hoechstens `max` Zeichen — mit Auslassungszeichen, wenn gekuerzt. */
export function clip(text: string | null, max: number): string | null {
  if (text === null) return null;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return null;
  return oneLine.length > max ? `${oneLine.slice(0, max - 1).trimEnd()}…` : oneLine;
}
