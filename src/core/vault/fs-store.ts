/**
 * `FsVaultStore` — der Vault auf einer echten Platte.
 *
 * Ausgewiesener Adapter: zusammen mit `fs-io.ts` der einzige Ort im Kern, der das
 * Dateisystem kennt. Alle Regeln (Pfadwache, Konflikt, Frontmatter-Merge,
 * Abschnitte, Papierkorb) kommen aus den reinen Modulen daneben — dieser Store
 * verdrahtet sie nur mit `node:fs`.
 */

import { join, resolve } from 'node:path';
import type { VaultDoc, WriteResult } from '@shared/types';
import { VAULT_DIRS } from '@shared/types';
import { assertWritable, composeContent } from './compose';
import { serialize } from './frontmatter';
import { toVaultDoc } from './doc';
import {
  ensureDir,
  movePath,
  readDirEntries,
  readTextOrNull,
  removePath,
  statOrNull,
  writeFileAtomic,
} from './fs-io';
import { sha256 } from './hash';
import { assertSafeVaultPath, extName, isInside } from './paths';
import { appendToSection } from './sections';
import { createUndoToken, parseManifest, trashManifestPath, trashPath, trashRoot } from './trash';
import type { TrashManifest } from './trash';
import { VaultConflictError, VaultNotFoundError } from './types';
import type {
  AppendOptions,
  AppendResult,
  DeleteResult,
  ListOptions,
  MoveOptions,
  VaultStat,
  VaultStore,
  WriteInput,
  WriteTextOptions,
} from './types';

/* Ordner, die kein Vault-Inhalt sind und beim Durchlaufen nichts zu suchen haben. */
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.obsidian']);

