/* Wiring for the condensation channels (story 038, D4): read the existing
 * artifact, run a proposal, accept it, or record a rejection.
 *
 * Two decisions that aren't otherwise visible in the code:
 *
 * - **`condense:accept` does not go through `@core/condense/write.ts`'s
 *   `writeCondensedArea()`.** That helper only knows 037's own
 *   `CondenseAreaProposal` (`.content`), while the wire shape here is
 *   `CondenseProposal` (`.after`) — the two differ on purpose (see
 *   `src/shared/types/condense.ts`). More importantly, accepting also has to
 *   `snapshot()` the file first (for undo), which `writeCondensedArea()` never
 *   does — it was built for a caller that doesn't need undo. So this handler
 *   calls `VaultStore.snapshot()` then `writeText()` directly rather than
 *   forcing a proposal through a helper whose contract doesn't fit.
 * - **The index needs a full `readonly IndexedDoc[]`,** not the narrower lists
 *   the shell's `IndexLike` otherwise exposes (`areas()`, `todos()`, ...) —
 *   `condenseArea()`'s own input selection reads notes, todos and journal days
 *   itself from the raw doc list. The same structural-check pattern as
 *   `wiki-bridge.ts`/`overview-deps.ts` gets it: `index()` is the one method
 *   every real `IndexService` has and this module needs.
 */

import { FsVaultStore } from '@core/vault';
import { sha256 } from '@core/vault/hash';
import { VaultConflictError } from '@core/vault/types';
import type { VaultStore } from '@core/vault/types';
import {
  appendDirective,
  condenseArea,
  condensedAreaPath,
  parseCondensedArtifact,
  partialInputsNote,
} from '@core/condense';
import type { CondenseAreaDeps } from '@core/condense';
import type { IndexedDoc } from '@core/index/types';
import type { CondenseProposal } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { docLanguage, settle } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** What this channel group needs from the index — the raw doc list only. */
const CONDENSE_INDEX_METHODS: readonly string[] = ['index'];

interface DocsView {
  index(): { docs: readonly IndexedDoc[] };
}

