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
  message?: { role?: string; content?: string | ClaudeContentBlock[] };
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

/** Felder eines Werkzeugaufrufs, die einen Dateipfad tragen. */
const PATH_FIELDS = ['file_path', 'path', 'notebook_path'];

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

/** Dateipfade aus den Werkzeugaufrufen dieses Records. */
export function toolFilePaths(record: ClaudeRecord): string[] {
  const paths: string[] = [];
  for (const block of blocks(record)) {
    if (block.type !== 'tool_use') continue;
    const input = block.input;
    if (!input || typeof input !== 'object') continue;
    for (const field of PATH_FIELDS) {
      const value = (input as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        paths.push(value.trim());
        break;
      }
    }
  }
  return paths;
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
