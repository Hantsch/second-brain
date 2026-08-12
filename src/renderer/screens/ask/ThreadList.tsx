/* Die Gespräche: Titel, Datum, Suche.

   Höchstens die letzten fünfzig stehen hier — ein Verlauf, der alles behält, ist
   ein Sammelsurium, in dem niemand etwas findet. Ältere sind über die Suche
   erreichbar: sie läuft im Hauptprozess über Titel *und* Nachrichten.

   Gelöscht wird nur nach Rückfrage — sie steht hier, weil der Knopf hier steht.
   Der Verlauf wandert dabei in den Papierkorb des Vaults; abgelegte Wiki-Seiten
   bleiben, wo sie sind. Genau das sagt die Rückfrage. */

import { useState } from 'react';
import type { ChatThread } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Icon } from '../../atoms/Icon';
import { IconButton } from '../../atoms/IconButton';
import { Skeleton } from '../../components/Skeleton';
import { useLanguage, useT } from '../../i18n';
import { formatAge } from '../../lib/format';

export interface ThreadListProps {
  threads: readonly ChatThread[];
  activeId: string | null;
  /** Suchbegriff im Verlauf. */
  query: string;
  onQuery: (query: string) => void;
  onSelect: (id: string) => void;
  /** Löschen — wird erst gerufen, wenn der Nutzer die Rückfrage bestätigt hat. */
  onDelete: (id: string) => void;
  /** Lädt die Liste noch? */
  pending?: boolean;
}

export function ThreadList({
  threads,
  activeId,
  query,
  onQuery,
  onSelect,
  onDelete,
  pending = false,
}: ThreadListProps) {
  const t = useT();
  const language = useLanguage();
  const [confirm, setConfirm] = useState<ChatThread | null>(null);

  return (
    <div className="sb-threads">
      <div className="gs-inputwrap">
        <span className="gs-input-icon">
          <Icon name="search" size={15} />
        </span>
        <input
          className="gs-input gs-input--withicon sb-threads-search"
          type="text"
          aria-label={t('ask.threads.search')}
          placeholder={t('ask.threads.search')}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>

      {pending && threads.length === 0 ? (
        <Skeleton lines={4} height={36} />
      ) : threads.length === 0 ? (
        <p className="sb-threads-empty">
          {query.trim().length === 0 ? t('ask.threads.empty') : t('ask.threads.noMatch')}
        </p>
      ) : (
        <ul className="sb-threadlist" aria-label={t('ask.threads.title')}>
          {threads.map((thread) => (
            <li key={thread.id} className="sb-threadrow">
              <button
                type="button"
                className={`sb-threaditem ${thread.id === activeId ? 'sb-threaditem--active' : ''}`.trim()}
                /* Der Titel benennt den Knopf; das Datum daneben ist Beiwerk. */
                aria-label={t('ask.threads.open', { title: thread.title })}
                aria-current={thread.id === activeId ? 'true' : undefined}
                onClick={() => onSelect(thread.id)}
              >
                <span className="sb-threaditem-title">{thread.title}</span>
                <span className="sb-mono sb-threaditem-date">
                  {formatAge(thread.updated, language)}
                </span>
              </button>
              <IconButton
                icon="trash-2"
                size="sm"
                label={t('ask.threads.delete', { title: thread.title })}
                onClick={() => setConfirm(thread)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title={t('ask.threads.deleteTitle')}
        description={t('ask.threads.deleteBody')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              icon="trash-2"
              onClick={() => {
                const target = confirm;
                setConfirm(null);
                if (target !== null) onDelete(target.id);
              }}
            >
              {t('ask.threads.deleteConfirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