function knowsDocs(index: IndexLike): index is IndexLike & DocsView {
  const record = index as unknown as Record<string, unknown>;
  return CONDENSE_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/** Every indexed doc of the open vault — the same list `deriveAreas()` reads. */
function condenseDocs(services: Services): readonly IndexedDoc[] {
  const index = services.requireIndex();
  if (!knowsDocs(index)) throw fail('io', 'der Index liefert keine Dokumentliste');
  return index.index().docs;
}

/** A full `VaultStore` (not the shell's narrower `VaultStoreLike`): condense
    needs `snapshot()`/`writeText()` with hash guards, same as `wikiStore()`. */
function condenseStore(services: Services): VaultStore {
  return new FsVaultStore(services.requireVaultRoot());
}

export function condenseHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'condense:read': async ({ slug }) => {
      const path = condensedAreaPath(slug);
      const content = await condenseStore(services).readText(path);
      if (content === null) return null;
      const artifact = parseCondensedArtifact(content);
      // The hash describes exactly the text just read — not a second, independent
      // read of the file, which could observe a different state under a
      // concurrent external edit and return a hash for content that isn't `content`.
      const hash = sha256(content);
      return { content, hash, condensedAt: artifact.condensedAt, sources: [...artifact.sources] };
    },

    'condense:run': async ({ slug }) => {
      const store = condenseStore(services);
      const path = condensedAreaPath(slug);
      const existingText = await store.readText(path);
      const deps: CondenseAreaDeps = {
        docs: condenseDocs(services),
        gateway: createGateway(services),
        docLanguage: docLanguage(services),
        ...(existingText === null ? {} : { existing: existingText }),
      };
      const result = await condenseArea(deps, slug);

      if (result.kind === 'proposal') {
        const proposal: CondenseProposal = {
          slug: result.slug,
          path: result.path,
          baseHash: result.baseHash,
          before: existingText ?? '',
          after: result.content,
          sources: [...result.sources],
          ...(result.truncated === null
            ? {}
            : { partialInputs: partialInputsNote(result.truncated.count, docLanguage(services)) }),
        };
        return proposal;
      }
      if (result.kind === 'no-model') {
        throw fail('llm-unavailable', `kein Modell für die Aufgabe „${result.task}“ konfiguriert`, {
          task: result.task,
        });
      }
      if (result.kind === 'no-inputs') {
        throw fail('invalid', `für „${slug}“ gibt es noch nichts zu verdichten`);
      }
      if (result.kind === 'attribution-failure') {
        throw fail(
          'invalid',
          'die Antwort des Modells ließ sich nicht auf die gelesenen Quellen zurückführen',
          { problems: result.problems },
        );
      }
      throw fail('unknown', result.reason);
    },

    'condense:accept': async ({ proposal }) => {
      const store = condenseStore(services);
      // Derived from the slug, not taken from `proposal.path` — every other
      // handler in this file distrusts the renderer-supplied path the same way.
      const path = condensedAreaPath(proposal.slug);
      /* A pre-check against the proposal's own `baseHash`, BEFORE `snapshot()`:
         a stale hash must discard the proposal as a conflict without creating a
         trash entry. `snapshot()` unconditionally copies the current file into
         `.secondbrain/trash/`, so calling it first and only then discovering the
         conflict via `writeText()`'s own guard would leave an orphaned trash
         entry behind every time a stale-hash accept is refused. This check is
         still a plain "read fresh right before write" TOCTOU window — the same
         one `writeText()`'s own guard closes as the final, atomic check. */
      if (proposal.baseHash === null) {
        if (await store.exists(path)) {
          throw new VaultConflictError(
            { path, expectedHash: '', actualHash: (await store.hash(path)) ?? '' },
            'Die Datei existiert bereits.',
          );
        }
      } else {
        const currentHash = await store.hash(path);
        if (currentHash !== proposal.baseHash) {
          throw new VaultConflictError(
            { path, expectedHash: proposal.baseHash, actualHash: currentHash ?? '' },
            currentHash === null
              ? 'Die Datei existiert nicht mehr.'
              : 'Die Datei wurde zwischenzeitlich geändert.',
          );
        }
      }
      /* Snapshot first (undo's own precondition), then the hash-guarded write —
         `VaultConflictError` from a stale `baseHash` propagates uncaught, the
         registry turns it into a `conflict` envelope (see `./registry`). */
      const undoToken = await store.snapshot(path);
      const result = await store.writeText(
        path,
        proposal.after,
        proposal.baseHash === null ? { mustNotExist: true } : { expectedHash: proposal.baseHash },
      );
      await settle(services, [path], 'condense');
      return { path: result.path, hash: result.hash, undoToken };
    },

    'condense:reject': async ({ slug, reason }) => {
      if (reason.trim().length === 0) {
        throw fail('invalid', 'eine Begründung ist erforderlich, um abzulehnen');
      }
      const store = condenseStore(services);
      const path = condensedAreaPath(slug);
      const existingText = await store.readText(path);
      const content = appendDirective(existingText, reason, docLanguage(services));
      /* The guard hashes `existingText` itself — the exact bytes `content` was
         built from — instead of re-reading the file a second time. A second,
         independent `hash()` call right before the write would defeat the guard:
         an external edit landing in the window between the two reads would make
         the *second* read's hash match the *new* file, and the write would
         silently replace content that was actually built from the *stale* read. */
      const guard =
        existingText === null ? { mustNotExist: true } : { expectedHash: sha256(existingText) };
      const result = await store.writeText(path, content, guard);
      await settle(services, [path], 'condense');
      return { path: result.path };
    },

    'condense:delete': async ({ slug, expectedHash }) => {
      const store = condenseStore(services);
      const path = condensedAreaPath(slug);
      /* Hashed BEFORE `delete()`, exactly like `condense:accept`'s pre-check
         (see the comment there): a stale hash must refuse without moving the
         file into the trash, and `store.delete()` has no hash guard of its
         own to lean on — the same TOCTOU window as accept's, closed no
         further here than it is there. */
      const currentHash = await store.hash(path);
      if (currentHash === null) {
        throw fail('invalid', `für „${slug}“ gibt es kein Verdichtungsartefakt zum Löschen`);
      }
      if (currentHash !== expectedHash) {
        throw new VaultConflictError(
          { path, expectedHash, actualHash: currentHash },
          'Die Datei wurde zwischenzeitlich geändert.',
        );
      }
      const { undoToken } = await store.delete(path);
      await settle(services, [path], 'condense');
      return { path, undoToken };
    },
  });
}
