/* The project condensation run (story 044, D8). Mirror of
   `run.test.ts`: the run is where Guardrail 3 stops being an instruction in a
   prompt and becomes a check in code — a section citing something the run never
   read fails the whole run, and no artifact content comes back. The five refusal
   paths (no model, no inputs, bad attribution, unusable reply, failed call) are
   each their own result, and none of them writes anything.

   One thing this level has that the area does not: a source may be an
   `agent:<kind>/<pathKey>` reference (D12). Those refs are citable and land in
   `sources:`, but never in `source_hashes` — a session lives outside the vault
   and has no vault hash (D18). */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  condenseProject,
  CONDENSE_PROJECT_TASK,
  type CondenseProjectDeps,
  type CondenseProjectProposal,
  type CondenseProjectResult,
} from '@core/condense/run-project';
import { CONDENSE_DAY_WINDOW_DAYS } from '@core/condense/inputs';
import { projectInputs, CONDENSE_SESSION_LIMIT } from '@core/condense/inputs-project';
import { condensedProjectPath } from '@core/condense/paths';
import { recordedSources } from '@core/condense/sources';
import { writeCondensedProject } from '@core/condense/write';
import { deriveProjects } from '@core/index/projects';
import { parseTodos } from '@core/index/todos';
import type { IndexedDoc } from '@core/index/types';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { sectionNameFor } from '@core/vault/section-names';
import { MemoryVaultStore } from '@core/vault';
import type { ClaudeSession, Project, Todo } from '@shared/types';
import { createEmptyGateway, createFakeGateway } from '../../fakes/llm';
import { makeDoc } from '../index/fixtures';

/** "Now" every window computation and every `condensed_at` in this file uses. */
const NOW = '2026-08-10';

const FOLDER = 'projects/work/nyota';
const SLUG = 'nyota';
const PROJECT_PATH = `${FOLDER}/project.md`;
const NOTE_A = `${FOLDER}/notes/architektur.md`;
const NOTE_B = `${FOLDER}/notes/rollen.md`;
const DAY_PATH = 'journal/2026/07/2026-07-15.md';
const AGENT_REF = 'agent:claude/c:/dev/hantsch/nyota';
const CONDENSED_PATH = condensedProjectPath('work', SLUG);

const PROJECT_BODY = [
  '## Stand',
  '',
  'Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren @due:2026-08-15',
  '- [x] Terraform-State migriert @done:2026-08-09',
  '',
].join('\n');

function projectDoc(): IndexedDoc {
  return makeDoc({
    path: PROJECT_PATH,
    docType: 'project',
    title: 'Nyota Auth0 Migration',
    scope: 'work',
    project: SLUG,
    bodyLine: 12,
    frontmatter: {
      type: 'project',
      title: 'Nyota Auth0 Migration',
      slug: SLUG,
      scope: 'work',
      status: 'active',
      waiting_on: [{ who: 'Stefan', what: 'Freigabe des Rollenkonzepts', since: '2026-08-04' }],
    },
    body: PROJECT_BODY,
  });
}

function noteDoc(name: string): IndexedDoc {
  return makeDoc({
    path: `${FOLDER}/notes/${name}.md`,
    docType: 'note',
    title: name,
    project: SLUG,
    body: 'Das Rollenkonzept unterscheidet drei Ebenen.',
  });
}

function journalDoc(date: string, body: string): IndexedDoc {
  return makeDoc({
    path: `journal/2026/${date.slice(5, 7)}/${date}.md`,
    docType: 'journal',
    title: date,
    frontmatter: { type: 'journal', date, projects: [SLUG] },
    body,
  });
}

const RECENT_DAY = journalDoc('2026-07-15', 'Bei Nyota weitergekommen.');

/** Older than the 90-day window as seen from `NOW` — dropped and counted. */
const OLD_DAY = journalDoc('2026-01-05', 'Nyota angefangen.');

function docs(): IndexedDoc[] {
  return [projectDoc(), noteDoc('rollen'), noteDoc('architektur'), RECENT_DAY];
}

function todosOf(all: readonly IndexedDoc[]): Todo[] {
  return all.flatMap((doc) =>
    parseTodos(doc.body, {
      path: doc.path,
      frontmatter: doc.frontmatter,
      lineOffset: doc.bodyLine,
      today: NOW,
    }),
  );
}

function projectOf(all: readonly IndexedDoc[]): Project {
  const project = deriveProjects(all, todosOf(all), { now: NOW }).find(
    (candidate) => candidate.slug === SLUG,
  );
  if (project === undefined) throw new Error('fixture project missing');
  return project;
}

