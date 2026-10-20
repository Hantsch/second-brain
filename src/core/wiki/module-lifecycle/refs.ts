/**
 * Pure rewriters for a module rename/delete — every pointer story 063 names, as one
 * small function each. No filesystem I/O: every function here takes content (or an
 * already-parsed value) and returns the rewritten form, so `plan.ts` can preview the
 * exact same edit that the apply steps (D2/D3) will later perform.
 *
 * `retargetModuleLinks` mirrors `repointLine` in `@core/gardener/discard.ts`: only
 * the wikilink's target changes, never the surrounding text or its label.
 */

import {
  frontmatterText,
  mergeFrontmatter,
  parse,
  serialize,
  serializeBlock,
} from '@core/vault/frontmatter';
import { patchFrontmatterYaml } from '@core/vault/frontmatter-patch';
import { VaultFrontmatterError } from '@core/vault/types';

/** Same wikilink shape as `WIKILINK` in `@core/index/pages.ts` and `discard.ts`. */
const WIKILINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g;

/**
 * `body`, with every `[[from/x]]` / `[[from/x|label]]` wikilink retargeted to `to`.
 * A bare `[[x]]` (no module prefix — a same-module link) and a link naming any other
 * module are left byte-for-byte, labels included.
 */
export function retargetModuleLinks(body: string, from: string, to: string): string {
  return body.replace(WIKILINK, (full: string, rawTarget: string, label?: string) => {
    const raw = rawTarget.trim();
    const cut = raw.lastIndexOf('/');
    if (cut < 0) return full; // bare slug: resolves within its own module, never touched
    const module = raw.slice(0, cut).trim();
    if (module !== from) return full;
    const slug = raw.slice(cut + 1).trim();
    const retargeted = `${to}/${slug}`;
    return label === undefined ? `[[${retargeted}]]` : `[[${retargeted}|${label}]]`;
  });
}

/** One `[[...]]` hit inside `body` whose module part is exactly `module`. */
export interface ModuleLinkHit {
  /** The line the link sits in, unchanged — for a human-readable preview. */
  line: string;
  /** The raw target inside the brackets, e.g. `old-slug/some-page`. */
  target: string;
}

/** Every wikilink in `body` that explicitly names `module` — used to report links
 * that would break on delete (there is nothing to repoint them to). */
export function findModuleLinks(body: string, module: string): ModuleLinkHit[] {
  const hits: ModuleLinkHit[] = [];
  for (const line of body.split('\n')) {
    WIKILINK.lastIndex = 0;
    for (let match = WIKILINK.exec(line); match !== null; match = WIKILINK.exec(line)) {
      const raw = (match[1] ?? '').trim();
      const cut = raw.lastIndexOf('/');
      if (cut < 0) continue;
      if (raw.slice(0, cut).trim() !== module) continue;
      hits.push({ line, target: raw });
    }
  }
  return hits;
}

/** Merge a frontmatter patch into `content` and re-serialize — the one place every
 * frontmatter-field rewriter below goes through, so all of them merge the same way
 * `composeContent` does: unreadable YAML aborts loudly instead of being silently
 * discarded, and a readable block is patched in place (comments, flow-style lists
 * and quote style survive) rather than rebuilt from scratch. `path` is only for the
 * error message — nothing here reads or writes the vault. */
export function withFrontmatterPatch(
  path: string,
  content: string,
  patch: Record<string, unknown>,
): string {
  const parsed = parse(content);
  if (parsed.rawFrontmatter !== undefined) {
    // Unreadable YAML would be lost on merge. Better to abort honestly than to
    // silently overwrite the user's content.
    throw new VaultFrontmatterError(path, parsed.warning ?? 'Frontmatter ist nicht lesbar.');
  }
  const raw = frontmatterText(content);
  const patched = raw === null ? null : patchFrontmatterYaml(raw, patch);
  if (patched !== null) return serializeBlock(patched, parsed.body);
  return serialize(mergeFrontmatter(parsed.frontmatter, patch), parsed.body);
}

/** `module.md` after a rename: title, slug and module all move to the new name. */
export function retargetModuleFile(
  path: string,
  content: string,
  newSlug: string,
  newTitle: string,
): string {
  return withFrontmatterPatch(path, content, { title: newTitle, slug: newSlug, module: newSlug });
}

/** A wiki page's `module:` field after a rename. Always applied to every page the
 * module owns — unlike the other rewriters here, there is no "does it change" case. */
export function retargetPageModule(path: string, content: string, newSlug: string): string {
  return withFrontmatterPatch(path, content, { module: newSlug });
}

/**
 * The overview page's `title` field, only when it still carries the old title
 * verbatim as a prefix (`createModule` writes `"<title> — <synthesis-label>"`, in
 * whichever document language). `null` when nothing matches — a hand-edited title
 * is left alone rather than guessed at. A bare `startsWith` would also match a word
 * that merely happens to start the same way (`"Produkt"` vs. `"Produktwissen — …"`),
 * so what follows the prefix must be the end of the string or a non-word character.
 */
export function retargetOverviewTitle(
  path: string,
  content: string,
  oldTitle: string,
  newTitle: string,
): string | null {
  const parsed = parse(content);
  const title = parsed.frontmatter['title'];
  if (typeof title !== 'string' || !title.startsWith(oldTitle)) return null;
  const boundary = title.slice(oldTitle.length, oldTitle.length + 1);
  if (boundary !== '' && /[a-z0-9]/iu.test(boundary)) return null;
  const suffix = title.slice(oldTitle.length);
  return withFrontmatterPatch(path, content, { title: `${newTitle}${suffix}` });
}