export class FsVaultStore implements VaultStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Vault-relativer Pfad → absoluter Pfad. Die Wache laeuft hier, an einer Stelle. */
  private absolute(path: string): string {
    return join(this.root, ...assertSafeVaultPath(path).split('/'));
  }

  async read(path: string): Promise<VaultDoc | null> {
    const relative = assertSafeVaultPath(path);
    const absolute = this.absolute(relative);
    const content = await readTextOrNull(absolute);
    if (content === null) return null;
    const info = await statOrNull(absolute);
    return toVaultDoc(relative, content, {
      modified: (info?.mtime ?? new Date()).toISOString(),
      size: info?.size,
    });
  }

  async readMany(paths: string[]): Promise<VaultDoc[]> {
    const docs = await Promise.all(paths.map((path) => this.read(path)));
    return docs.filter((doc): doc is VaultDoc => doc !== null);
  }

  async readText(path: string): Promise<string | null> {
    return readTextOrNull(this.absolute(path));
  }

  async write(input: WriteInput): Promise<WriteResult> {
    const relative = assertSafeVaultPath(input.path);
    const absolute = this.absolute(relative);
    const existing = await readTextOrNull(absolute);
    assertWritable(relative, existing, input);
    const content = composeContent(relative, existing, input);
    await writeFileAtomic(absolute, content);
    return { path: relative, hash: sha256(content), created: existing === null };
  }

  async create(
    path: string,
    frontmatter: Record<string, unknown>,
    body: string,
  ): Promise<WriteResult> {
    return this.write({ path, frontmatter, body, mustNotExist: true });
  }

  async writeText(
    path: string,
    content: string,
    options: WriteTextOptions = {},
  ): Promise<WriteResult> {
    const relative = assertSafeVaultPath(path);
    const absolute = this.absolute(relative);
    const existing = await readTextOrNull(absolute);
    assertWritable(relative, existing, options);
    await writeFileAtomic(absolute, content);
    return { path: relative, hash: sha256(content), created: existing === null };
  }

  async append(
    path: string,
    section: string,
    content: string,
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    const relative = assertSafeVaultPath(path);
    const absolute = this.absolute(relative);
    const found = await readTextOrNull(absolute);
    assertWritable(relative, found, { expectedHash: options.expectedHash });
    if (found === null && options.frontmatterIfNew === undefined) {
      throw new VaultNotFoundError(relative);
    }
    const existing = found ?? serialize(options.frontmatterIfNew ?? {}, '');
    const result = appendToSection(existing, section, content);
    if (found !== null && result.content === found) {
      return {
        path: relative,
        hash: sha256(found),
        created: false,
        sectionCreated: result.sectionCreated,
      };
    }
    await writeFileAtomic(absolute, result.content);
    return {
      path: relative,
      hash: sha256(result.content),
      created: found === null,
      sectionCreated: result.sectionCreated,
    };
  }

  async move(from: string, to: string, options: MoveOptions = {}): Promise<WriteResult> {
    const source = assertSafeVaultPath(from);
    const target = assertSafeVaultPath(to);
    const absoluteSource = this.absolute(source);
    const absoluteTarget = this.absolute(target);
    const info = await statOrNull(absoluteSource);
    if (info === null) throw new VaultNotFoundError(source);
    const existing = await statOrNull(absoluteTarget);
    if (existing !== null && options.overwrite !== true) {
      const content = existing.isFile() ? await readTextOrNull(absoluteTarget) : null;
      throw new VaultConflictError(
        { path: target, expectedHash: '', actualHash: content === null ? '' : sha256(content) },
        'Das Ziel existiert bereits.',
      );
    }
    if (existing !== null) await removePath(absoluteTarget);
    await movePath(absoluteSource, absoluteTarget);
    const moved = info.isFile() ? await readTextOrNull(absoluteTarget) : null;
    return {
      path: target,
      hash: moved === null ? '' : sha256(moved),
      created: existing === null,
    };
  }

  async delete(path: string): Promise<DeleteResult> {
    const relative = assertSafeVaultPath(path);
    const absolute = this.absolute(relative);
    const info = await statOrNull(absolute);
    if (info === null) throw new VaultNotFoundError(relative);
    const token = createUndoToken();
    const manifest: TrashManifest = {
      token,
      deletedAt: new Date().toISOString(),
      kind: 'delete',
      entries: [{ path: relative, dir: info.isDirectory() }],
    };
    await this.writeText(trashManifestPath(token), `${JSON.stringify(manifest, null, 2)}\n`);
    await movePath(absolute, this.absolute(trashPath(token, relative)));
    return { path: relative, undoToken: token };
  }

  async snapshot(path: string): Promise<string | null> {
    const relative = assertSafeVaultPath(path);
    /* Liest die Datei, statt zu statten: `readTextOrNull` gibt bei ENOENT **und** bei
       einem Ordner `null` — genau die beiden Faelle, in denen nichts zu sichern ist. */
    const content = await readTextOrNull(this.absolute(relative));
    if (content === null) return null;
    const token = createUndoToken();
    const manifest: TrashManifest = {
      token,
      deletedAt: new Date().toISOString(),
      kind: 'snapshot',
      entries: [{ path: relative, dir: false }],
    };
    /* Erst die Kopie, dann das Manifest: eine Marke ist damit nie gueltig, bevor der
       Inhalt hinter ihr wirklich liegt. */
    await this.writeText(trashPath(token, relative), content);
    await this.writeText(trashManifestPath(token), `${JSON.stringify(manifest, null, 2)}\n`);
    return token;
  }

  async undo(token: string): Promise<string[]> {
    const manifestPath = trashManifestPath(token);
    const manifest = parseManifest(await readTextOrNull(this.absolute(manifestPath)));
    if (manifest === null) throw new VaultNotFoundError(manifestPath);
    const restored: string[] = [];
    for (const entry of manifest.entries) {
      const source = this.absolute(trashPath(token, entry.path));
      const target = this.absolute(entry.path);
      if ((await statOrNull(source)) === null) continue;
      if ((await statOrNull(target)) !== null) {
        /* Eine Sicherung gehoert ausdruecklich ueber die Datei zurueck, die sie
           abgeloest hat — sonst waere der Schreibweg ohne Rueckweg. Nur bei einem
           echten Loeschen ist ein belegter Zielort fremder Inhalt und ein Konflikt. */
        if (manifest.kind !== 'snapshot') {
          throw new VaultConflictError(
            { path: entry.path, expectedHash: '', actualHash: '' },
            'Am Zielort liegt schon wieder eine Datei.',
          );
        }
        await removePath(target);
      }
      await movePath(source, target);
      restored.push(entry.path);
    }
    await removePath(this.absolute(trashRoot(token)));
    await removePath(this.absolute(manifestPath));
    return restored;
  }

  async *walk(options: ListOptions = {}): AsyncIterable<VaultStat> {
    const start = options.dir === undefined ? '' : assertSafeVaultPath(options.dir);
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    let yielded = 0;
    const queue: string[] = [start];
    while (queue.length > 0) {
      const current = queue.shift() ?? '';
      const entries = await readDirEntries(current === '' ? this.root : this.absolute(current));
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const relative = current === '' ? entry.name : `${current}/${entry.name}`;
        if (entry.dir) {
          if (SKIPPED_DIRS.has(entry.name)) continue;
          if (options.includeInternal !== true && isInside(VAULT_DIRS.internal, relative)) continue;
          if (options.includeDirs === true) {
            const info = await statOrNull(this.absolute(relative));
            if (info !== null) {
              yielded += 1;
              yield { path: relative, size: 0, modified: info.mtime.toISOString(), dir: true };
              if (yielded >= limit) return;
            }
          }
          if (options.recursive !== false) queue.push(relative);
          continue;
        }
        if (extName(relative) === '.tmp') continue;
        if (options.includeInternal !== true && isInside(VAULT_DIRS.internal, relative)) continue;
        if (options.ext !== undefined && extName(relative) !== options.ext.toLowerCase()) continue;
        const info = await statOrNull(this.absolute(relative));
        if (info === null) continue;
        yielded += 1;
        yield {
          path: relative,
          size: info.size,
          modified: info.mtime.toISOString(),
          dir: false,
        };
        if (yielded >= limit) return;
      }
    }
  }

  async list(options: ListOptions = {}): Promise<string[]> {
    const paths: string[] = [];
    for await (const entry of this.walk(options)) paths.push(entry.path);
    return paths;
  }

  async exists(path: string): Promise<boolean> {
    return (await statOrNull(this.absolute(path))) !== null;
  }

  async stat(path: string): Promise<VaultStat | null> {
    const relative = assertSafeVaultPath(path);
    const info = await statOrNull(this.absolute(relative));
    if (info === null) return null;
    return {
      path: relative,
      size: info.isDirectory() ? 0 : info.size,
      modified: info.mtime.toISOString(),
      dir: info.isDirectory(),
    };
  }

  async hash(path: string): Promise<string | null> {
    const content = await readTextOrNull(this.absolute(path));
    return content === null ? null : sha256(content);
  }

  async mkdir(dir: string): Promise<void> {
    await ensureDir(this.absolute(dir));
  }
}
