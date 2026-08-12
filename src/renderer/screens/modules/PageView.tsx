/* Eine Wiki-Seite: die Fakten aus dem Frontmatter, der Text, wer hierher
   verlinkt — und der Weg, sie zu ändern.

   Der Konfliktschutz ist der Kern dieser Datei, und er hängt an einem Detail:
   **der Hash wird beim Öffnen des Editors eingefroren, nicht beim Klick auf
   Speichern gelesen.** Der Watcher erneuert die Doc-Abfrage, sobald jemand
   außerhalb schreibt; würde erst beim Speichern `doc.hash` gelesen, ginge der
   alte Text mit dem neuen Hash raus — und der Hauptprozess nähme ihn an. Genau
   das ist der stille Verlust, den CLAUDE.md ausschließt.

   Deshalb steht in `base` die Fassung, auf der der Entwurf beruht. Läuft
   währenddessen eine fremde Änderung ein (`doc.hash !== base.hash`), sagt das
   eine Leiste am Feld, mit zwei Wegen: neu laden oder die eigene Fassung
   behalten. Wer behält, bekommt beim Speichern `conflict` — und dort erst den
   ausdrücklichen Weg zum Überschreiben. Der Entwurf bleibt stehen, bis der
   Nutzer entscheidet.

   Das Feld samt Meldungen liegt in `PageEdit.tsx`; hier steht, was daraus folgt:
   welcher Hash mitgeht und wann der Editor zugeht. */

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
import { WikiRef } from './WikiRef';

export interface PageViewProps {
  page: WikiPage;
  doc: VaultDoc;
  /** Alle Seiten des Moduls — daraus wird jeder Verweis aufgelöst. */
  pages: readonly WikiPage[];
  /** Ein Wikilink oder Beleg wurde geklickt (`slug` oder `modul/slug`). */
  onOpenTarget: (target: string) => void;
  /** Der Nutzer will den fremden Stand sehen. */
  onReload: () => void;
}

/** Frontmatter-Feld als Text, sonst null. */
function field(doc: VaultDoc, name: string): string | null {
  const value = doc.frontmatter[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Titel einer Seite im selben Modul; `null`, wenn es sie nicht gibt. */
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
  /** Die Fassung, auf der der Entwurf beruht — eingefroren beim Öffnen. */
  const [base, setBase] = useState<{ body: string; hash: string } | null>(null);
  /** Fremde Fassung, deren Meldung der Nutzer weggeklickt hat. */
  const [accepted, setAccepted] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const conflict = save.error !== null && decodeIpcError(save.error).code === 'conflict';
  const editing = draft !== null;
  /* Außerhalb geschrieben, während der Editor offen ist. */
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
          {/* Im Bearbeiten gehört das Teal dem Speichern — ein Fokuspunkt. */}
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
              /* Text und Hash zusammen — sie gehören zur selben Fassung. */
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

      {/* Nur der Rückfall: jeder Weg aus dem Editor setzt die Mutation zurück,
          also steht hier im Betrieb nichts. Ein Fehler ohne Ort wäre schlimmer. */}
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
          /* Der eingefrorene Hash, nicht der aktuelle: sonst wäre der
             Konfliktschutz genau in dem Moment aus, in dem er zählt. */
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
