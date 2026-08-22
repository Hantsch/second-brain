/* Erfundene Codex-CLI-Sitzungen für den Demo-Vault.
 *
 * Dieselbe Begründung wie bei `claude.mjs`: ohne eigene Ablage würde der
 * Demo-Lauf `~/.codex/sessions` lesen — die Verläufe fremder Sitzungen
 * landeten dann in `.screenshots/`. Deshalb bekommt Codex eine eigene
 * Verlaufsablage unter `.secondbrain/`, die beim nächsten Seed-Lauf neu
 * entsteht und beliebig gelöscht werden darf.
 *
 * Layout nach `src/core/codex/reader.ts`: Sitzungen liegen unter
 * `<root>/sessions/YYYY/MM/DD/rollout-<iso>-<uuid>.jsonl`, und
 * `session_index.jsonl` (Sitzungs-ID → Titel) liegt eine Ebene darüber, als
 * Geschwister von `sessions/` — nicht darin. `defaultSessionIndexPath` in
 * `reader.ts` verlässt sich genau darauf.
 *
 * Die Arbeitsverzeichnisse sind dieselben, die in `repos` der Demo-Projekte
 * stehen (`projects-work.mjs`) — sonst könnte der Überblick die Sitzungen
 * keinem Projekt zuordnen.
 */

/** Wurzel der Sitzungs-Ablage, vault-relativ. Sibling davon (ohne `/sessions`) ist `session_index.jsonl`. */
export const CODEX_DIR = '.secondbrain/codex-demo/sessions';

/** 'YYYY-MM-DD' → 'YYYY/MM/DD', für den Ordnerpfad einer Sitzung. */
function dayPath(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/** Zeitanteil des Dateinamens: Sekunden-Genauigkeit, Doppelpunkte durch `-` ersetzt, wie beim echten Codex-CLI. */
function isoForFileName(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
}

/** Eine Sitzung: Kopf mit Git-Kontext, ein Werkzeugaufruf, eine Antwort, Token-Zählung zum Schluss. */
const SESSIONS = [
  {
    id: 'c0d3c0de-1a1a-4b4b-9c9c-0123456789ab',
    cwd: 'C:/development/demo/kundenportal-web',
    branch: 'fix/session-timeout-redirect',
    commit: '5f3a9b2e1d0c4a6b8e7f9d1c2b3a4e5f6d7c8b9a',
    repositoryUrl: 'https://example.invalid/demo/kundenportal-web.git',
    days: -2,
    from: '07:30',
    threadName: 'Session-Timeout: weiße Seite statt Login-Redirect',
    prompt:
      'Abgelaufene Sitzungen landen auf einer weißen Seite statt auf dem Login. Finde die Ursache und behebe sie.',
    plan: 'Plan: den Interceptor der Sitzungsprüfung untersuchen, den fehlenden Redirect ergänzen, mit einem Testfall gegen einen abgelaufenen Token absichern.',
    command: 'npm test -- session',
    commandOutput: '9 passed, 0 failed',
    reply:
      'Der Interceptor fing den 401 ab, aber ohne Redirect-Fall. Ergänzt und mit einem Testfall für abgelaufene Token abgesichert (9 passed).',
    inputTokens: 2800,
    outputTokens: 1340,
  },
  {
    id: '11ab22cd-33ef-44ab-95cd-667788990011',
    cwd: 'C:/development/demo/orbit-sso-infra',
    branch: 'spike/token-lifetime',
    commit: '8e1f2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6',
    repositoryUrl: 'https://example.invalid/demo/orbit-sso-infra.git',
    days: -5,
    from: '14:10',
    threadName: 'Token-Laufzeit: Auswirkung auf Mandantentrennung geprüft',
    prompt:
      'Bevor wir das Rollenkonzept festschreiben: was bedeutet eine Token-Laufzeit von 8 Stunden für die Mandantentrennung?',
    plan: 'Plan: die Konfiguration des Identity-Providers gegen die Terraform-Module abgleichen, eine Kurzauswertung schreiben.',
    command: 'grep -R "token_lifetime" modules',
    commandOutput: '2 matches in modules/roles/variables.tf',
    reply:
      'Zwei Stellen setzen die Laufzeit unabhängig voneinander. Für saubere Mandantentrennung muss beides auf denselben Wert zeigen — als offene Frage ins Rollenkonzept aufgenommen.',
    inputTokens: 3100,
    outputTokens: 980,
  },
  {
    id: '9a8b7c6d-5e4f-4a3b-8c9d-aabbccddeeff',
    cwd: 'C:/development/demo/rechnungslauf',
    branch: 'main',
    commit: null,
    repositoryUrl: null,
    days: -9,
    from: '11:55',
    threadName: 'Rechnungslauf: Umlaute in der CSV-Ausgabe korrigiert',
    prompt: 'Der CSV-Export zeigt kaputte Umlaute in den Belegnamen. Woran liegt das?',
    plan: 'Plan: die Kodierung des CSV-Writers prüfen und auf UTF-8 mit BOM umstellen, damit Excel es korrekt öffnet.',
    command: 'npm test -- export',
    commandOutput: '4 passed, 0 failed',
    reply:
      'Der Writer schrieb Latin-1 statt UTF-8. Auf UTF-8 mit BOM umgestellt, Excel zeigt die Umlaute jetzt korrekt (4 passed).',
    inputTokens: 1650,
    outputTokens: 610,
  },
];

/** `session_meta`: Kopf einer Sitzung mit Git-Kontext, wie im echten Codex-CLI. */
function sessionMeta(session, stamp) {
  return {
    timestamp: stamp,
    type: 'session_meta',
    payload: {
      session_id: session.id,
      cwd: session.cwd,
      git: {
        branch: session.branch,
        ...(session.commit === null ? {} : { commit: session.commit }),
        ...(session.repositoryUrl === null ? {} : { repository_url: session.repositoryUrl }),
      },
      cli_version: '0.34.0',
      context_window: 128000,
      originator: 'codex_cli',
      model_provider: 'openai',
    },
  };
}

/** `turn_context`: das Modell und das Arbeitsverzeichnis dieses Zugs. */
function turnContext(session, stamp) {
  return {
    timestamp: stamp,
    type: 'turn_context',
    payload: { model: 'gpt-5-codex', cwd: session.cwd, workspace_roots: [session.cwd] },
  };
}

/** Die Aufforderung: `event_msg` und der `response_item`, den der Leser für den Turnus zählt. */
function userTurn(session, stamp) {
  return [
    { timestamp: stamp, type: 'event_msg', payload: { type: 'user_message', message: session.prompt } },
    {
      timestamp: stamp,
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: session.prompt }] },
    },
  ];
}

