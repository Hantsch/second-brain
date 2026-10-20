/* The generic reading view (story 059, D4): where any vault document with no
   dedicated home (`src/renderer/lib/doc-home.ts`'s fallback) opens — rendered
   Markdown, facts instead of raw frontmatter, every reference navigable
   in-app. Mirrors `screens/modules/PageView.tsx`/`PageBody.tsx`, generalised
   past a wiki page's own module: this screen doesn't know what module (if
   any) a link belongs to, so every wikilink and vault-path reference in the
   body is resolved through the batched `search:resolveLinks` channel (059,
   D2) instead of a locally known page list — one round trip per document,
   never one per link.

   An unresolved reference renders with the exact "missing" look
   `WikiRef`/the wiki page already use — not a dead button, and never a
   silent guess at a path that doesn't exist (CLAUDE.md guardrail 3/5). A path
   that resolves to nothing at all (deleted file, stale link, typo) gets the
   same honest not-found state, never a blank screen or a thrown error. */

import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { VaultDoc } from '@shared/types';
import { baseName, extName } from '@core/vault/paths';
import { Button } from '../../atoms/Button';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { WikiRef } from '../../components/WikiRef';
import { renderMarkdown } from '../../components/markdown-render';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries/keys';
import { useOpenDoc } from '../../lib/use-open-doc';
import { ReaderFacts, TYPE_LABEL_KEY } from './ReaderFacts';

/** Stable identity for "nothing resolved yet" — `resolveLinks.data ?? {}`
    would allocate a fresh object every render and defeat the `useMemo` below
    that depends on it. */
const EMPTY_RESOLVED_MAP: Record<string, string | null> = {};

/** Last path segment — the same idiom `Markdown.tsx` uses for a raw path's label. */
function leaf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** The batch/resolve key for a wikilink target — see the comment on `targets`
    below for why this needs the brackets back. */
function wikilinkKey(target: string): string {
  return `[[${target}]]`;
}

/** Frontmatter `title`, else the filename without its extension — "title
    (from frontmatter or filename)" from the deliverable. */
function titleFor(doc: VaultDoc): string {
  const raw = doc.frontmatter.title;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  const name = baseName(doc.path);
  const ext = extName(name);
  return ext.length > 0 ? name.slice(0, -ext.length) : name;
}

export function ReaderScreen() {
  const t = useT();
  const navigate = useNavigate();
  const openDoc = useOpenDoc();
  const [params] = useSearchParams();
  const path = params.get('path') ?? '';

  const { data: doc, isPending } = useQuery({
    queryKey: qk.vault.doc(path),
    queryFn: () => api.vault.read(path),
    enabled: path.length > 0,
  });

  /* Every wikilink/path reference the body contains, collected in one pass
     that renders nothing (both callbacks return `null`) — this is what makes
     the resolve call below a single batch instead of one lookup per link.

     `resolveLink()` (`core/index/resolve-link.ts`) takes a target exactly as
     it would stand in a source file: a raw vault path as itself, but a
     wikilink only as its full `[[target]]` form — its rule 2 re-parses that
     form with `parseWikilinks()` to split module from slug. The renderer's
     `wikilink` callback already hands back the *bare* target (brackets
     stripped by `markdown-render.tsx`), so it is put back on here; a path
     reference needs no such wrapping. */
  const targets = useMemo(() => {
    if (doc == null) return [] as string[];
    const found = new Set<string>();
    renderMarkdown(doc.body, {
      wikilink: (target) => {
        if (target.length > 0) found.add(wikilinkKey(target));
        return null;
      },
      path: (rawPath) => {
        if (rawPath.length > 0) found.add(rawPath);
        return null;
      },
    });
    return Array.from(found);
  }, [doc]);

  const resolveLinks = useQuery({
    queryKey: qk.search.resolveLinks(path, targets),
    queryFn: () => api.search.resolveLinks(path, targets),
    enabled: targets.length > 0,
  });
  /* Nothing to resolve is "ready" immediately; otherwise the body waits for
     the batch so a link never flashes "missing" before its answer arrives. */
  const linksReady = targets.length === 0 || resolveLinks.data !== undefined;
  const resolvedMap = resolveLinks.data ?? EMPTY_RESOLVED_MAP;

  const bodyNodes = useMemo((): ReactNode[] => {
    if (doc == null || !linksReady) return [];
    const openWikilink = (target: string): void => {
      const resolved = resolvedMap[wikilinkKey(target)] ?? null;
      if (resolved !== null) openDoc(resolved);
    };
    const openPath = (rawPath: string): void => {
      const resolved = resolvedMap[rawPath] ?? null;
      if (resolved !== null) openDoc(resolved);
    };
    return renderMarkdown(doc.body, {
      wikilink: (target, label, key) => (
        <WikiRef
          key={key}
          target={target}
          label={label.length > 0 ? label : target}
          missing={(resolvedMap[wikilinkKey(target)] ?? null) === null}
          onOpen={openWikilink}
        />
      ),
      path: (rawPath, line, key) => (
        <WikiRef
          key={key}
          target={rawPath}
          label={line === null ? leaf(rawPath) : `${leaf(rawPath)}:${line}`}
          missing={(resolvedMap[rawPath] ?? null) === null}
          onOpen={openPath}
        />
      ),
    });
  }, [doc, linksReady, resolvedMap, openDoc]);

  /* AC6: focus moves to the heading once — re-fetches of the same document
     (the file watcher revalidating) must not steal focus back a second time,
     but a genuine navigation to a different path gets it again. */
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (doc != null && focusedFor.current !== doc.path) {
      focusedFor.current = doc.path;
      heading.current?.focus();
    }
  }, [doc]);

  const backButton = (
    <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => navigate(-1)}>
      {t('reader.back')}
    </Button>
  );

  if (path.length === 0 || (!isPending && doc == null)) {
    return (
      <div className="sb-screen">
        <div className="sb-pageview-head">
          <div className="sb-pageview-title" />
          <div className="sb-pageview-actions">{backButton}</div>
        </div>
        <EmptyState
          icon="circle-alert"
          title={t('reader.notFound.title')}
          body={t('error.about.not-found', { subject: path })}
        />
      </div>
    );
  }

  if (isPending || doc == null) {
    return (
      <div className="sb-screen">
        <Skeleton lines={6} height={16} />
      </div>
    );
  }

  return (
    <div className="sb-screen">
      <div className="sb-pageview">
        <div className="sb-pageview-head">
          <div className="sb-pageview-title">
            <span className="gs-overline">{t(TYPE_LABEL_KEY[doc.frontmatter.type])}</span>
            <h1 ref={heading} tabIndex={-1} className="sb-header-title">
              {titleFor(doc)}
            </h1>
            <span className="sb-mono">{doc.path}</span>
          </div>
          <div className="sb-pageview-actions">
            {backButton}
            <Button
              variant="ghost"
              size="sm"
              icon="external-link"
              onClick={() => void api.shell.openPath(doc.path).catch(() => undefined)}
            >
              {t('reader.openExternal')}
            </Button>
          </div>
        </div>

        <ReaderFacts doc={doc} />

        {bodyNodes.length === 0 ? (
          linksReady ? (
            <p className="sb-panel-empty">{t('page.empty')}</p>
          ) : (
            <Skeleton lines={4} height={16} />
          )
        ) : (
          <div className="sb-md">{bodyNodes}</div>
        )}
      </div>
    </div>
  );
}
