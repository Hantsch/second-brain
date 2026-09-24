/* The frontmatter of any vault document, readable — never a raw YAML dump
   (story 059, D4; AC2). Mirrors `PageView.tsx`'s facts row, generalised past
   the wiki's own four known fields: date, status, scope, module and tags
   round the wiki's type/created/updated/sources out to the shape every other
   document kind actually carries (`docs/VAULT-FORMAT.md`).

   Everything the fixed row doesn't name still has to be visible somewhere —
   "unknown frontmatter fields are preserved" (CLAUDE.md) means a user's own
   field never disappears just because this screen doesn't know its name. The
   collapsed "all fields" disclosure is that somewhere, as a key/value list,
   never as text a user would have to parse like a file. */

import type { DocType, Scope, VaultDoc } from '@shared/types';
import { Tag } from '../../atoms/Tag';
import { WikiRef } from '../../components/WikiRef';
import { useT } from '../../i18n';
import { useOpenDoc } from '../../lib/use-open-doc';
import { api } from '../../lib/api';

/** Frontmatter fields already shown by their own row, or by the screen's
    header (`title`) — excluded from the "all fields" leftover list below. */
const KNOWN_KEYS: readonly string[] = [
  'title',
  'type',
  'created',
  'updated',
  'date',
  'status',
  'scope',
  'module',
  'tags',
  'sources',
];

/** Translation key for a document type — `source`/`entity`/`concept`/
    `overview` reuse the wiki's own `modules.type.*` labels (Karpathy: reuse
    over a second copy of the same four words); the other six get their own
    `reader.type.*` key. A `Record<DocType, string>` so a future `DocType`
    addition fails typecheck here instead of silently falling back to the key
    itself at runtime. */
export const TYPE_LABEL_KEY: Record<DocType, string> = {
  dump: 'reader.type.dump',
  note: 'reader.type.note',
  project: 'reader.type.project',
  area: 'reader.type.area',
  condensed: 'reader.type.condensed',
  journal: 'reader.type.journal',
  source: 'modules.type.source',
  entity: 'modules.type.entity',
  concept: 'modules.type.concept',
  overview: 'modules.type.overview',
};

function isScope(value: unknown): value is Scope {
  return value === 'work' || value === 'private';
}

/** Frontmatter field as trimmed text, or `null` if absent/blank. */
function stringField(doc: VaultDoc, name: string): string | null {
  const value = doc.frontmatter[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Frontmatter field as a list of strings, `[]` if absent or not a list of strings. */
function stringListField(doc: VaultDoc, name: string): string[] {
  const value = doc.frontmatter[name];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** A date-or-timestamp field, shown as just the date — same trim `PageView` uses. */
function dateField(doc: VaultDoc, name: string): string | null {
  const value = stringField(doc, name);
  return value === null ? null : value.slice(0, 10);
}

/** `[a-z][a-z0-9+.-]*:` — the same external-URL test `markdown-render.tsx` uses. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

interface SourceRefProps {
  source: string;
}

/** One `sources` entry: an external URL opens via `shell.openExternal`, a
    vault path opens in-app via `useOpenDoc` — the two cases the deliverable
    names. An agent-session citation (`agent:<kind>/<key>`,
    `docs/VAULT-FORMAT.md`) is neither, and stays plain text: resolving it
    into a session view is not part of this reader. */
function SourceRef({ source }: SourceRefProps) {
  const openDoc = useOpenDoc();
  if (source.startsWith('agent:')) return <span className="sb-fact-value">{source}</span>;
  if (URL_SCHEME.test(source)) {
    return (
      <button
        type="button"
        className="sb-wikilink"
        onClick={() => void api.shell.openExternal(source).catch(() => undefined)}
      >
        {source}
      </button>
    );
  }
  return <WikiRef target={source} label={source} onOpen={openDoc} />;
}

/** One leftover frontmatter value, rendered as text — never as a link, never
    as the field's own row: this is the fallback for whatever the fixed row
    above doesn't know how to show. */
function leftoverValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(leftoverValue).join(', ');
  return JSON.stringify(value);
}

export interface ReaderFactsProps {
  doc: VaultDoc;
}

export function ReaderFacts({ doc }: ReaderFactsProps) {
  const t = useT();
  const scope = doc.frontmatter.scope;
  const tags = stringListField(doc, 'tags');
  const sources = stringListField(doc, 'sources');
  const status = stringField(doc, 'status');
  const moduleName = stringField(doc, 'module');
  const date = dateField(doc, 'date');
  const created = dateField(doc, 'created');
  const updated = dateField(doc, 'updated');

  const leftovers = Object.entries(doc.frontmatter).filter(
    ([key, value]) => !KNOWN_KEYS.includes(key) && value !== undefined,
  );

  return (
    <>
      <dl className="sb-facts">
        <div className="sb-fact">
          <dt className="sb-fact-label">{t('page.facts.type')}</dt>
          <dd className="sb-fact-value sb-mono">{t(TYPE_LABEL_KEY[doc.frontmatter.type])}</dd>
        </div>
        {date === null ? null : (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('reader.facts.date')}</dt>
            <dd className="sb-fact-value sb-mono">{date}</dd>
          </div>
        )}
        {created === null ? null : (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('page.facts.created')}</dt>
            <dd className="sb-fact-value sb-mono">{created}</dd>
          </div>
        )}
        {updated === null ? null : (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('page.facts.updated')}</dt>
            <dd className="sb-fact-value sb-mono">{updated}</dd>
          </div>
        )}
        {status === null ? null : (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('reader.facts.status')}</dt>
            <dd className="sb-fact-value sb-mono">{status}</dd>
          </div>
        )}
        {isScope(scope) ? (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('reader.facts.scope')}</dt>
            <dd className="sb-fact-value">{t(`scope.${scope}`)}</dd>
          </div>
        ) : null}
        {moduleName === null ? null : (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('reader.facts.module')}</dt>
            <dd className="sb-fact-value sb-mono">{moduleName}</dd>
          </div>
        )}
        {tags.length === 0 ? null : (
          <div className="sb-fact">
            <dt className="sb-fact-label">{t('reader.facts.tags')}</dt>
            <dd className="sb-fact-value">
              <span className="sb-reflist">
                {tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </span>
            </dd>
          </div>
        )}
        {sources.length === 0 ? null : (
          <div className="sb-fact sb-fact--wide">
            <dt className="sb-fact-label">{t('page.facts.sources')}</dt>
            <dd className="sb-fact-value">
              <span className="sb-reflist">
                {sources.map((source) => (
                  <SourceRef key={source} source={source} />
                ))}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {leftovers.length === 0 ? null : (
        <details className="sb-reader-allfields">
          <summary>{t('reader.allFields')}</summary>
          <dl className="sb-facts">
            {leftovers.map(([key, value]) => (
              <div className="sb-fact" key={key}>
                <dt className="sb-fact-label sb-mono">{key}</dt>
                <dd className="sb-fact-value">{leftoverValue(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}