function session(partial: Partial<ClaudeSession> & { id: string }): ClaudeSession {
  return {
    cwd: 'C:/Dev/Hantsch/nyota',
    projectName: 'nyota',
    vaultProject: SLUG,
    gitBranch: 'main',
    startedAt: '2026-08-08T08:00:00.000Z',
    lastActivity: '2026-08-08T09:00:00.000Z',
    messageCount: 12,
    firstPrompt: 'Rollen migrieren',
    summary: null,
    files: [],
    model: null,
    subagents: null,
    contextTokens: null,
    ...partial,
  };
}

/** The vault side of the deps: the same shape the selector (D6) takes. */
function sources(all: readonly IndexedDoc[] = docs()) {
  return { project: projectOf(all), docs: all, todos: todosOf(all) };
}

/** The paths the run reads for `docs()` — exactly what a section may cite. */
const READ_PATHS = [PROJECT_PATH, NOTE_A, NOTE_B, DAY_PATH];

function reply(patch: Record<string, { text: string; sources: string[] }> = {}): string {
  return JSON.stringify({
    state: { text: 'Das Rollenkonzept liegt bei Stefan.', sources: [PROJECT_PATH] },
    'next-step': { text: 'Rollen-Mapping dokumentieren.', sources: [PROJECT_PATH, NOTE_B] },
    'waiting-on': { text: 'Stefan, seit dem 4. August.', sources: [PROJECT_PATH] },
    learned: { text: 'Die zweite Ebene versteht niemand.', sources: [NOTE_A, DAY_PATH] },
    ...patch,
  });
}

/** A gateway whose `condense-project` route answers with `body`. */
function gatewayWith(body: string): ReturnType<typeof createFakeGateway> {
  const setup = createFakeGateway();
  setup.provider.setReply(CONDENSE_PROJECT_TASK, body);
  return setup;
}

function deps(patch: Partial<CondenseProjectDeps> = {}): CondenseProjectDeps {
  return {
    ...sources(),
    gateway: gatewayWith(reply()).gateway,
    now: NOW,
    ...patch,
  } as CondenseProjectDeps;
}

