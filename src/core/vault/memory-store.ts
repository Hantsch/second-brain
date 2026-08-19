/**
 * `MemoryVaultStore` — derselbe Vertrag, nur ohne Platte. Fuer Tests und fuer
 * Vorschau-Laeufe, die nichts anfassen duerfen.
 *
 * Bewusst gleich gebaut wie `FsVaultStore`: Pfadwache, Konfliktpruefung,
 * Frontmatter-Merge, Abschnitts-Anhaengen und Papierkorb kommen aus denselben
 * reinen Modulen. Verhaltensunterschiede sind damit Bugs, keine Absicht.
 */

import type { VaultDoc, WriteResult } from '@shared/types';
import { VAULT_DIRS } from '@shared/types';
import { assertWritable, composeContent } from './compose';
import { serialize } from './frontmatter';
import { toVaultDoc } from './doc';
import { byteLength, sha256 } from './hash';
import { assertSafeVaultPath, dirName, extName, isInside } from './paths';
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

interface MemoryFile {
  content: string;
  modified: string;
}

export class MemoryVaultStore implements VaultStore {
  readonly root: string;
  private readonly files = new Map<string, MemoryFile>();
  private readonly dirs = new Set<string>();
  private clock: number;

  constructor(options: { root?: string; files?: Record<string, string>; now?: Date } = {}) {
    this.root = options.root ?? 'memory://vault';
    this.clock = (options.now ?? new Date()).getTime();
    for (const [path, content] of Object.entries(options.files ?? {})) {
      this.put(assertSafeVaultPath(path), content);
    }
  }

  /** Zeitstempel, der bei jedem Schreiben eine Millisekunde weiterlaeuft. */
  private nextStamp(): string {
    this.clock += 1;
    return new Date(this.clock).toISOString();
  }

  private put(path: string, content: string): MemoryFile {
    const file = { content, modified: this.nextStamp() };
    this.files.set(path, file);
    for (let dir = dirName(path); dir.length > 0; dir = dirName(dir)) this.dirs.add(dir);
    return file;
  }

  /** Alle Dateien, die unter diesem Pfad liegen (er selbst eingeschlossen). */
  private under(path: string): string[] {
    return [...this.files.keys()].filter((candidate) => isInside(path, candidate));
  }

  private isDir(path: string): boolean {
    return this.dirs.has(path) || this.under(path).some((candidate) => candidate !== path);
  }

  /**
   * Leere Ordner unter `prefix` vergessen. Ohne das gaebe es nach einem Verschieben
   * oder Loeschen Geisterordner, die das echte Dateisystem nicht hat.
   */
  private pruneDirs(prefix: string): void {
    for (const dir of [...this.dirs]) {
      if (!isInside(prefix, dir)) continue;
      if (this.under(dir).length === 0) this.dirs.delete(dir);
    }
  }

  async read(path: string): Promise<VaultDoc | null> {
    const relative = assertSafeVaultPath(path);
    const file = this.files.get(relative);
    if (file === undefined) return null;
    return toVaultDoc(relative, file.content, {
      modified: file.modified,
      size: byteLength(file.content),
    });
  }

  async readMany(paths: string[]): Promise<VaultDoc[]> {
    const docs = await Promise.all(paths.map((path) => this.read(path)));
    return docs.filter((doc): doc is VaultDoc => doc !== null);
  }

  async readText(path: string): Promise<string | null> {
    return this.files.get(assertSafeVaultPath(path))?.content ?? null;
  }

  async write(input: WriteInput): Promise<WriteResult> {
    const relative = assertSafeVaultPath(input.path);
    const existing = this.files.get(relative)?.content ?? null;
    assertWritable(relative, existing, input);
    const content = composeContent(relative, existing, input);
    this.put(relative, content);
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
    const existing = this.files.get(relative)?.content ?? null;
    assertWritable(relative, existing, options);
    this.put(relative, content);
    return { path: relative, hash: sha256(content), created: existing === null };
  }

  async append(
    path: string,
    section: string,
    content: string,
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    const relative = assertSafeVaultPath(path);
    const found = this.files.get(relative)?.content ?? null;
    assertWritable(relative, found, { expectedHash: options.expectedHash });
    if (found === null && options.frontmatterIfNew === undefined) {
      throw new VaultNotFoundError(relative);
    }
    const existing = found ?? serialize(options.frontmatterIfNew ?? {}, '');
    const result = appendToSection(existing, section, content);
    if (found === null || result.content !== found) this.put(relative, result.content);
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
    const moving = this.under(source);
    if (moving.length === 0) throw new VaultNotFoundError(source);
    const blocking = this.under(target);
    if (blocking.length > 0 && options.overwrite !== true) {
      const existing = this.files.get(target)?.content ?? null;
      throw new VaultConflictError(
        { path: target, expectedHash: '', actualHash: existing === null ? '' : sha256(existing) },
        'Das Ziel existiert bereits.',
      );
    }
    const existed = this.files.has(target);
    for (const candidate of blocking) this.files.delete(candidate);
    for (const candidate of moving) {
      const file = this.files.get(candidate);
      if (file === undefined) continue;
      const suffix = candidate.slice(source.length);
      this.files.delete(candidate);
      this.files.set(`${target}${suffix}`, file);
      for (let dir = dirName(`${target}${suffix}`); dir.length > 0; dir = dirName(dir)) {
        this.dirs.add(dir);
      }
    }
    this.pruneDirs(source);
    const content = this.files.get(target)?.content ?? null;
    return { path: target, hash: content === null ? '' : sha256(content), created: !existed };
  }

