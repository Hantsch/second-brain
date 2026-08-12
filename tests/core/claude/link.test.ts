import { describe, expect, it } from 'vitest';
import type { ClaudeSession } from '@shared/types';
import { linkSessions, sessionTouches } from '@core/claude';
import type { LinkableProject } from '@core/claude';

const NYOTA: LinkableProject = {
  slug: 'nyota-auth0-migration',
  title: 'Nyota Auth0 Migration',
  repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure'],
};

const SECOND_BRAIN: LinkableProject = {
  slug: 'second-brain',
  title: 'Second Brain',
  repos: [],
};

const KELLER: LinkableProject = { slug: 'keller-ausbau', title: 'Keller ausbauen', repos: [] };

function session(patch: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: 's-1',
    cwd: 'c:/development/Kunde/Nyota-Auth0-Infrastructure',
    projectName: 'Nyota-Auth0-Infrastructure',
    vaultProject: null,
    gitBranch: 'main',
    startedAt: '2026-08-10T08:00:00.000Z',
    lastActivity: '2026-08-10T09:00:00.000Z',
    messageCount: 12,
    firstPrompt: 'Terraform-State migrieren',
    summary: null,
    files: [],
    ...patch,
  };
}

describe('linkSessions über repos', () => {
  it('trifft genau, quer über Backslash, Laufwerksbuchstabe und Schlusstrenner', () => {
    for (const cwd of [
      'C:/development/Kunde/Nyota-Auth0-Infrastructure',
      'c:/development/kunde/nyota-auth0-infrastructure',
      'C:\\development\\Kunde\\Nyota-Auth0-Infrastructure',
      'C:\\development\\Kunde\\Nyota-Auth0-Infrastructure\\',
    ]) {
      const result = linkSessions([session({ cwd })], [NYOTA]);
      expect(result.sessions[0]?.vaultProject).toBe(NYOTA.slug);
      expect(result.matches.get('s-1')).toBe('repo');
    }
  });

  it('zählt auch eine Sitzung in einem Unterordner des Repos', () => {
    const result = linkSessions(
      [session({ cwd: 'c:/development/Kunde/Nyota-Auth0-Infrastructure/modules/roles' })],
      [NYOTA],
    );
    expect(result.sessions[0]?.vaultProject).toBe(NYOTA.slug);
    expect(result.matches.get('s-1')).toBe('repo-parent');
  });

  it('verwechselt einen Nachbarordner nicht mit dem Repo', () => {
    const result = linkSessions(
      [session({ cwd: 'c:/development/Kunde/Nyota-Auth0-Infrastructure-alt' })],
      [NYOTA],
    );
    expect(result.sessions[0]?.vaultProject).toBeNull();
    expect(result.unlinked).toHaveLength(1);
  });
});

describe('linkSessions über den Ordnernamen', () => {
  it('trifft den Slug, wenn kein repos-Eintrag passt', () => {
    const result = linkSessions(
      [session({ cwd: 'c:/development/Hantsch/second-brain', projectName: 'second-brain' })],
      [NYOTA, SECOND_BRAIN],
    );
    expect(result.sessions[0]?.vaultProject).toBe('second-brain');
    expect(result.matches.get('s-1')).toBe('slug');
  });

  it('trifft den Titel, wenn der Slug abweicht', () => {
    const result = linkSessions(
      [session({ cwd: 'c:/code/keller-ausbauen', projectName: 'keller-ausbauen' })],
      [KELLER],
    );
    expect(result.sessions[0]?.vaultProject).toBe('keller-ausbau');
  });

  it('ordnet bei mehreren gleich guten Treffern nichts zu', () => {
    const twins: LinkableProject[] = [
      { slug: 'kundenportal', title: 'Kundenportal', repos: [] },
      { slug: 'kundenportal-web', title: 'Kundenportal Web', repos: [] },
    ];
    const result = linkSessions(
      [session({ cwd: 'c:/code/kundenportal', projectName: 'kundenportal' })],
      twins,
    );
    expect(result.sessions[0]?.vaultProject).toBeNull();
    expect(result.unlinked).toHaveLength(1);
  });

  it('lässt einen zu kurzen oder zu weit entfernten Namen unverknüpft', () => {
    const result = linkSessions(
      [session({ cwd: 'c:/code/api', projectName: 'api' })],
      [{ slug: 'api-gateway-migration', title: 'API-Gateway-Migration', repos: [] }],
    );
    expect(result.sessions[0]?.vaultProject).toBeNull();
  });
});

describe('linkSessions insgesamt', () => {
  it('lässt die Zuordnung von Hand gewinnen', () => {
    const manual = new Map([['s-1', 'keller-ausbau']]);
    const result = linkSessions([session()], [NYOTA, KELLER], { manual });
    expect(result.sessions[0]?.vaultProject).toBe('keller-ausbau');
    expect(result.matches.get('s-1')).toBe('manual');
  });

  it('ignoriert eine Zuordnung von Hand auf ein Projekt, das es nicht gibt', () => {
    const manual = new Map([['s-1', 'gibt-es-nicht']]);
    const result = linkSessions([session()], [NYOTA], { manual });
    expect(result.sessions[0]?.vaultProject).toBe(NYOTA.slug);
  });

  it('verändert die übergebenen Sitzungen nicht', () => {
    const original = session();
    linkSessions([original], [NYOTA]);
    expect(original.vaultProject).toBeNull();
  });

  it('trägt je Projekt nur die jüngste Spur als externalTouch', () => {
    const touches = sessionTouches(
      [
        session({ id: 's-alt', lastActivity: '2026-08-01T09:00:00.000Z' }),
        session({ id: 's-neu', lastActivity: '2026-08-10T09:00:00.000Z' }),
      ],
      [NYOTA],
    );
    expect(touches.get(NYOTA.slug)).toEqual({
      at: '2026-08-10T09:00:00.000Z',
      source: 'claude-session',
    });
    expect(touches.size).toBe(1);
  });

  it('nennt die nicht zuordenbaren Sitzungen, statt sie zu verschweigen', () => {
    const result = linkSessions(
      [
        session({ id: 'passt' }),
        session({ id: 'fremd', cwd: 'c:/tmp/spielwiese', projectName: 'spielwiese' }),
      ],
      [NYOTA],
    );
    expect(result.unlinked.map((entry) => entry.id)).toEqual(['fremd']);
    expect(result.touches.size).toBe(1);
  });
});