function asProposal(result: CondenseProjectResult): CondenseProjectProposal {
  expect(result.kind).toBe('proposal');
  return result as CondenseProjectProposal;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('condenseProject', () => {
  it('returns a proposal with the composed artifact, its base hash and the sources list', async () => {
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(await condenseProject(deps({ gateway })));

    expect(proposal.scope).toBe('work');
    expect(proposal.slug).toBe(SLUG);
    expect(proposal.path).toBe(`${FOLDER}/condensed.md`);
    expect(proposal.sources).toEqual(READ_PATHS);
    // No artifact existed, so the write helper must use "must not exist".
    expect(proposal.baseHash).toBeNull();
    expect(proposal.condensedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(proposal.content).toContain('type: condensed');
    expect(proposal.content).toContain(`condensed_at: ${proposal.condensedAt}`);
    for (const path of READ_PATHS) expect(proposal.content).toContain(`- ${path}`);
    expect(proposal.content).toContain('Das Rollenkonzept liegt bei Stefan.');
    expect(proposal.content).toContain(`Aus: ${NOTE_A}, ${DAY_PATH}`);
    expect(proposal.truncated).toBeNull();
  });

  it('writes the four project section headings in the document language', async () => {
    const { gateway } = gatewayWith(reply());

    const german = asProposal(await condenseProject(deps({ gateway })));
    const english = asProposal(await condenseProject(deps({ gateway, docLanguage: 'en' })));

    for (const kind of ['state', 'next-step', 'waiting-on', 'learned'] as const) {
      expect(german.content).toContain(`## ${sectionNameFor(kind, 'de')}`);
      expect(english.content).toContain(`## ${sectionNameFor(kind, 'en')}`);
    }
  });

  it('cites a linked agent session and records no hash for it', async () => {
    const { gateway } = gatewayWith(
      reply({ learned: { text: 'Die Migration lief über Terraform.', sources: [AGENT_REF] } }),
    );
    const all = docs();

    const proposal = asProposal(
      await condenseProject(
        deps({
          gateway,
          sessions: [session({ id: 'one', summary: 'Rollen migriert' })],
          readTranscriptTail: async () => 'letzte Zeilen des Verlaufs',
        }),
      ),
    );

    // The ref is a first-class source: cited, listed, and click-through in 045.
    expect(proposal.sources).toEqual([...READ_PATHS, AGENT_REF]);
    expect(proposal.content).toContain(`- ${AGENT_REF}`);
    expect(proposal.content).toContain(`Aus: ${AGENT_REF}`);

    // ... but it has no vault hash, so `source_hashes` covers the documents only (D18).
    expect(Object.keys(proposal.sourceHashes)).toEqual(READ_PATHS);
    expect(proposal.sourceHashes).toEqual(
      Object.fromEntries(projectInputs(sources(all), { now: NOW }).map((i) => [i.path, i.hash])),
    );
    const recorded = recordedSources(parse(proposal.content).frontmatter);
    expect(recorded.find((entry) => entry.path === AGENT_REF)?.hash).toBeNull();
    for (const entry of recorded.filter((candidate) => candidate.path !== AGENT_REF)) {
      expect(entry.hash).toBe(all.find((doc) => doc.path === entry.path)?.hash);
    }
  });

  it('accepts a citation of a linked session whose cwd is POSIX (review fix)', async () => {
    // pathKey() keeps a leading '/' for a POSIX cwd, so the emitted ref is
    // 'agent:claude//home/me/nyota' (a double slash by construction, see
    // agent-ref.test.ts). Before the fix, attribution.ts ran every reply
    // source through toVaultPath(), which collapses that leading slash away —
    // the model citing exactly the ref the prompt showed it then failed
    // attribution on every non-Windows machine.
    const posixRef = 'agent:claude//home/me/nyota';
    const { gateway } = gatewayWith(
      reply({ learned: { text: 'Aus der Session.', sources: [posixRef] } }),
    );

    const proposal = asProposal(
      await condenseProject(
        deps({
          gateway,
          sessions: [session({ id: 'one', cwd: '/home/me/nyota', summary: 'Rollen migriert' })],
          readTranscriptTail: async () => 'letzte Zeilen des Verlaufs',
        }),
      ),
    );

    expect(proposal.sources).toContain(posixRef);
  });

  /* Story 039's pairing, one level up: the inventory the run records has to be
     the one `projectInputs()` answers with, or 046's staleness check compares
     against a different question and every artifact is due (or fresh) forever. */
  it('records the hash of every vault input, exactly as projectInputs sees them', async () => {
    const { gateway } = gatewayWith(reply());
    const all = docs();

    const proposal = asProposal(await condenseProject(deps({ gateway, ...sources(all) })));

    expect(recordedSources(parse(proposal.content).frontmatter)).toEqual(
      projectInputs(sources(all), { now: NOW }),
    );
  });

  it('does not start without a configured model and names the missing task kind', async () => {
    const result = await condenseProject(deps({ gateway: createEmptyGateway() }));

    expect(result).toEqual({
      kind: 'no-model',
      scope: 'work',
      slug: SLUG,
      task: 'condense-project',
    });
    expect(result).not.toHaveProperty('content');
  });

  it('asks nothing at all when the task kind is unrouted', async () => {
    // Same provider, no route to it: the guard has to come before the call.
    const setup = createFakeGateway({ tasks: [] });
    setup.provider.setReply(CONDENSE_PROJECT_TASK, reply());

    const result = await condenseProject(deps({ gateway: setup.gateway }));

    expect(result.kind).toBe('no-model');
    expect(setup.provider.callCount).toBe(0);
  });

  it('returns a no-inputs result and no artifact file for a project with nothing to read', async () => {
    const store = new MemoryVaultStore();
    const setup = gatewayWith(reply());

    const result = await condenseProject(
      deps({ gateway: setup.gateway, docs: [], todos: [], project: projectOf(docs()) }),
    );

    expect(result).toEqual({ kind: 'no-inputs', scope: 'work', slug: SLUG });
    expect(result).not.toHaveProperty('content');
    // Nothing to condense means nothing to ask about, and no placeholder file.
    expect(setup.provider.callCount).toBe(0);
    expect(await store.list({ dir: 'projects', ext: '.md' })).toEqual([]);
  });

  it('treats a project file that says nothing as no input at all', async () => {
    // The folder exists, the file exists, and there is not one sentence in it —
    // no state, no todo, no waiting-on: four sections written from a title alone
    // would be pure invention. (A single `waiting_on` entry *is* material, which
    // is why this fixture has none.)
    const empty = [
      makeDoc({
        path: PROJECT_PATH,
        docType: 'project',
        title: 'Nyota Auth0 Migration',
        scope: 'work',
        project: SLUG,
        frontmatter: {
          type: 'project',
          title: 'Nyota Auth0 Migration',
          slug: SLUG,
          scope: 'work',
          status: 'active',
        },
        body: '',
      }),
    ];
    const setup = gatewayWith(reply());

    const result = await condenseProject(
      deps({ gateway: setup.gateway, ...sources(empty), project: projectOf(empty) }),
    );

    expect(result.kind).toBe('no-inputs');
    expect(setup.provider.callCount).toBe(0);
  });

  it('fails the whole run when a section cites a path that was not read', async () => {
    const { gateway } = gatewayWith(
      reply({ learned: { text: 'Behauptung.', sources: ['journal/2026/08/2026-08-06.md'] } }),
    );

    const result = await condenseProject(deps({ gateway }));

    expect(result).toEqual({
      kind: 'attribution-failure',
      scope: 'work',
      slug: SLUG,
      problems: [
        {
          section: 'learned',
          reason: 'unknown-source',
          sources: ['journal/2026/08/2026-08-06.md'],
        },
      ],
    });
    // Not a repaired artifact and not a dropped sentence — no content at all.
    expect(result).not.toHaveProperty('content');
  });

  it('fails the run when a section cites an agent session the run never read', async () => {
    const { gateway } = gatewayWith(
      reply({ state: { text: 'Aus der Session.', sources: [AGENT_REF] } }),
    );

    // No sessions passed, so the ref was never among the inputs.
    const result = await condenseProject(deps({ gateway }));

    expect(result).toMatchObject({
      kind: 'attribution-failure',
      problems: [{ section: 'state', reason: 'unknown-source', sources: [AGENT_REF] }],
    });
  });

  it('fails the run when a section makes a claim without citing anything', async () => {
    const { gateway } = gatewayWith(
      reply({ 'waiting-on': { text: 'Behauptung ohne Beleg.', sources: [] } }),
    );

    const result = await condenseProject(deps({ gateway }));

    expect(result).toMatchObject({
      kind: 'attribution-failure',
      problems: [{ section: 'waiting-on', reason: 'no-source' }],
    });
  });

  it('puts the truncation notice into the artifact body, in the document language', async () => {
    const { gateway } = gatewayWith(reply());
    const all = [...docs(), OLD_DAY];

    const proposal = asProposal(
      await condenseProject(deps({ gateway, ...sources(all), docLanguage: 'en' })),
    );

    expect(proposal.truncated).toMatchObject({ days: 1, count: 1 });
    expect(proposal.content).toContain('did not read every available input');
    expect(proposal.content).toContain(String(CONDENSE_DAY_WINDOW_DAYS));
  });

  it('names the session bounds in the notice when they are what cut something', async () => {
    const { gateway } = gatewayWith(reply());
    const sessions = ['a', 'b', 'c', 'd'].map((id) =>
      session({ id, lastActivity: `2026-08-0${1 + ['a', 'b', 'c', 'd'].indexOf(id)}T09:00:00Z` }),
    );

    const proposal = asProposal(
      await condenseProject(
        deps({
          gateway,
          docLanguage: 'en',
          sessions,
          readTranscriptTail: async () => 'x'.repeat(2500),
        }),
      ),
    );

    expect(proposal.truncated).toMatchObject({ sessions: 1, clampedSessions: 3 });
    expect(proposal.content).toContain(`beyond the ${CONDENSE_SESSION_LIMIT} most recent`);
    expect(proposal.content).toContain('transcript characters past');
  });

  it('names the prompt-shown character cap in the notice, even when the selector itself dropped nothing', async () => {
    /* D6 reads a note verbatim (D16) — this note is well within every one of
       D6's own bounds (no window, no session cap), so `selection.truncated`
       stays `null`. The prompt still only shows `CONDENSE_PROJECT_ITEM_CHARS`
       of it to the model; the artifact must say so regardless (review fix for
       the un-counted prompt-layer clamp). */
    const longNote = noteDoc('architektur');
    longNote.body = 'x'.repeat(2000);
    const all = [projectDoc(), longNote, noteDoc('rollen'), RECENT_DAY];
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(
      await condenseProject(deps({ gateway, ...sources(all), docLanguage: 'en' })),
    );

    expect(proposal.truncated).toBeNull();
    expect(proposal.content).toContain('did not read every available input');
    expect(proposal.content).toContain('to fit its input budget');
    // the note is still fully read and cited — only what the model saw was capped.
    expect(proposal.sources).toContain(NOTE_A);
  });

  it('does not stack the truncation notice across runs', async () => {
    const { gateway } = gatewayWith(reply());
    const all = [...docs(), OLD_DAY];

    const first = asProposal(
      await condenseProject(deps({ gateway, ...sources(all), docLanguage: 'en' })),
    );
    const second = asProposal(
      await condenseProject(
        deps({ gateway, ...sources(all), docLanguage: 'en', existing: first.content }),
      ),
    );

    const notices = second.content.split('did not read every available input').length - 1;
    expect(notices).toBe(1);
  });

  it('carries the hash of the artifact it was built from, for the write to guard against', async () => {
    const existing = [
      '---',
      'type: condensed',
      'title: Nyota',
      '---',
      '',
      '## Stand',
      '',
      'Alt.',
      '',
    ].join('\n');
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(await condenseProject(deps({ gateway, existing })));

    expect(proposal.baseHash).toBe(sha256(existing));
  });

  it('carries an existing artifact’s directives and unknown keys into the proposal', async () => {
    const existing = [
      '---',
      'type: condensed',
      'title: Nyota',
      'obsidian_pin: true',
      '---',
      '',
      '## Stand',
      '',
      'Alt.',
      '',
      '## Direktiven',
      '',
      'Nie den Kunden namentlich nennen.',
      '',
    ].join('\n');
    const { gateway } = gatewayWith(reply());

    const proposal = asProposal(await condenseProject(deps({ gateway, existing })));

    expect(proposal.content).toContain('obsidian_pin: true');
    expect(proposal.content).toContain('Nie den Kunden namentlich nennen.');
  });

  it('reports a failed run instead of throwing when the gateway cannot answer', async () => {
    const setup = createFakeGateway();
    setup.provider.fail(CONDENSE_PROJECT_TASK, 'Modell nicht erreichbar');

    const result = await condenseProject(deps({ gateway: setup.gateway }));

    expect(result).toMatchObject({ kind: 'failed', scope: 'work', slug: SLUG });
    expect(result).not.toHaveProperty('content');
  });

  it('reports a failed run when the reply does not match the schema', async () => {
    const { gateway } = gatewayWith(JSON.stringify({ state: { text: 'Nur einer.', sources: [] } }));

    const result = await condenseProject(deps({ gateway }));

    expect(result).toMatchObject({ kind: 'failed' });
    expect(result).toHaveProperty('reason', expect.stringContaining('next-step'));
  });

  /* AC 7, and the reason this run returns instead of writing: whichever way it
     refuses, the artifact already on disk is the artifact still on disk. */
  it('leaves an existing artifact byte-identical through every refusal', async () => {
    const store = new MemoryVaultStore();
    const before = [
      '---',
      'type: condensed',
      'title: Nyota',
      '---',
      '',
      '## Stand',
      '',
      'Der alte, gute Stand.',
      '',
      '## Direktiven',
      '',
      'Nie den Kunden namentlich nennen.',
      '',
    ].join('\n');
    await writeCondensedProject(store, {
      kind: 'proposal',
      scope: 'work',
      slug: SLUG,
      path: CONDENSED_PATH,
      content: before,
      condensedAt: '2026-08-09T10:00:00+02:00',
      baseHash: null,
      sources: [],
      sourceHashes: {},
      truncated: null,
    });

    const failing = createFakeGateway();
    failing.provider.fail(CONDENSE_PROJECT_TASK, 'Modell nicht erreichbar');
    const unattributable = gatewayWith(
      reply({ state: { text: 'Erfunden.', sources: ['areas/gesundheit.md'] } }),
    ).gateway;

    for (const gateway of [createEmptyGateway(), failing.gateway, unattributable]) {
      const result = await condenseProject(deps({ gateway, existing: before }));
      expect(result.kind).not.toBe('proposal');
      expect(await store.readText(CONDENSED_PATH)).toBe(before);
    }
  });

  it('reaches no network: the run completes with fetch stubbed to throw', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Ein Test darf nicht ins Netz.');
    });
    const setup = gatewayWith(reply());

    const proposal = asProposal(
      await condenseProject(
        deps({
          gateway: setup.gateway,
          sessions: [session({ id: 'one' })],
          readTranscriptTail: async () => 'Verlauf',
        }),
      ),
    );

    expect(proposal.content.length).toBeGreaterThan(0);
    expect(setup.provider.countFor(CONDENSE_PROJECT_TASK)).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never writes: the module has no store, no filesystem and no fetch', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../src/core/condense/run-project.ts'),
      'utf8',
    );
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'));
    expect(code.join('\n')).not.toMatch(/VaultStore|node:fs|fetch\(|\.write\(/);
  });
});