  async delete(path: string): Promise<DeleteResult> {
    const relative = assertSafeVaultPath(path);
    const affected = this.under(relative);
    if (affected.length === 0) throw new VaultNotFoundError(relative);
    const token = createUndoToken();
    const manifest: TrashManifest = {
      token,
      deletedAt: new Date(this.clock).toISOString(),
      entries: [{ path: relative, dir: this.isDir(relative) }],
    };
    this.put(trashManifestPath(token), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const candidate of affected) {
      const file = this.files.get(candidate);
      if (file === undefined) continue;
      this.files.delete(candidate);
      this.files.set(trashPath(token, candidate), file);
    }
    this.pruneDirs(relative);
    return { path: relative, undoToken: token };
  }

  async undo(token: string): Promise<string[]> {
    const manifestPath = trashManifestPath(token);
    const manifest = parseManifest(this.files.get(manifestPath)?.content ?? null);
    if (manifest === null) throw new VaultNotFoundError(manifestPath);
    const restored: string[] = [];
    for (const entry of manifest.entries) {
      const source = trashPath(token, entry.path);
      const stored = this.under(source);
      if (stored.length === 0) continue;
      if (this.under(entry.path).length > 0) {
        throw new VaultConflictError(
          { path: entry.path, expectedHash: '', actualHash: '' },
          'Am Zielort liegt schon wieder eine Datei.',
        );
      }
      for (const candidate of stored) {
        const file = this.files.get(candidate);
        if (file === undefined) continue;
        this.files.delete(candidate);
        this.files.set(`${entry.path}${candidate.slice(source.length)}`, file);
      }
      restored.push(entry.path);
    }
    for (const candidate of this.under(trashRoot(token))) this.files.delete(candidate);
    this.files.delete(manifestPath);
    this.pruneDirs(trashRoot(token));
    return restored;
  }

  async *walk(options: ListOptions = {}): AsyncIterable<VaultStat> {
    const start = options.dir === undefined ? '' : assertSafeVaultPath(options.dir);
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const paths = [...this.files.keys()].sort((a, b) => a.localeCompare(b));
    let yielded = 0;
    for (const path of paths) {
      if (start.length > 0 && !isInside(start, path)) continue;
      if (options.recursive === false && dirName(path) !== start) continue;
      if (options.includeInternal !== true && isInside(VAULT_DIRS.internal, path)) continue;
      if (extName(path) === '.tmp') continue;
      if (options.ext !== undefined && extName(path) !== options.ext.toLowerCase()) continue;
      const file = this.files.get(path);
      if (file === undefined) continue;
      yielded += 1;
      yield { path, size: byteLength(file.content), modified: file.modified, dir: false };
      if (yielded >= limit) return;
    }
  }

  async list(options: ListOptions = {}): Promise<string[]> {
    const paths: string[] = [];
    for await (const entry of this.walk(options)) paths.push(entry.path);
    return paths;
  }

  async exists(path: string): Promise<boolean> {
    const relative = assertSafeVaultPath(path);
    return this.files.has(relative) || this.isDir(relative);
  }

  async stat(path: string): Promise<VaultStat | null> {
    const relative = assertSafeVaultPath(path);
    const file = this.files.get(relative);
    if (file !== undefined) {
      return {
        path: relative,
        size: byteLength(file.content),
        modified: file.modified,
        dir: false,
      };
    }
    if (!this.isDir(relative)) return null;
    return { path: relative, size: 0, modified: new Date(this.clock).toISOString(), dir: true };
  }

  async hash(path: string): Promise<string | null> {
    const content = this.files.get(assertSafeVaultPath(path))?.content;
    return content === undefined ? null : sha256(content);
  }

  async mkdir(dir: string): Promise<void> {
    const relative = assertSafeVaultPath(dir);
    for (let current = relative; current.length > 0; current = dirName(current)) {
      this.dirs.add(current);
    }
  }

  /** Nur fuer Tests: der rohe Inhalt aller Dateien. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files].map(([path, file]) => [path, file.content]));
  }
}
