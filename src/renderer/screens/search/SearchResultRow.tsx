/* One hit in the full search result view (059, D5) — title, type, mono path
   and date, snippet, and a secondary "open externally" action. Mirrors
   `components/PageList.tsx`'s row markup and active-state convention, with
   the one thing that view never needed: a second control on the row that
   must never trigger the row's own open (AC4 — the default stays in the
   app). The two live as sibling buttons, not nested ones — nesting a button
   inside a button is invalid HTML and would let the browser silently move
   markup around. */

import type { SearchHit } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { Snippet } from '../../components/Snippet';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { TYPE_LABEL_KEY } from '../reader/ReaderFacts';

export interface SearchResultRowProps {
  hit: SearchHit;
  active: boolean;
  onOpen: (path: string) => void;
  onHover: () => void;
}

export function SearchResultRow({ hit, active, onOpen, onHover }: SearchResultRowProps) {
  const t = useT();
  const language = useLanguage();

  return (
    <li>
      <div className="sb-searchresult" data-active={active}>
        <button
          type="button"
          className="sb-searchresult-main"
          onMouseEnter={onHover}
          onClick={() => onOpen(hit.path)}
        >
          <div className="sb-searchresult-head">
            <span className="sb-searchresult-title">{hit.title}</span>
            <span className="sb-searchresult-type gs-overline">
              {t(TYPE_LABEL_KEY[hit.docType])}
            </span>
          </div>
          <div className="sb-searchresult-meta sb-mono">
            <span>{hit.path}</span>
            <span>{formatDate(hit.updated, language)}</span>
          </div>
          {hit.snippet.length > 0 ? (
            <p className="sb-searchresult-snippet">
              <Snippet text={hit.snippet} />
            </p>
          ) : null}
        </button>
        <button
          type="button"
          className="sb-searchresult-external"
          title={t('search.result.openExternalAria', { title: hit.title })}
          aria-label={t('search.result.openExternalAria', { title: hit.title })}
          onClick={(event) => {
            // Never let the click bubble into the row's own open — this
            // action stays a secondary, explicit one (AC4).
            event.stopPropagation();
            void api.shell.openPath(hit.path).catch(() => undefined);
          }}
        >
          <Icon name="external-link" size={14} />
        </button>
      </div>
    </li>
  );
}
