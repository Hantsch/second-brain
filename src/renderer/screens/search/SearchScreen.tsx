/* The full search result view (059, D5) — more than the command palette's six
   hits, with snippets and the scope/type filters the index already supports.
   A route, `/search?q=&scope=&types=`, not a rail entry (the rail stays at
   its seven places): the address carries the state so Back and a reload keep
   it, like every other screen.

   Keyboard path mirrors the command palette's (`CommandPalette.tsx`): the
   query field autofocuses, ArrowUp/ArrowDown move an active row without
   moving DOM focus off the field, and Enter opens the active row via
   `useOpenDoc()` — which is what makes AC3 (a hit with a home deep-links
   there) work, since `homeOf` already resolves the well-known kinds and only
   falls back to the generic reader otherwise. Roving keys are scoped to the
   query field specifically (`isQueryField` below): the filter chips and the
   external-open buttons are real, separately focusable controls a user may
   Tab to, and an Enter on one of those must activate *that* control, not
   silently reopen whatever row happened to be active. */

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { DocType, Scope } from '@shared/types';
import { SCOPES } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries/keys';
import { useSearchResults } from '../../lib/queries/search';
import { useOpenDoc } from '../../lib/use-open-doc';
import { SearchFilters, TYPE_GROUPS } from './SearchFilters';
import type { TypeGroup } from './SearchFilters';
import { SearchResultRow } from './SearchResultRow';

/** Result paging (059, decisions): 50 hits, then "show more" fetches +50 —
    bounded, no virtualisation needed at the vault sizes this app sees. */
const PAGE_SIZE = 50;

function isScope(value: string | null): value is Scope {
  return value !== null && (SCOPES as readonly string[]).includes(value);
}

function isTypeGroup(value: string | null): value is TypeGroup {
  return value !== null && value in TYPE_GROUPS;
}

/** Only the query field drives roving — see the header comment for why the
    filter chips and the external-open buttons are deliberately excluded. */
function isQueryField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.dataset.role === 'search-query';
}

interface UrlUpdate {
  q?: string;
  scope?: Scope | null;
  types?: TypeGroup | null;
}

export function SearchScreen() {
  const t = useT();
  const openDoc = useOpenDoc();
  const queryFieldId = useId();
  const [params, setParams] = useSearchParams();

  const text = params.get('q') ?? '';
  const scope = isScope(params.get('scope')) ? (params.get('scope') as Scope) : null;
  const group = isTypeGroup(params.get('types')) ? (params.get('types') as TypeGroup) : null;
  const types: DocType[] | undefined = group === null ? undefined : [...TYPE_GROUPS[group]];

  const [limit, setLimit] = useState(PAGE_SIZE);
  const [active, setActive] = useState(0);
  /* A new query text or filter starts a fresh result set: the previous
     page's size and roving position belong to the old search, not this one.
     Reset during render rather than in an effect — the React-endorsed
     pattern for "adjust state when a prop changes" (react-hooks/set-state-in-
     effect flags the effect-based version, since it costs an extra
     committed render the in-render reset avoids). */
  const [seenQuery, setSeenQuery] = useState({ text, scope, group });
  if (seenQuery.text !== text || seenQuery.scope !== scope || seenQuery.group !== group) {
    setSeenQuery({ text, scope, group });
    setLimit(PAGE_SIZE);
    setActive(0);
  }

  function updateUrl(next: UrlUpdate): void {
    const nextParams = new URLSearchParams(params);
    if (next.q !== undefined) {
      if (next.q.length === 0) nextParams.delete('q');
      else nextParams.set('q', next.q);
    }
    if (next.scope !== undefined) {
      if (next.scope === null) nextParams.delete('scope');
      else nextParams.set('scope', next.scope);
    }
    if (next.types !== undefined) {
      if (next.types === null) nextParams.delete('types');
      else nextParams.set('types', next.types);
    }
    setParams(nextParams, { replace: true });
  }

  /* Shares its cache entry with `VaultIndicator` — both ask the same honest
     question, "does an index exist at all", not "did this query find
     anything". */
  const { data: status } = useQuery({ queryKey: qk.vault.status(), queryFn: api.vault.status });
  const noIndex = status !== undefined && status.indexedAt === null;

  const {
    data: hits,
    isPending,
    isFetching,
  } = useSearchResults({
    text,
    scope: scope ?? undefined,
    types,
    limit,
  });
  const shown = hits ?? [];
  const canShowMore = shown.length >= limit;

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (!isQueryField(event.target) || shown.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % shown.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + shown.length) % shown.length);
    } else if (event.key === 'Enter') {
      const hit = shown[active];
      if (hit === undefined) return;
      event.preventDefault();
      openDoc(hit.path);
    }
  };

  let content: React.ReactNode;
  if (text.trim().length === 0) {
    content = (
      <EmptyState
        icon="search"
        title={t('screen.search.prompt.title')}
        body={t('screen.search.prompt.body')}
      />
    );
  } else if (noIndex) {
    content = (
      <EmptyState
        icon="search"
        title={t('screen.search.noIndex.title')}
        body={t('screen.search.noIndex.body')}
      />
    );
  } else if (isPending) {
    content = <Skeleton lines={6} height={56} />;
  } else if (shown.length === 0) {
    content = (
      <EmptyState
        icon="search"
        title={t('screen.search.empty.title')}
        body={t('screen.search.empty.body', { query: text.trim() })}
      />
    );
  } else {
    content = (
      <>
        <ul className="sb-searchresults">
          {shown.map((hit, index) => (
            <SearchResultRow
              key={hit.path}
              hit={hit}
              active={index === active}
              onHover={() => setActive(index)}
              onOpen={openDoc}
            />
          ))}
        </ul>
        {canShowMore ? (
          <div className="sb-search-foot">
            <Button
              variant="secondary"
              icon="chevron-down"
              loading={isFetching}
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              {t('search.showMore', { count: PAGE_SIZE })}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="sb-screen" onKeyDown={onKeyDown}>
      <ScreenHeader overline={t('screen.search.overline')} title={t('screen.search.title')} />
      <div className="gs-field">
        <label className="gs-label" htmlFor={queryFieldId}>
          {t('screen.search.queryLabel')}
        </label>
        <div className="gs-inputwrap">
          <span className="gs-input-icon">
            <Icon name="search" size={15} />
          </span>
          <input
            id={queryFieldId}
            data-role="search-query"
            autoFocus
            className="gs-input gs-input--withicon"
            placeholder={t('screen.search.queryPlaceholder')}
            value={text}
            onChange={(event) => updateUrl({ q: event.target.value })}
          />
        </div>
      </div>
      <SearchFilters
        scope={scope}
        onScopeChange={(next) => updateUrl({ scope: next })}
        group={group}
        onGroupChange={(next) => updateUrl({ types: next })}
      />
      {content}
    </div>
  );
}
