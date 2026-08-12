/* Testdaten des Ueberblicks. Keine `.test.ts`-Datei, damit vitest sie nicht als
   Suite sammelt.

   Gebaut wird immer derselbe Weg: Dokumente von Hand → `deriveIndex` → eine
   schmale `OverviewIndex`-Sicht. Damit rechnen die Tests auf denselben
   Ableitungen wie die App (Todo-Parser, Projekt-Ableitung), ohne Dateien.

   Alle Daten liegen um `TODAY` aus `tests/helpers/time.ts` (2026-08-10). */

import type { ClaudeSession, ProjectStatus, RawSource, Scope, WaitingOn } from '@shared/types';
import { deriveIndex } from '@core/index/build';
import type { IndexedDoc } from '@core/index/types';
import type { OverviewIndex } from '@core/overview';
import { makeDoc } from '../index/fixtures';
import { NOW, day, stamp } from '../../helpers/time';

export { NOW, TODAY, day, stamp } from '../../helpers/time';

export interface IndexFromOptions {
  sources?: RawSource[];
  now?: string;
  staleAfterDays?: number;
}

/** Eine `OverviewIndex`-Sicht auf von Hand gebaute Dokumente. */
export function indexFrom(
  docs: readonly IndexedDoc[],
  options: IndexFromOptions = {},
): OverviewIndex {
  const index = deriveIndex([...docs], {
    now: options.now ?? NOW,
    ...(options.staleAfterDays === undefined ? {} : { staleAfterDays: options.staleAfterDays }),
    sources: options.sources ?? [],
  });
  return {
    projects: () => index.projects,
    todos: () => index.todos,
    sources: () => index.sources,
    index: () => ({ docs: index.docs }),
  };
}

export interface ProjectDocOptions {
  slug: string;
  title?: string;
  scope?: Scope;
  status?: ProjectStatus;
  deadline?: string | null;
  nextStep?: string | null;
  waitingOn?: WaitingOn[];
  repos?: string[];
  /** mtime der Projektdatei, ISO. Bestimmt `lastTouch`. */
  updated?: string;
  /** Rumpf; ohne Angabe ein „Stand"-Abschnitt und keine Todos. */
  body?: string;
}

const DEFAULT_BODY = ['## Stand', '', 'Der Testmandant wartet auf die Freigabe.', ''].join('\n');

/** Eine Projektdatei, wie der Index sie sieht. */
export function projectDoc(options: ProjectDocOptions): IndexedDoc {
  const scope = options.scope ?? 'work';
  const title = options.title ?? options.slug;
  return makeDoc({
    path: `projects/${scope}/${options.slug}/project.md`,
    docType: 'project',
    title,
    project: options.slug,
    scope,
    updated: options.updated ?? stamp(0),
    body: options.body ?? DEFAULT_BODY,
    frontmatter: {
      type: 'project',
      title,
      slug: options.slug,
      scope,
      status: options.status ?? 'active',
      ...(options.deadline === undefined || options.deadline === null
        ? {}
        : { deadline: options.deadline }),
      ...(options.nextStep === undefined || options.nextStep === null
        ? {}
        : { next_step: options.nextStep }),
      ...(options.waitingOn === undefined ? {} : { waiting_on: options.waitingOn }),
      ...(options.repos === undefined ? {} : { repos: options.repos }),
    },
  });
}

/** Eine Notizdatei in einem Projektordner — Futter fuer „3 Dateien geaendert". */
export function projectNote(
  slug: string,
  name: string,
  options: { scope?: Scope; updated?: string; body?: string } = {},
): IndexedDoc {
  const scope = options.scope ?? 'work';
  return makeDoc({
    path: `projects/${scope}/${slug}/notes/${name}.md`,
    title: name,
    project: slug,
    scope,
    updated: options.updated ?? stamp(0),
    body: options.body ?? 'Eine Notiz.\n',
  });
}

/** Ein Tageseintrag. `mood` bleibt weg, wenn keine Zahl kommt. */
export function journalDoc(
  offsetDays: number,
  options: { mood?: number; body?: string; projects?: string[]; updated?: string } = {},
): IndexedDoc {
  const date = day(offsetDays);
  return makeDoc({
    path: `journal/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.md`,
    docType: 'journal',
    title: `Tag ${date}`,
    updated: options.updated ?? stamp(offsetDays, '19:00'),
    body: options.body ?? ['## Tag', '', 'Ein Tag wie jeder andere.', ''].join('\n'),
    frontmatter: {
      type: 'journal',
      title: `Tag ${date}`,
      date,
      ...(options.mood === undefined ? {} : { mood: options.mood }),
      ...(options.projects === undefined ? {} : { projects: options.projects }),
    },
  });
}

/** Ein Dump in der Inbox. */
export function dumpDoc(
  name: string,
  options: { status?: 'raw' | 'proposed' | 'filed' | 'kept'; updated?: string } = {},
): IndexedDoc {
  return makeDoc({
    path: `inbox/${name}.md`,
    docType: 'dump',
    title: name,
    updated: options.updated ?? stamp(0),
    body: 'Ein Gedanke.\n',
    frontmatter: { type: 'dump', title: name, status: options.status ?? 'raw' },
  });
}

/** Eine Rohquelle, wie `deriveSources` sie liefert. */
export function rawSource(patch: Partial<RawSource> = {}): RawSource {
  return {
    path: 'raw/youtube/xOFkpf9KgKg',
    title: 'Your AI Second Brain Is Slowly Rotting',
    kind: 'youtube',
    ingestedAt: stamp(0, '14:40'),
    sourcePage: null,
    origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
    bytes: 4096,
    modules: [],
    ...patch,
  };
}

/** Eine Claude-Sitzung. */
export function session(patch: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: 's-1',
    cwd: 'c:/development/Hantsch/second-brain',
    projectName: 'second-brain',
    vaultProject: null,
    gitBranch: 'feature/auth',
    startedAt: stamp(0, '08:00'),
    lastActivity: stamp(0, '09:00'),
    messageCount: 47,
    firstPrompt: 'Ueberblick-Kern bauen',
    summary: null,
    files: [],
    ...patch,
  };
}
