import { describe, expect, it } from 'vitest';
import { ClaudeSessionReader, claudeProjectsDir, nodeClaudeFileSystem } from '@core/claude';
import { CLAUDE_PROJECTS_DIR } from '../../fixtures';
import { FAKE_ROOT, SB_DIR, assistant, bookkeeping, fakeClaudeFs, jsonl, prompt } from './fixtures';

const SESSION_A = jsonl([
  prompt('Indexlauf inkrementell machen', {
    at: '2026-08-10T09:00:00.000Z',
    branch: 'feature/index',
  }),
  assistant('Fertig', { at: '2026-08-10T09:30:00.000Z', branch: 'feature/index' }),
  bookkeeping('2026-08-10T09:30:01.000Z'),
]);

const SESSION_B = jsonl([
  prompt('Warteschlange fuer das Aufnehmen bauen', {
    at: '2026-08-08T14:00:00.000Z',
    cwd: 'c:\\development\\demo\\kundenportal-web',
    branch: 'main',
  }),
  assistant('Liegt', {
    at: '2026-08-08T15:00:00.000Z',
    cwd: 'c:\\development\\demo\\kundenportal-web',
    branch: 'main',
  }),
]);

function reader(files: Parameters<typeof fakeClaudeFs>[0]['files'], existing?: string[]) {
  const fs = fakeClaudeFs({ files, ...(existing === undefined ? {} : { existing }) });
  return { fs, reader: new ClaudeSessionReader({ fs, projectsDir: FAKE_ROOT }) };
}

describe('claudeProjectsDir', () => {
  it('nimmt `~/.claude/projects`, wenn die Einstellung leer ist', () => {
    const fs = fakeClaudeFs({ files: [] });
    expect(claudeProjectsDir(fs, '')).toBe('/home/test/.claude/projects');
    expect(claudeProjectsDir(fs, null)).toBe('/home/test/.claude/projects');
    expect(claudeProjectsDir(fs, '  /anderswo  ')).toBe('/anderswo');
  });
});

