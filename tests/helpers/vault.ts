/* Temporärer Vault auf der echten Platte — für jeden Test, der Dateien braucht.
 *
 * Warum echt und nicht `MemoryVaultStore`: Hashes, mtimes, atomares Schreiben und
 * externe Änderungen sind genau die Dinge, die im Speicher nicht weh tun. Wer nur
 * Logik prüft, nimmt weiter den Speicher-Store.
 *
 * Benutzung:
 *
 *   const vault = await createTempVault();            // leer, aber vollständig
 *   const vault = await createTempVault({ sample: true }); // mit Beispielbestand
 *   await vault.write('inbox/x.md', '---\ntype: dump\n---\n');  // von außen
 *   await vault.touch('projects/work/a/project.md', -40);       // Alter setzen
 *   await vault.cleanup();
 *
 * `sample: true` legt den Bestand aus `tests/fixtures/vault/` an. Der trägt
 * absichtlich Pflege-Befunde (kaputter Wikilink, verwaiste Seite, Seite fehlt im
 * Katalog, unverdichtete Quelle) — siehe `tests/fixtures/index.ts`.
 */

import { mkdir, mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { FsVaultStore, ensureStructure } from '@core/vault';
import { fixtureVaultFiles } from '../fixtures';
import { NOW_MS } from './time';

export interface TempVaultOptions {
  /** Name im Vault-Marker. Standard: 'Testvault'. */
  name?: string;
  /** Beispielbestand aus `tests/fixtures/vault/` anlegen. */
  sample?: boolean;
  /** Zusätzliche Dateien: vault-relativer Pfad → Inhalt. */
  files?: Record<string, string>;
}

export interface TempVault {
  /** Absoluter Pfad der Vault-Wurzel. */
  root: string;
  /** Der echte Store — für Schreibwege, die die App selbst geht. */
  store: FsVaultStore;
  absolute(path: string): string;
  /** Schreibt roh am Store vorbei — das ist die „externe Änderung". */
  write(path: string, content: string): Promise<void>;
  read(path: string): Promise<string | null>;
  exists(path: string): Promise<boolean>;
  /** Setzt die mtime auf `offsetDays` relativ zu `NOW` — für Alter und Stagnation. */
  touch(path: string, offsetDays: number): Promise<void>;
  cleanup(): Promise<void>;
}

const DAY_MS = 86_400_000;

export async function createTempVault(options: TempVaultOptions = {}): Promise<TempVault> {
  // realpath löst 8.3-Kurznamen auf (CI-Runner: C:\Users\RUNNER~1\…): PowerShell-Hooks sehen
  // ihr $PSScriptRoot in Langform, ein Kurzname im Testpfad läge dann „außerhalb“ des Vaults.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sb-vault-')));
  const store = new FsVaultStore(root);
  await ensureStructure(store, { name: options.name ?? 'Testvault', now: new Date(NOW_MS) });

  const vault: TempVault = {
    root,
    store,
    absolute: (path) => join(root, ...path.split('/')),
    write: async (path, content) => {
      const absolute = join(root, ...path.split('/'));
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, 'utf8');
    },
    read: async (path) => {
      try {
        return await readFile(join(root, ...path.split('/')), 'utf8');
      } catch {
        return null;
      }
    },
    exists: async (path) => {
      try {
        await stat(join(root, ...path.split('/')));
        return true;
      } catch {
        return false;
      }
    },
    touch: async (path, offsetDays) => {
      const when = new Date(NOW_MS + offsetDays * DAY_MS);
      await utimes(join(root, ...path.split('/')), when, when);
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };

  if (options.sample) {
    for (const [path, content] of Object.entries(fixtureVaultFiles())) {
      await vault.write(path, content);
    }
  }
  for (const [path, content] of Object.entries(options.files ?? {})) {
    await vault.write(path, content);
  }
  return vault;
}

/** Legt einen Vault an, führt `run` aus und räumt in jedem Fall auf. */
export async function withTempVault<T>(
  run: (vault: TempVault) => Promise<T> | T,
  options: TempVaultOptions = {},
): Promise<T> {
  const vault = await createTempVault(options);
  try {
    return await run(vault);
  } finally {
    await vault.cleanup();
  }
}
