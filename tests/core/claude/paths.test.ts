import { describe, expect, it } from 'vitest';
import {
  isPathInside,
  normalizePath,
  pathCandidates,
  pathKey,
  projectNameOf,
  resolveProjectPath,
  slugForPath,
  slugMatchesDir,
  vaultPath,
} from '@core/claude';
import { SB_CWD, SB_DIR } from './fixtures';

describe('slugForPath', () => {
  it('kodiert einen Windows-Pfad wie Claude Code', () => {
    expect(slugForPath(SB_CWD)).toBe(SB_DIR);
    expect(slugForPath('c:/development/Hantsch/second-brain')).toBe(SB_DIR);
  });

  it('kodiert Punkte mit — dadurch ist die Umkehrung mehrdeutig', () => {
    expect(slugForPath('/home/rob/.config/nvim')).toBe('-home-rob--config-nvim');
  });
});

describe('normalizePath', () => {
  it('vereinheitlicht Trenner, Laufwerksbuchstabe und Schlusstrenner', () => {
    expect(normalizePath('C:\\development\\Demo\\')).toBe('c:/development/Demo');
    expect(normalizePath('C:/development//Demo')).toBe('c:/development/Demo');
    // Die uebrige Schreibweise bleibt, damit der Nutzer seinen Pfad wiedererkennt.
    expect(normalizePath('c:/Development/Demo')).toBe('c:/Development/Demo');
  });

  it('vergleicht gross/klein-unabhaengig', () => {
    expect(pathKey('C:\\Development\\Demo\\')).toBe(pathKey('c:/development/demo'));
  });
});

describe('vaultPath', () => {
  /* Die Form, die in `repos` geht: docs/VAULT-FORMAT.md schreibt
     `repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure']`. Schriebe die App
     die Anzeigeform daneben, stuende derselbe Ordner in zwei Schreibweisen in
     derselben Liste. */
  it('schreibt Schraegstriche und einen grossen Laufwerksbuchstaben', () => {
    expect(vaultPath('c:\\development\\demo\\spielwiese')).toBe('C:/development/demo/spielwiese');
    expect(vaultPath('C:/development/demo/spielwiese/')).toBe('C:/development/demo/spielwiese');
    expect(vaultPath('c:/development//demo')).toBe('C:/development/demo');
  });

  it('laesst Pfade ohne Laufwerk in Ruhe', () => {
    expect(vaultPath('/home/rob/repo/')).toBe('/home/rob/repo');
    expect(vaultPath('relativ/pfad')).toBe('relativ/pfad');
  });

  it('bleibt fuer den Vergleich derselbe Pfad', () => {
    const cwd = 'c:\\development\\Demo\\Spielwiese';
    expect(pathKey(vaultPath(cwd))).toBe(pathKey(cwd));
    expect(isPathInside(`${cwd}\\src`, vaultPath(cwd))).toBe(true);
  });

  it('erkennt Unterverzeichnisse', () => {
    expect(isPathInside('C:\\dev\\repo\\src', 'c:/dev/repo')).toBe(true);
    expect(isPathInside('c:/dev/repo', 'c:/dev/repo/')).toBe(true);
    expect(isPathInside('c:/dev/repo-neu', 'c:/dev/repo')).toBe(false);
  });

  it('nennt das letzte Pfadstueck als Projektnamen', () => {
    expect(projectNameOf('c:/development/Hantsch/second-brain')).toBe('second-brain');
    expect(projectNameOf('/home/rob/code/tool')).toBe('tool');
  });
});

describe('pathCandidates', () => {
  it('nennt den naiven Pfad zuerst und die Bindestrich-Variante danach', () => {
    const candidates = pathCandidates(SB_DIR);
    expect(candidates[0]).toBe('c:/development/Hantsch/second/brain');
    expect(candidates).toContain('c:/development/Hantsch/second-brain');
    // Der mehrdeutige Fall ist damit *nicht* geloest — er ist nur eingegrenzt.
    expect(candidates.indexOf('c:/development/Hantsch/second-brain')).toBeGreaterThan(0);
  });

  it('deutet einen fuehrenden Bindestrich als POSIX-Wurzel', () => {
    expect(pathCandidates('-home-rob-code-tool')[0]).toBe('/home/rob/code/tool');
  });

  it('deutet einen doppelten Bindestrich als Punktordner', () => {
    expect(pathCandidates('-home-rob--config-nvim')[0]).toBe('/home/rob/.config/nvim');
  });
});

describe('resolveProjectPath', () => {
  it('nimmt das cwd aus den Records — es fuehrt genau auf den Ordnernamen zurueck', async () => {
    const resolved = await resolveProjectPath(SB_DIR, { cwds: [SB_CWD] });
    expect(resolved).toEqual({
      path: 'c:/development/Hantsch/second-brain',
      name: 'second-brain',
      verified: true,
    });
  });

  it('ignoriert Gross/Kleinschreibung des Ordnernamens (RESEARCH.md §2)', async () => {
    const resolved = await resolveProjectPath('C--development-Hantsch-second-brain', {
      cwds: [SB_CWD],
    });
    expect(resolved.verified).toBe(true);
    expect(resolved.path).toBe('c:/development/Hantsch/second-brain');
  });

  it('glaubt dem cwd auch, wenn es nicht auf den Ordnernamen zurueckfuehrt', async () => {
    const resolved = await resolveProjectPath('c--anderer-ordner', {
      cwds: ['c:/development/Hantsch/second-brain'],
    });
    expect(resolved.path).toBe('c:/development/Hantsch/second-brain');
    expect(resolved.verified).toBe(true);
  });

  it('prueft Kandidaten gegen die Platte, wenn kein Record ein cwd traegt', async () => {
    const existing = new Set(['c:/development/Hantsch/second-brain']);
    const resolved = await resolveProjectPath(SB_DIR, {
      cwds: [],
      exists: async (path) => existing.has(path),
    });
    expect(resolved).toEqual({
      path: 'c:/development/Hantsch/second-brain',
      name: 'second-brain',
      verified: true,
    });
  });

  it('sagt ehrlich, dass es geraten ist, wenn nichts belegt ist', async () => {
    const resolved = await resolveProjectPath(SB_DIR, { exists: async () => false });
    expect(resolved.verified).toBe(false);
    expect(resolved.path).toBe('c:/development/Hantsch/second/brain');
  });

  it('erkennt, ob ein cwd zu einem Ordnernamen gehoert', () => {
    expect(slugMatchesDir(SB_CWD, SB_DIR)).toBe(true);
    expect(slugMatchesDir('c:/development/Hantsch/second/brain', SB_DIR)).toBe(true);
    expect(slugMatchesDir('c:/development/anderes', SB_DIR)).toBe(false);
  });
});