describe('ClaudeSessionReader (Speicher-Adapter)', () => {
  it('liefert Sitzungen, neueste zuerst, mit cwd aus den Records', async () => {
    const { reader: sut } = reader([
      { dir: SB_DIR, name: 's-a.jsonl', text: SESSION_A, modified: '2026-08-10T09:30:01.000Z' },
      {
        dir: 'c--development-demo-kundenportal-web',
        name: 's-b.jsonl',
        text: SESSION_B,
        modified: '2026-08-08T15:00:00.000Z',
      },
    ]);
    const sessions = await sut.list();

    expect(sessions.map((session) => session.projectName)).toEqual([
      'second-brain',
      'kundenportal-web',
    ]);
    const [first] = sessions;
    expect(first?.cwd).toBe('c:/development/Hantsch/second-brain');
    expect(first?.gitBranch).toBe('feature/index');
    expect(first?.startedAt).toBe('2026-08-10T09:00:00.000Z');
    expect(first?.lastActivity).toBe('2026-08-10T09:30:01.000Z');
    expect(first?.messageCount).toBe(2);
    expect(first?.firstPrompt).toBe('Indexlauf inkrementell machen');
    // Die Zuordnung zum Vault-Projekt macht `link.ts`, nicht der Leser.
    expect(first?.vaultProject).toBeNull();
  });

  it('gibt eine leere Liste zurueck, wenn es das Verzeichnis nicht gibt', async () => {
    const fs = fakeClaudeFs({ files: [] });
    const sut = new ClaudeSessionReader({ fs, projectsDir: '/gibt-es-nicht' });
    expect(await sut.list()).toEqual([]);
  });

  it('laesst leere Dateien weg — eine leere Datei ist keine Arbeitsspur', async () => {
    const { reader: sut } = reader([
      { dir: SB_DIR, name: 's-a.jsonl', text: SESSION_A, modified: '2026-08-10T09:30:01.000Z' },
      { dir: SB_DIR, name: 'leer.jsonl', text: '', modified: '2026-08-11T09:00:00.000Z' },
    ]);
    const sessions = await sut.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe('aa11bb22-cc33-dd44-ee55-ff6677889900');
  });

  it('beachtet `limit` und liest nur die ausgewaehlten Dateien', async () => {
    const files = [1, 2, 3, 4].map((index) => ({
      dir: SB_DIR,
      name: `s-${index}.jsonl`,
      text: SESSION_A,
      modified: `2026-08-0${index}T09:00:00.000Z`,
    }));
    const { fs, reader: sut } = reader(files);
    const sessions = await sut.list({ limit: 2 });
    expect(sessions).toHaveLength(2);
    // Zwei Dateien, ein Fenster je Datei (klein genug fuer einen Zug).
    expect(fs.reads.map((read) => read.path)).toEqual([
      `${FAKE_ROOT}/${SB_DIR}/s-4.jsonl`,
      `${FAKE_ROOT}/${SB_DIR}/s-3.jsonl`,
    ]);
  });

  it('beachtet `since` und laesst aeltere Dateien ganz aus', async () => {
    const { fs, reader: sut } = reader([
      { dir: SB_DIR, name: 'neu.jsonl', text: SESSION_A, modified: '2026-08-10T09:30:01.000Z' },
      { dir: SB_DIR, name: 'alt.jsonl', text: SESSION_A, modified: '2026-07-01T09:00:00.000Z' },
    ]);
    const sessions = await sut.list({ since: '2026-08-01T00:00:00.000Z' });
    expect(sessions).toHaveLength(1);
    expect(fs.reads.some((read) => read.path.endsWith('alt.jsonl'))).toBe(false);
  });

  it('faellt auf den geprueften Kandidaten zurueck, wenn kein Record ein cwd traegt', async () => {
    const withoutCwd = jsonl([
      {
        type: 'user',
        timestamp: '2026-08-10T09:00:00.000Z',
        message: { role: 'user', content: 'Ohne cwd' },
      },
    ]);
    const { reader: sut } = reader(
      [{ dir: SB_DIR, name: 's.jsonl', text: withoutCwd, modified: '2026-08-10T09:00:00.000Z' }],
      ['c:/development/Hantsch/second-brain'],
    );
    const sessions = await sut.list();
    expect(sessions[0]?.cwd).toBe('c:/development/Hantsch/second-brain');
    expect(sessions[0]?.projectName).toBe('second-brain');
  });
});

describe('ClaudeSessionReader (Dateien auf der Platte)', () => {
  it('liest den nachgebauten Bestand unter tests/fixtures/claude', async () => {
    const sut = new ClaudeSessionReader({
      fs: nodeClaudeFileSystem(),
      projectsDir: CLAUDE_PROJECTS_DIR,
    });
    const sessions = await sut.list();

    // Die leere Datei fehlt, die drei mit Inhalt sind da.
    expect(sessions).toHaveLength(3);
    const kundenportal = sessions.find((session) => session.id === 'session-kundenportal');
    expect(kundenportal?.cwd).toBe('c:/development/demo/kundenportal-web');
    expect(kundenportal?.gitBranch).toBe('feature/angebotsliste');
    expect(kundenportal?.firstPrompt).toContain('Angebotsliste');
    expect(kundenportal?.summary).toContain('Berechtigungen');
    expect(kundenportal?.files).toEqual(['src/offers/OfferList.tsx']);

    const indexSession = sessions.find(
      (session) => session.id === 'aa11bb22-cc33-dd44-ee55-ff6677889900',
    );
    expect(indexSession?.cwd).toBe('c:/development/Hantsch/second-brain');
    expect(indexSession?.summary).toContain('Index inkrementell');
    expect(indexSession?.firstPrompt).toBe(
      'Mach den Indexlauf inkrementell: unveraenderte Dateien duerfen nicht neu gelesen werden.',
    );
    // Zwei Prompts/Ergebnisse und drei Modellantworten; Buchhaltung zaehlt nicht.
    expect(indexSession?.messageCount).toBe(6);

    // Die Datei mit kaputten Zeilen bleibt lesbar: Slash-Kommando plus Antwort.
    const broken = sessions.find(
      (session) => session.id === 'bb22cc33-dd44-ee55-ff66-778899001122',
    );
    expect(broken?.firstPrompt).toBe('/verify schnell');
    expect(broken?.messageCount).toBe(2);
  });
});
