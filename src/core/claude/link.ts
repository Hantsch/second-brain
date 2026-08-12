/**
 * Sitzung → Vault-Projekt.
 *
 * Der belastbare Weg ist `repos` im Projekt-Frontmatter (docs/VAULT-FORMAT.md:
 * „liegt eine Session in diesem Verzeichnis, zaehlt sie als Arbeitsspur des
 * Projekts"). Verglichen wird normalisiert — Backslash/Schraegstrich,
 * Laufwerksbuchstabe klein, kein Schlusstrenner.
 *
 * Erst wenn kein `repos`-Eintrag passt, wird der Ordnername unscharf gegen
 * Projekt-Slug und -Titel gehalten — und **nur bei deutlichem Treffer**. Passen
 * zwei Projekte gleich gut, wird nichts zugeordnet: eine falsche Zuordnung
 * verfaelscht `lastTouch` und damit die Antwort auf „woran habe ich gearbeitet".
 *
 * Was uebrig bleibt, ist nicht verloren: `unlinked` ist die Liste, die das
 * Dashboard als „nicht verknuepft" zeigt, samt der Moeglichkeit, von Hand
 * zuzuordnen (`manual`).
 */

import type { ClaudeSession } from '@shared/types';
import type { ExternalTouch } from '@core/index/types';
import { fold } from '@core/index/text';
import { isPathInside, pathKey } from './paths';

/** Woran eine Zuordnung haengt — sichtbar, damit sie nachvollziehbar bleibt. */
export type LinkMatch = 'manual' | 'repo' | 'repo-parent' | 'slug' | 'title';

/** Was die Zuordnung von einem Projekt braucht. `Project` erfuellt das strukturell. */
export interface LinkableProject {
  slug: string;
  title: string;
  repos: readonly string[];
}

export interface LinkOptions {
  /**
   * Zuordnungen von Hand, Sitzungs-ID → Projekt-Slug. Sie gewinnen immer; der
   * Nutzer weiss es besser als jede Heuristik.
   */
  manual?: ReadonlyMap<string, string>;
}

export interface SessionLinking {
  /** Dieselben Sitzungen, `vaultProject` gefuellt. Neue Objekte, nichts veraendert. */
  sessions: ClaudeSession[];
  /** Projekt-Slug → juengste Spur, fertig fuer `externalTouches` des Index. */
  touches: Map<string, ExternalTouch>;
  /** Sitzungen ohne Projekt. */
  unlinked: ClaudeSession[];
  /** Sitzungs-ID → wie zugeordnet wurde. Nur fuer zugeordnete Sitzungen. */
  matches: Map<string, LinkMatch>;
}

/** So viele Zeichen muss ein unscharfer Teiltreffer mindestens lang sein. */
const MIN_FUZZY_CHARS = 6;

/** So aehnlich muessen die Laengen sein, damit ein Teiltreffer zaehlt. */
const MIN_LENGTH_RATIO = 0.6;

/** Vergleichsform eines Namens: gefaltet, ohne Trennzeichen. */
function compact(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, '');
}

/** Treffer ueber `repos`: erst genau, dann „Sitzung liegt unter dem Repo". */
function repoMatch(
  cwd: string,
  projects: readonly LinkableProject[],
): { project: LinkableProject; match: LinkMatch } | null {
  const key = pathKey(cwd);
  for (const project of projects) {
    for (const repo of project.repos) {
      if (repo.trim().length > 0 && pathKey(repo) === key) return { project, match: 'repo' };
    }
  }
  for (const project of projects) {
    for (const repo of project.repos) {
      if (repo.trim().length > 0 && isPathInside(cwd, repo)) {
        return { project, match: 'repo-parent' };
      }
    }
  }
  return null;
}

/**
 * Deutlicher Treffer heisst: gleich, oder das eine steckt im anderen und beide
 * sind aehnlich lang. Alles darunter waere Raten.
 */
function clearlyMatches(name: string, candidate: string): boolean {
  if (name.length === 0 || candidate.length === 0) return false;
  if (name === candidate) return true;
  const shorter = name.length <= candidate.length ? name : candidate;
  const longer = name.length <= candidate.length ? candidate : name;
  if (shorter.length < MIN_FUZZY_CHARS) return false;
  if (!longer.includes(shorter)) return false;
  return shorter.length / longer.length >= MIN_LENGTH_RATIO;
}

/** Unscharfer Treffer ueber Ordnername gegen Slug und Titel — nur wenn eindeutig. */
function nameMatch(
  session: ClaudeSession,
  projects: readonly LinkableProject[],
): { project: LinkableProject; match: LinkMatch } | null {
  const name = compact(session.projectName);
  if (name.length === 0) return null;
  for (const kind of ['slug', 'title'] as const) {
    const hits = projects.filter((project) =>
      clearlyMatches(name, compact(kind === 'slug' ? project.slug : project.title)),
    );
    if (hits.length === 1) return { project: hits[0]!, match: kind };
    // Mehrere gleich gute Treffer: lieber nicht zuordnen als falsch zuordnen.
    if (hits.length > 1) return null;
  }
  return null;
}

/**
 * Sitzungen den Projekten zuordnen. Reine Rechnung: keine Datei, kein Netz.
 * `touches` traegt je Projekt nur die juengste Spur — mehr braucht der Index nicht.
 */
export function linkSessions(
  sessions: readonly ClaudeSession[],
  projects: readonly LinkableProject[],
  options: LinkOptions = {},
): SessionLinking {
  const bySlug = new Map(projects.map((project) => [project.slug, project]));
  const result: SessionLinking = {
    sessions: [],
    touches: new Map(),
    unlinked: [],
    matches: new Map(),
  };

  for (const session of sessions) {
    const manual = options.manual?.get(session.id);
    const found =
      manual !== undefined && bySlug.has(manual)
        ? { project: bySlug.get(manual)!, match: 'manual' as LinkMatch }
        : (repoMatch(session.cwd, projects) ?? nameMatch(session, projects));

    if (found === null) {
      const copy = { ...session, vaultProject: null };
      result.sessions.push(copy);
      result.unlinked.push(copy);
      continue;
    }

    const linked = { ...session, vaultProject: found.project.slug };
    result.sessions.push(linked);
    result.matches.set(session.id, found.match);
    const known = result.touches.get(found.project.slug);
    if (known === undefined || known.at < session.lastActivity) {
      result.touches.set(found.project.slug, {
        at: session.lastActivity,
        source: 'claude-session',
      });
    }
  }
  return result;
}

/**
 * Nur die Spuren — der Aufruf, den der Index braucht
 * (`buildIndex({ externalTouches })`).
 */
export function sessionTouches(
  sessions: readonly ClaudeSession[],
  projects: readonly LinkableProject[],
  options: LinkOptions = {},
): Map<string, ExternalTouch> {
  return linkSessions(sessions, projects, options).touches;
}
