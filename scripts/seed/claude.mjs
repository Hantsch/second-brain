/* Erfundene Claude-Code-Sitzungen für den Demo-Vault.
 *
 * Ohne sie liest der Demo-Lauf das **echte** `~/.claude/projects` — die Titel
 * fremder Sitzungen landen dann in `.screenshots/`, und die Zusage aus der
 * README („die Prüfläufe fassen die echte Installation nicht an") wäre falsch.
 * Deshalb legt der Seed eine eigene Verlaufsablage an und trägt ihren Pfad in
 * `overview.claudeProjectsDir` der Vault-Einstellungen ein.
 *
 * Der Ordnername ist die Schreibweise von Claude Code: Trennzeichen des Pfades
 * werden zu `-`, der Doppelpunkt des Laufwerks fällt weg. Die Wahrheit über das
 * Arbeitsverzeichnis steht in `cwd` jeder Zeile — der Leser nimmt sie von dort.
 *
 * Die Arbeitsverzeichnisse sind dieselben, die in `repos` der Demo-Projekte
 * stehen (`projects-work.mjs`). Nur so ordnet der Überblick die Sitzungen
 * wirklich zu, statt eine Zuordnung zu behaupten.
 */

/** Wurzel der Verlaufsablage, vault-relativ. Liegt unter `.secondbrain/`, weil das laut VAULT-FORMAT.md ableitbar ist und gelöscht werden darf. */
export const CLAUDE_DIR = '.secondbrain/claude-demo/projects';

/** Ordnername einer Verlaufsablage aus einem Arbeitsverzeichnis. */
function dirNameFor(cwd) {
  return cwd.replace(/:/g, '').replace(/[\\/]/g, '-');
}

/** Eine Sitzung: Kopf, ein Werkzeugaufruf mit Ergebnis, eine Antwort. */
const SESSIONS = [
  {
    id: 'a1b2c3d4-1111-4111-8111-0123456789ab',
    cwd: 'C:/development/demo/kundenportal-web',
    branch: 'feature/angebotsliste',
    days: 0,
    from: '08:41',
    summary: 'Angebotsliste: Ladezeit bei 400 Einträgen gefunden und gemessen',
    prompt:
      'Die Angebotsliste lädt bei 400 Einträgen zu langsam. Finde heraus, wo die Zeit bleibt.',
    files: [
      'C:/development/demo/kundenportal-web/src/offers/OfferList.tsx',
      'C:/development/demo/kundenportal-web/src/offers/use-offers.ts',
    ],
    reply: 'Die Liste rendert jede Zeile neu, weil der Vergleich an einem neuen Objekt hängt.',
    turns: 24,
  },
  {
    id: 'a1b2c3d4-2222-4222-8222-0123456789ab',
    cwd: 'C:/development/demo/kundenportal-web',
    branch: 'main',
    days: -3,
    from: '16:12',
    summary: null,
    prompt: 'Schreib mir einen Testfall für den Rollenwechsel im Kundenportal.',
    files: ['C:/development/demo/kundenportal-web/tests/roles.test.ts'],
    reply: 'Der Testfall deckt Wechsel, Rücknahme und den fehlenden Anspruch ab.',
    turns: 11,
  },
  {
    id: 'a1b2c3d4-3333-4333-8333-0123456789ab',
    cwd: 'C:/development/demo/orbit-sso-infra',
    branch: 'feature/rollenzuordnung',
    days: -1,
    from: '10:05',
    summary: 'Terraform-Modul für die Rollenzuordnung aufgeteilt',
    prompt: 'Teile das Terraform-Modul auf: Rollen und Zuordnung gehören nicht in eine Datei.',
    files: ['C:/development/demo/orbit-sso-infra/modules/roles/main.tf'],
    reply: 'Zwei Module, ein gemeinsames Variablenblatt. Der State wandert mit `moved`.',
    turns: 31,
  },
  {
    id: 'a1b2c3d4-4444-4444-8444-0123456789ab',
    cwd: 'C:/development/demo/rechnungslauf',
    branch: 'main',
    days: -6,
    from: '09:20',
    summary: null,
    prompt: 'Warum bricht der Rechnungslauf beim zweiten Durchgang ab?',
    files: ['C:/development/demo/rechnungslauf/src/run.py'],
    reply: 'Der Lauf schreibt in dieselbe Datei, die er noch offen hält.',
    turns: 7,
  },
  {
    /* Kein Demo-Projekt trägt dieses Verzeichnis in `repos`: die Kachel zeigt
       damit auch eine Sitzung ohne Zuordnung — sie behauptet keine. */
    id: 'a1b2c3d4-5555-4555-8555-0123456789ab',
    cwd: 'C:/development/demo/spielwiese',
    branch: null,
    days: -2,
    from: '21:48',
    summary: null,
    prompt: 'Kurzer Versuch: geht das auch ohne Framework?',
    files: [],
    reply: 'Ohne Framework bleibt es bei 40 Zeilen — dafür fehlt das Routing.',
    turns: 4,
  },
];

