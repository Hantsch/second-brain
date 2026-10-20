/* A wiki page: the facts from the frontmatter, the text, who links here —
   and the way to change it.

   Conflict protection is the core of this file, and it hinges on one detail:
   **the hash is frozen when the editor opens, not read when save is
   clicked.** The watcher refreshes the doc query as soon as someone writes
   from outside; if `doc.hash` were only read on save, the old text would go
   out with the new hash — and the main process would accept it. That's
   exactly the silent loss CLAUDE.md rules out.

   That's why `base` holds the version the draft is based on. If an outside
   change comes in meanwhile (`doc.hash !== base.hash`), a bar on the field
   says so, with two paths: reload or keep your own version. Whoever keeps it
   gets `conflict` on save — and only there the explicit path to overwriting.
   The draft stays put until the user decides.

   The field itself, with its messages, lives in `PageEdit.tsx`; this is what
   follows from it: which hash travels along and when the editor closes. */

import { useState } from 'react';
import type { VaultDoc, WikiPage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { decodeIpcError } from '../../lib/ipc-error';
import { useModuleMutations } from '../../lib/queries/modules';
import { PageBody } from './PageBody';
import { PageEdit } from './PageEdit';
import { WikiRef } from '../../components/WikiRef';

export interface PageViewProps {
  page: WikiPage;
  doc: VaultDoc;
  /** All pages of the module — every reference resolves against these. */
  pages: readonly WikiPage[];
  /** A wikilink or source was clicked (`slug` or `module/slug`). */
  onOpenTarget: (target: string) => void;
  /** The user wants to see the outside version. */
  onReload: () => void;
}

/** Frontmatter field as text, else null. */
function field(doc: VaultDoc, name: string): string | null {
  const value = doc.frontmatter[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Title of a page in the same module; `null` if it doesn't exist. */
function titleOf(pages: readonly WikiPage[], module: string, target: string): string | null {
  const slug = target.includes('/') ? (target.split('/').pop() ?? target) : target;
  const scope = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : module;
  return pages.find((page) => page.module === scope && page.slug === slug)?.title ?? null;
}

export function PageView({ page, doc, pages, onOpenTarget, onReload }: PageViewProps) {
  const t = useT();
  const mutations = useModuleMutations(page.module);
  const save = mutations.savePage;
  const [draft, setDraft] = useState<string | null>(null);
  /** The version the draft is based on — frozen when opened. */
  const [base, setBase] = useState<{ body: string; hash: string } | null>(null);
  /** Outside version whose notice the user has dismissed. */
  const [accepted, setAccepted] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const conflict = save.error !== null && decodeIpcError(save.error).code === 'conflict';
  const editing = draft !== null;
  /* Written from outside while the editor is open. */
  const changedOutside = base !== null && doc.hash !== base.hash && accepted !== doc.hash;

  const stopEditing = (): void => {
    setDraft(null);
    setBase(null);
    setAccepted(null);
  };

  const write = (expectedHash: string | undefined): void => {
    if (draft === null) return;
    save.mutate(
      { path: page.path, body: draft, ...(expectedHash === undefined ? {} : { expectedHash }) },
      {
        onSuccess: () => {
          stopEditing();
          setSaved(true);
        },
      },
    );
  };

  const facts: { label: string; value: string }[] = [
    { label: t('page.facts.type'), value: t(`modules.type.${page.type}`) },
    { label: t('page.facts.created'), value: page.created },
    { label: t('page.facts.updated'), value: (field(doc, 'updated') ?? page.updated).slice(0, 10) },
    {
      label: t('page.facts.reviewed'),
      value: field(doc, 'reviewed') ?? t('page.facts.notReviewed'),
    },
  ];

  return (
    <div className="sb-pageview">
      <div className="sb-pageview-head">
        <div className="sb-pageview-title">
          <span className="gs-overline">{t(`modules.category.${page.type}`)}</span>
          <h2 className="sb-pageview-name">{page.title}</h2>
          <span className="sb-mono">{page.path}</span>
        </div>
        <div className="sb-pageview-actions">
          {/* While editing, teal belongs to save — one focal point. */}
          <Button
            variant={editing ? 'secondary' : 'primary'}
            size="sm"
            icon={editing ? 'eye' : 'pencil'}
            onClick={() => {
              save.reset();
              setSaved(false);
              if (editing) {
                stopEditing();
                return;
              }
              /* Text and hash together — they belong to the same version. */
              setBase({ body: doc.body, hash: doc.hash });
              setDraft(doc.body);
            }}
          >
            {editing ? t('page.view') : t('page.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="external-link"
            onClick={() => void api.shell.openPath(page.path).catch(() => undefined)}
          >
            {t('common.openInEditor')}
          </Button>
        </div>
      </div>

      <dl className="sb-facts">
        {facts.map((fact) => (
          <div key={fact.label} className="sb-fact">
            <dt className="sb-fact-label">{fact.label}</dt>
            <dd className="sb-fact-value sb-mono">{fact.value}</dd>
          </div>
        ))}
        <div className="sb-fact sb-fact--wide">
          <dt className="sb-fact-label">{t('page.facts.sources')}</dt>
          <dd className="sb-fact-value">
            {page.sources.length === 0 ? (
              <span className="sb-fact-none">{t('page.facts.noSources')}</span>
            ) : (
              <span className="sb-reflist">
                {page.sources.map((slug) => (
                  <WikiRef
                    key={slug}
                    target={slug}
                    label={titleOf(pages, page.module, slug) ?? slug}
                    missing={titleOf(pages, page.module, slug) === null}
                    onOpen={onOpenTarget}
                  />
                ))}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Only the fallback: every way out of the editor resets the mutation,
          so nothing shows here in normal operation. An error with no place to
          go would be worse. */}
      {!editing && save.error !== null ? (
        <ErrorState error={save.error} variant="secondary" subject={page.path} scrollIntoView />
      ) : null}

      {editing ? (
        <PageEdit
          draft={draft}
          onDraft={setDraft}
          conflict={conflict}
          error={conflict ? null : save.error}
          changedOutside={changedOutside}
          docHash={doc.hash}
          busy={save.isPending}
          attemptedAt={save.submittedAt}
          subject={page.path}
          /* The frozen hash, not the current one: otherwise conflict
             protection would be off at exactly the moment it matters. */
          onSave={() => {
            if (base !== null) write(base.hash);
          }}
          onOverwrite={() => write(undefined)}
          onReload={() => {
            save.reset();
            stopEditing();
            onReload();
          }}
          onKeep={() => setAccepted(doc.hash)}
          onCancel={() => {
            save.reset();
            stopEditing();
          }}
        />
      ) : (
        <>
          {saved ? <p className="sb-note-line">{t('page.saved')}</p> : null}
          <PageBody
            body={doc.body}
            exists={(target) => titleOf(pages, page.module, target) !== null}
            onOpen={onOpenTarget}
          />
        </>
      )}

      <section className="sb-inbound">
        <h3 className="sb-inbound-title">{t('page.inbound')}</h3>
        {page.inbound.length === 0 ? (
          <p className="sb-panel-empty">{t('page.inbound.empty')}</p>
        ) : (
          <span className="sb-reflist">
            {page.inbound.map((id) => (
              <WikiRef
                key={id}
                target={id}
                label={titleOf(pages, page.module, id) ?? id}
                missing={titleOf(pages, page.module, id) === null}
                onOpen={onOpenTarget}
              />
            ))}
          </span>
        )}
      </section>
    </div>
  );
}
