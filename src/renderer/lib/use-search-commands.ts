/* The command palette's "search" group (059, D6) — extracted out of
   `CommandPalette.tsx` (already at the soft line limit) so the hit→command
   mapping has its own home, the same way `use-palette-commands.ts` already
   holds the fixed destinations and actions.

   Every hit opens through `useOpenDoc()`: `homeOf(path)` always resolves to
   an in-app route (a document with a real home like an area or a project
   lands there directly, everything else falls back to the generic reader),
   so `shell.openPath` is never asked for a search hit anymore — that exit
   was this story's whole reason to exist.

   Once the query has reached two characters (`MIN_QUERY`, the same threshold
   the palette already searches at), one more entry lands at the very top of
   the group: "show all results for …", carrying the query into `/search`.
   It is a plain `CommandDef` like every hit, so the palette's existing
   arrow-key roving reaches it for free — no second keyboard mechanism. */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchHit } from '@shared/types';
import { useT } from '../i18n';
import type { CommandDef } from './commands';
import { useOpenDoc } from './use-open-doc';

/** Mirrors `MIN_QUERY` in `CommandPalette.tsx`: below two characters a search
    is noise, not an answer, so neither hits nor the "show all" entry exist
    yet. Kept local rather than imported so this module has no dependency on
    the palette component — the palette depends on this hook, not the other
    way around. */
const MIN_QUERY = 2;

export interface UseSearchCommandsOptions {
  /** The palette's current query text, untrimmed. */
  query: string;
  /** The current search hits, or `undefined` while no search has run yet. */
  hits: readonly SearchHit[] | undefined;
}

/** The palette's "search" group: one command per hit, plus — once the query
    is long enough — a leading "show all results" command. */
export function useSearchCommands({ query, hits }: UseSearchCommandsOptions): CommandDef[] {
  const t = useT();
  const navigate = useNavigate();
  const openDoc = useOpenDoc();

  return useMemo<CommandDef[]>(() => {
    const trimmed = query.trim();
    const found: CommandDef[] = (hits ?? []).map((hit) => ({
      id: `doc:${hit.path}`,
      group: 'search',
      labelKey: hit.title,
      hint: hit.path,
      icon: 'file-text',
      run: () => openDoc(hit.path),
    }));
    if (trimmed.length < MIN_QUERY) return found;
    const showAll: CommandDef = {
      id: 'search:show-all',
      group: 'search',
      /* Finished text, not a further i18n key — same convention `hit.title`
         above uses, since the query is only known here. */
      labelKey: t('palette.search.showAll', { query: trimmed }),
      icon: 'search',
      run: () => navigate(`/search?q=${encodeURIComponent(trimmed)}`),
    };
    return [showAll, ...found];
  }, [hits, navigate, openDoc, query, t]);
}