/** Literal `modules/<from>` path segments anywhere in the text, rewritten to `modules/<to>`
 * — used for AGENTS.md, the one file that spells the module's own path out loud. */
export function retargetModulePaths(content: string, from: string, to: string): string {
  if (from === to) return content; // title-only rename: no path in the text moves
  // Boundary is "not another slug character" rather than "followed by a slash": a
  // slug appearing at the very end of a line or before punctuation must still match,
  // and this also refuses to touch `modules/<from>-extra` as a false positive.
  const pattern = new RegExp(`modules/${escapeRegExp(from)}(?![a-z0-9-])`, 'gu');
  return content.replace(pattern, `modules/${to}`);
}

/**
 * The first line of `content`, when it ends in `<separator> <oldTitle>` — the
 * headline shape both AGENTS.md (`# Wissens-Modul: <title>`, separator `:`) and
 * `wiki/index.md` (`# Katalog — <title>`, separator `—`) use. Left alone if the
 * user already changed the headline: "only where it still carries the old title
 * verbatim" (story 063).
 */
export function retargetHeadlineTitle(
  content: string,
  oldTitle: string,
  newTitle: string,
  separator: ':' | '—',
): string {
  const lines = content.split('\n');
  const first = lines[0] ?? '';
  const suffix = `${separator} ${oldTitle}`;
  if (!first.trimEnd().endsWith(suffix)) return content;
  // A function replacement is never subject to `String.replace`'s special-pattern
  // handling (`$&`, `$$`, …) — a title containing one of those would otherwise be
  // silently corrupted.
  lines[0] = `${first.slice(0, first.length - suffix.length)}${suffix.replace(oldTitle, () => newTitle)}`;
  return lines.join('\n');
}

/** One rename/delete edit to a string list such as a project's `modules:` field. */
export interface ListEdit {
  from: string;
  /** New slug for a rename, or `null` to drop `from` entirely (delete). */
  to: string | null;
}

/** `list` with `edit.from` renamed to `edit.to`, or dropped when `edit.to` is `null`.
 * `null` when `list` didn't contain `from` in the first place — nothing to change. */
export function retargetSlugList(list: readonly unknown[], edit: ListEdit): string[] | null {
  if (edit.to === edit.from) return null; // renaming a slug to itself is a title-only rename
  const strings = list.filter((entry): entry is string => typeof entry === 'string');
  if (!strings.includes(edit.from)) return null;
  return edit.to === null
    ? strings.filter((entry) => entry !== edit.from)
    : dedupe(strings.map((entry) => (entry === edit.from ? edit.to : entry) as string));
}

/** A project's `modules:` frontmatter after the edit — `null` when the project
 * doesn't name `edit.from` at all. */
export function retargetProjectModules(
  path: string,
  content: string,
  edit: ListEdit,
): string | null {
  const parsed = parse(content);
  const next = retargetSlugList(
    Array.isArray(parsed.frontmatter['modules']) ? parsed.frontmatter['modules'] : [],
    edit,
  );
  return next === null ? null : withFrontmatterPatch(path, content, { modules: next });
}

/** A dump's `filed_into` receipt after a rename — `null` when it doesn't point into
 * `modules/<from>/`. Delete never calls this: a receipt records where content went,
 * and it stays as-is (story 063 decisions). */
export function retargetDumpFiledInto(
  path: string,
  content: string,
  from: string,
  to: string,
): string | null {
  if (from === to) return null; // title-only rename: the path prefix doesn't move
  const parsed = parse(content);
  const filedInto = parsed.frontmatter['filed_into'];
  const prefix = `modules/${from}/`;
  if (typeof filedInto !== 'string' || !filedInto.startsWith(prefix)) return null;
  const rest = filedInto.slice(prefix.length);
  return withFrontmatterPatch(path, content, { filed_into: `modules/${to}/${rest}` });
}

/** Result of rewriting an `.ingest.json` protocol's `modules` bookkeeping. */
export interface IngestModulesEdit {
  content: string;
  /** The list became empty — `sourcePage` was reset to `null` (VAULT-FORMAT.md: an
   * empty `modules` list means "undigested" again). */
  emptied: boolean;
}

/**
 * `raw` (the protocol's JSON text) with `edit.from` renamed to `edit.to`, or removed
 * when `edit.to` is `null`. Mirrors `moduleList` in `@core/wiki/raw-protocol.ts` —
 * kept local since that helper isn't exported and this is the one other place that
 * needs the same tolerant reading of a possibly-broken `modules` field.
 * `null` when the protocol is unreadable or doesn't name `edit.from` — nothing to change.
 */
export function retargetIngestModules(raw: string, edit: ListEdit): IngestModulesEdit | null {
  let record: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    record = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const modules = Array.isArray(record['modules']) ? record['modules'] : [];
  const next = retargetSlugList(modules, edit);
  if (next === null) return null;
  const emptied = next.length === 0;
  const updated: Record<string, unknown> = { ...record, modules: next };
  if (emptied) updated['sourcePage'] = null;
  return { content: `${JSON.stringify(updated, null, 2)}\n`, emptied };
}

function dedupe(list: readonly string[]): string[] {
  return [...new Set(list)];
}

/** Escape a string for literal use inside a `RegExp` — module slugs are already
 * lowercase/hyphen/ASCII, but a title-derived slug is still user input. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