function head(session, clock, at) {
  return {
    type: 'user',
    uuid: `${session.id.slice(0, 8)}-0000-4000-8000-000000000001`,
    sessionId: session.id,
    timestamp: clock.date(session.days, at).toISOString(),
    cwd: session.cwd.replace(/\//g, '\\'),
    ...(session.branch === null ? {} : { gitBranch: session.branch }),
    version: '2.1.222',
    userType: 'external',
    message: { role: 'user', content: [{ type: 'text', text: session.prompt }] },
  };
}

/** Ein Paar aus Werkzeugaufruf und Ergebnis — daraus zählt der Leser Dateien. */
function toolPair(session, clock, at, index) {
  const stamp = clock.date(session.days, at).toISOString();
  const uuid = `${session.id.slice(0, 8)}-0000-4000-8000-00000000000${index + 2}`;
  const file = session.files[index];
  return [
    {
      type: 'assistant',
      uuid,
      sessionId: session.id,
      timestamp: stamp,
      cwd: session.cwd.replace(/\//g, '\\'),
      ...(session.branch === null ? {} : { gitBranch: session.branch }),
      message: {
        role: 'assistant',
        model: 'claude-opus-5',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: `toolu_${index}`,
            name: 'Read',
            input: { file_path: file.replace(/\//g, '\\') },
          },
        ],
        usage: { input_tokens: 4, output_tokens: 120 },
      },
    },
    {
      type: 'user',
      uuid: `${uuid.slice(0, 24)}${index}0000000000`,
      sessionId: session.id,
      timestamp: stamp,
      cwd: session.cwd.replace(/\//g, '\\'),
      sourceToolAssistantUUID: uuid,
      toolUseResult: { type: 'text', file: { filePath: file, numLines: 180 } },
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: `toolu_${index}`, content: '180 Zeilen' }],
      },
    },
  ];
}

function tail(session, clock, at) {
  return {
    type: 'assistant',
    uuid: `${session.id.slice(0, 8)}-0000-4000-8000-000000000099`,
    sessionId: session.id,
    timestamp: clock.date(session.days, at).toISOString(),
    cwd: session.cwd.replace(/\//g, '\\'),
    ...(session.branch === null ? {} : { gitBranch: session.branch }),
    message: {
      role: 'assistant',
      model: 'claude-opus-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: session.reply }],
      usage: { input_tokens: 12, output_tokens: 240 },
    },
  };
}

/** Uhrzeit plus Minuten, als 'HH:MM'. */
function plus(from, minutes) {
  const [hours, mins] = from.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const clamped = Math.min(total, 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function linesFor(session, clock) {
  const records = [];
  if (session.summary !== null) {
    records.push({
      type: 'summary',
      summary: session.summary,
      leafUuid: `${session.id.slice(0, 8)}-0000-4000-8000-000000000099`,
    });
  }
  records.push(head(session, clock, session.from));
  for (let index = 0; index < session.files.length; index += 1) {
    records.push(...toolPair(session, clock, plus(session.from, 2 + index * 3), index));
  }
  records.push(tail(session, clock, plus(session.from, 9 + session.files.length * 3)));
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

/**
 * Schreibt die Verlaufsdateien und gibt den absoluten Pfad der Ablage zurück —
 * `claudeProjectsDir` braucht einen absoluten Pfad. Der Demo-Vault ist damit
 * nicht mehr verschiebbar; das ist er ohnehin nicht, er wird neu gesät.
 */
export function seedClaudeSessions(seeder, clock) {
  for (const session of SESSIONS) {
    const file = `${CLAUDE_DIR}/${dirNameFor(session.cwd)}/${session.id}.jsonl`;
    seeder.write(file, linesFor(session, clock), clock.date(session.days, session.from));
    seeder.bump('claudeSessions');
  }
  /* Eine leere Datei: der Leser muss sie aushalten und darf sie nicht zählen. */
  seeder.write(`${CLAUDE_DIR}/${dirNameFor('C:/development/demo/leer')}/leer.jsonl`, '');
  return CLAUDE_DIR;
}