/** Plan, Werkzeugaufruf und Ergebnis — glaubwürdiger Mittelteil, ohne dass der Leser mehr braucht. */
function toolWork(session, stamp) {
  return [
    { timestamp: stamp, type: 'reasoning', payload: { summary: [session.plan] } },
    {
      timestamp: stamp,
      type: 'function_call',
      payload: { call_id: 'call_1', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', session.command] }) },
    },
    {
      timestamp: stamp,
      type: 'function_call_output',
      payload: { call_id: 'call_1', output: JSON.stringify({ output: session.commandOutput, metadata: { exit_code: 0 } }) },
    },
  ];
}

/** Die Antwort und die abschließende Token-Zählung, mit der Codex jede Sitzung beendet. */
function assistantTurn(session, stamp, tokens) {
  return [
    {
      timestamp: stamp,
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: session.reply }] },
    },
    {
      timestamp: stamp,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: tokens.input, output_tokens: tokens.output, total_tokens: tokens.input + tokens.output },
          last_token_usage: { input_tokens: tokens.input, output_tokens: tokens.output, total_tokens: tokens.input + tokens.output },
          model_context_window: 128000,
        },
      },
    },
  ];
}

function linesFor(session, clock) {
  const start = clock.date(session.days, session.from).toISOString();
  const end = clock.date(session.days, session.from).toISOString(); // gleiche Minute reicht für eine kurze Demo-Sitzung
  const records = [
    sessionMeta(session, start),
    turnContext(session, start),
    ...userTurn(session, start),
    ...toolWork(session, start),
    ...assistantTurn(session, end, { input: session.inputTokens, output: session.outputTokens }),
  ];
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

/**
 * Schreibt die Rollout-Dateien, eine leere Datei zur Toleranzprüfung, und
 * `session_index.jsonl` als Geschwister von `sessions/`. Gibt `CODEX_DIR`
 * zurück, analog zu `seedClaudeSessions`.
 */
export function seedCodexSessions(seeder, clock) {
  const indexLines = [];
  for (const session of SESSIONS) {
    const when = clock.date(session.days, session.from);
    const file = `${CODEX_DIR}/${dayPath(when)}/rollout-${isoForFileName(when)}-${session.id}.jsonl`;
    seeder.write(file, linesFor(session, clock), when);
    seeder.bump('codexSessions');
    indexLines.push(JSON.stringify({ session_id: session.id, thread_name: session.threadName }));
  }
  /* Eine leere Datei: der Leser muss sie aushalten und darf sie nicht zählen. */
  const emptyDay = clock.date(-30, '00:00');
  seeder.write(
    `${CODEX_DIR}/${dayPath(emptyDay)}/rollout-${isoForFileName(emptyDay)}-00000000-0000-4000-8000-000000000000.jsonl`,
    '',
  );
  /* Geschwister von `sessions/`, nicht darin — `defaultSessionIndexPath` in reader.ts kappt genau dieses Segment. */
  seeder.write(`${CODEX_DIR.replace(/\/sessions$/, '')}/session_index.jsonl`, `${indexLines.join('\n')}\n`);
  return CODEX_DIR;
}
