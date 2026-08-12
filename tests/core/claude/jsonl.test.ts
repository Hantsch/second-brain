import { describe, expect, it } from 'vitest';
import { cleanPromptText, parseJsonlChunk, readSessionFacts } from '@core/claude';
import type { ClaudeFileInfo } from '@core/claude';
import {
  SB_CWD,
  assistant,
  bookkeeping,
  fakeClaudeFs,
  jsonl,
  line,
  prompt,
  toolResult,
} from './fixtures';

const AT = '2026-08-10T09:12:00.000Z';

/** Eine Datei im Speicher-Adapter, plus ihre Beschreibung. */
function fileWith(text: string): { fs: ReturnType<typeof fakeClaudeFs>; info: ClaudeFileInfo } {
  const fs = fakeClaudeFs({
    files: [{ dir: 'c--x', name: 'session.jsonl', text, modified: '2026-08-10T10:00:00.000Z' }],
  });
  return {
    fs,
    info: {
      path: '/claude/projects/c--x/session.jsonl',
      name: 'session.jsonl',
      size: Buffer.byteLength(text, 'utf8'),
      modified: '2026-08-10T10:00:00.000Z',
    },
  };
}

const NORMAL = jsonl([
  prompt('Mach den Indexlauf inkrementell', { at: AT, branch: 'feature/index' }),
  assistant('Ich sehe mir build.ts an', {
    at: '2026-08-10T09:12:11.000Z',
    branch: 'feature/index',
    file: 'c:\\development\\Hantsch\\second-brain\\src\\core\\index\\build.ts',
  }),
  toolResult('2026-08-10T09:12:12.000Z', 'a-2026-08-10T09:12:11.000Z'),
  assistant('Fertig, der Lauf ist inkrementell', {
    at: '2026-08-10T09:15:02.000Z',
    branch: 'feature/index',
    file: 'c:\\development\\Hantsch\\second-brain\\src\\core\\index\\build.ts',
  }),
  bookkeeping('2026-08-10T09:15:03.000Z'),
]);

describe('parseJsonlChunk', () => {
  it('ueberspringt kaputte Zeilen, statt zu werfen', () => {
    const chunk = parseJsonlChunk('{"type":"user"}\nkeine json-zeile\n{"type":"assistant"}\n', {
      dropFirstPartial: false,
      dropLastPartial: true,
    });
    expect(chunk.records).toHaveLength(2);
    expect(chunk.skipped).toBe(1);
    expect(chunk.lines).toBe(3);
  });

  it('verwirft die halbgeschriebene letzte Zeile, ohne sie als Fehler zu zaehlen', () => {
    const chunk = parseJsonlChunk('{"type":"user"}\n{"type":"assis', {
      dropFirstPartial: false,
      dropLastPartial: true,
    });
    expect(chunk.records).toHaveLength(1);
    expect(chunk.skipped).toBe(0);
  });

  it('verwirft die erste Zeile, wenn das Fenster mitten in ihr beginnt', () => {
    const chunk = parseJsonlChunk('lbstueck"}\n{"type":"user"}\n', {
      dropFirstPartial: true,
      dropLastPartial: true,
    });
    expect(chunk.records).toHaveLength(1);
    expect(chunk.skipped).toBe(0);
  });

  it('hoert nach `maxLines` gedeuteten Zeilen auf', () => {
    const chunk = parseJsonlChunk(jsonl([bookkeeping(AT), bookkeeping(AT), bookkeeping(AT)]), {
      dropFirstPartial: false,
      dropLastPartial: true,
      maxLines: 2,
    });
    expect(chunk.records).toHaveLength(2);
  });
});

describe('readSessionFacts', () => {
  it('liest cwd, Branch, Zeiten, Zahl, Prompt und Dateien einer normalen Sitzung', async () => {
    const { fs, info } = fileWith(NORMAL);
    const facts = await readSessionFacts(fs, info);

    expect(facts.cwd).toBe('c:/development/Hantsch/second-brain');
    expect(facts.gitBranch).toBe('feature/index');
    expect(facts.startedAt).toBe(AT);
    expect(facts.lastActivity).toBe('2026-08-10T09:15:03.000Z');
    // user + assistant + tool-result-user + assistant; Buchhaltung zaehlt nicht mit.
    expect(facts.messageCount).toBe(4);
    expect(facts.messageCountExact).toBe(true);
    expect(facts.firstPrompt).toBe('Mach den Indexlauf inkrementell');
    expect(facts.files).toEqual(['src/core/index/build.ts']);
    expect(facts.skippedLines).toBe(0);
  });

  it('liest eine `summary`-Zeile mit, wenn eine da ist', async () => {
    const withSummary = `${line({ type: 'summary', summary: 'Index inkrementell gemacht' })}\n${NORMAL}`;
    const { fs, info } = fileWith(withSummary);
    const facts = await readSessionFacts(fs, info);
    expect(facts.summary).toBe('Index inkrementell gemacht');
  });

  it('meldet eine leere Datei als keine Arbeitsspur', async () => {
    const { fs, info } = fileWith('');
    const facts = await readSessionFacts(fs, info);
    expect(facts.records).toBe(0);
    expect(facts.messageCount).toBe(0);
    expect(facts.firstPrompt).toBeNull();
  });

  it('meldet eine Datei aus lauter System-Zeilen ohne Prompt und ohne Nachrichten', async () => {
    const { fs, info } = fileWith(
      jsonl([
        { type: 'file-history-snapshot', timestamp: AT },
        bookkeeping(AT),
        { type: 'mode', mode: 'default' },
      ]),
    );
    const facts = await readSessionFacts(fs, info);
    expect(facts.records).toBe(3);
    expect(facts.messageCount).toBe(0);
    expect(facts.firstPrompt).toBeNull();
    expect(facts.lastActivity).toBe(AT);
  });

  it('zaehlt kaputte Zeilen, liest aber alles andere', async () => {
    const { fs, info } = fileWith(`{"type":"user"\n${NORMAL}`);
    const facts = await readSessionFacts(fs, info);
    expect(facts.skippedLines).toBe(1);
    expect(facts.messageCount).toBe(4);
  });

  it('liest eine riesige Datei nur an den Kanten und schaetzt die Zahl ehrlich', async () => {
    const filler = line(assistant('Zwischenschritt', { at: '2026-08-10T09:13:00.000Z' }));
    const middle = new Array(4000).fill(filler).join('\n');
    const huge = `${line(prompt('Grosse Sitzung', { at: AT }))}\n${middle}\n${line(
      assistant('Ende', { at: '2026-08-10T09:59:00.000Z' }),
    )}\n`;
    const size = Buffer.byteLength(huge, 'utf8');
    expect(size).toBeGreaterThan(500_000);

    const { fs, info } = fileWith(huge);
    const facts = await readSessionFacts(fs, info, { headBytes: 8 * 1024, tailBytes: 8 * 1024 });

    expect(facts.bytesRead).toBeLessThan(size / 4);
    expect(facts.messageCountExact).toBe(false);
    // Geschaetzt ueber die Dichte des Endfensters — nahe an den echten 4002.
    expect(facts.messageCount).toBeGreaterThan(3000);
    expect(facts.messageCount).toBeLessThan(5000);
    expect(facts.firstPrompt).toBe('Grosse Sitzung');
    expect(facts.lastActivity).toBe('2026-08-10T09:59:00.000Z');
  });

  it('nennt die haeufigsten Dateien zuerst, hoechstens fuenf', async () => {
    const records = ['a.ts', 'b.ts', 'a.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'a.ts'].map(
      (name, index) =>
        assistant('x', {
          at: `2026-08-10T09:${String(10 + index).padStart(2, '0')}:00.000Z`,
          file: `${SB_CWD}\\src\\${name}`,
        }),
    );
    const { fs, info } = fileWith(jsonl(records));
    const facts = await readSessionFacts(fs, info);
    expect(facts.files).toHaveLength(5);
    expect(facts.files[0]).toBe('src/a.ts');
  });

  it('liest Modell, Subagenten und Token-Verbrauch aus Assistant-Records', async () => {
    const withFacts = jsonl([
      prompt('Recherchiere die Migration', { at: AT }),
      assistant('Ich starte einen Subagenten', {
        at: '2026-08-10T09:12:11.000Z',
        model: 'claude-opus-5',
        subagentType: 'general-purpose',
        usage: {
          input_tokens: 120,
          cache_creation_input_tokens: 400,
          cache_read_input_tokens: 900,
          output_tokens: 80,
        },
      }),
      assistant('Fertig', {
        at: '2026-08-10T09:15:02.000Z',
        model: 'claude-sonnet-5',
        usage: { input_tokens: 50, output_tokens: 30 },
      }),
    ]);
    const { fs, info } = fileWith(withFacts);
    const facts = await readSessionFacts(fs, info);

    // Juengstes Modell gewinnt, nicht das erste.
    expect(facts.model).toBe('claude-sonnet-5');
    expect(facts.subagents).toEqual(['general-purpose']);
    // Juengster Assistant-Turn: 50 + 30, ohne Cache-Felder (er hat keine).
    expect(facts.contextTokens).toBe(80);
  });

  it('meldet Modell, Subagenten und Token als unbekannt, wenn keine Records das tragen', async () => {
    const { fs, info } = fileWith(NORMAL);
    const facts = await readSessionFacts(fs, info);

    expect(facts.model).toBeNull();
    expect(facts.subagents).toBeNull();
    expect(facts.contextTokens).toBeNull();
  });
});

describe('cleanPromptText', () => {
  it('entfernt System-Reminder', () => {
    expect(
      cleanPromptText(
        '<system-reminder>Datei offen: x.ts</system-reminder>\nMach den Index fertig',
      ),
    ).toBe('Mach den Index fertig');
  });

  it('entfernt die Huelle eines Slash-Kommandos und behaelt den Befehl', () => {
    const text =
      '<command-name>/refine</command-name>\n<command-message>refine läuft</command-message>\n<command-args>042</command-args>';
    expect(cleanPromptText(text)).toBe('/refine 042');
  });

  it('entfernt XML-Bloecke und eingefuegte Datei-Inhalte', () => {
    const text = [
      '<ide_selection>src/x.ts 1-40</ide_selection>',
      'Bau den Leser um:',
      '```ts',
      'export function alt() { return 1; }',
      '```',
    ].join('\n');
    expect(cleanPromptText(text)).toBe('Bau den Leser um:');
  });

  it('entfernt den Caveat-Absatz der CLI', () => {
    const text =
      'Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to. Danach die echte Frage';
    expect(cleanPromptText(text)).toBe('Danach die echte Frage');
  });

  it('gibt null zurueck, wenn nur Rauschen uebrig bleibt', () => {
    expect(cleanPromptText('<system-reminder>nur Rauschen</system-reminder>')).toBeNull();
    expect(cleanPromptText(null)).toBeNull();
  });
});
