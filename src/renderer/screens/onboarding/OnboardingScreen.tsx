/* Onboarding — what the user sees as long as no vault is open.

   Two separate paths, in reading order: at the top "open vault" as the one
   primary action, below it, set apart, "create new vault" — there, label
   first, then the name field, then a hint, then the button that uses the
   field. The field only appears once this path is chosen: someone who just
   wants to open a vault shouldn't have to wonder whether they need a name.

   The error appears directly below the action that triggered it, and offers
   the same action again. */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Input } from '../../atoms/Input';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { decodeIpcError } from '../../lib/ipc-error';
import { qk } from '../../lib/queries/keys';

/** Action group an attempt originated from. */
type Origin = 'open' | 'create' | 'recent';

export function OnboardingScreen() {
  const t = useT();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  /* The last attempt, so "retry" really does the same thing again, and the
     group it came from — the error card belongs exactly under that group. */
  const [attempt, setAttempt] = useState<{
    origin: Origin;
    run: () => Promise<unknown>;
    /** The subject of the attempt, if known — appears in the message. */
    subject?: string;
  } | null>(null);
  const { data: recent } = useQuery({ queryKey: qk.vault.recent(), queryFn: api.vault.recent });

  const run = async (
    origin: Origin,
    action: () => Promise<unknown>,
    subject?: string,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    setAttempt({ origin, run: action, ...(subject === undefined ? {} : { subject }) });
    try {
      await action();
      await client.invalidateQueries({ queryKey: qk.vault.status() });
    } catch (caught) {
      /* A cancelled folder dialog is not an error. */
      if (decodeIpcError(caught).code !== 'cancelled') setError(caught);
    } finally {
      setBusy(false);
    }
  };

  /* The error appears exactly below the group that triggered it — and names
     the folder in question. "Retry" stays secondary: this screen's one teal
     belongs to "open vault". */
  const failureAt = (origin: Origin) =>
    error === null || attempt?.origin !== origin ? null : (
      <ErrorState
        error={error}
        scrollIntoView
        variant="secondary"
        {...(attempt.subject === undefined ? {} : { subject: attempt.subject })}
        onRetry={() => void run(origin, attempt.run, attempt.subject)}
      />
    );

  return (
    <div className="sb-onboarding">
      <div className="sb-onboarding-card">
        <ScreenHeader overline={t('onboarding.overline')} title={t('onboarding.title')} />
        <Card>
          <h2 className="sb-empty-title sb-onboarding-what">{t('onboarding.what.title')}</h2>
          <p className="sb-empty-body">{t('onboarding.what.body')}</p>
        </Card>

        <div className="sb-onboarding-open">
          <Button
            icon="folder-open"
            loading={busy}
            onClick={() => void run('open', () => api.vault.choose())}
          >
            {t('onboarding.open')}
          </Button>
          <span className="gs-hint">{t('onboarding.openHint')}</span>
        </div>

        {failureAt('open')}

        <div className="sb-onboarding-create">
          <span className="gs-overline">{t('onboarding.createSection')}</span>
          {creating ? (
            <>
              <Input
                label={t('onboarding.nameLabel')}
                placeholder={t('onboarding.namePlaceholder')}
                hint={t('onboarding.nameHint')}
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
              <div className="sb-onboarding-createrow">
                <Button
                  variant="secondary"
                  icon="folder-plus"
                  loading={busy}
                  disabled={name.trim().length === 0}
                  onClick={() => void run('create', () => api.vault.create('', name.trim()))}
                >
                  {t('onboarding.create')}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  {t('onboarding.createCancel')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="secondary" icon="folder-plus" onClick={() => setCreating(true)}>
              {t('onboarding.createStart')}
            </Button>
          )}
        </div>

        {failureAt('create')}

        {recent && recent.length > 0 ? (
          <div className="sb-recent">
            <span className="gs-overline">{t('onboarding.recent')}</span>
            {recent.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="sb-recent-item"
                disabled={!entry.exists || busy}
                onClick={() =>
                  void run('recent', () => api.vault.open(entry.path), entry.name || entry.path)
                }
              >
                <Icon name="folder" size={13} />
                <span>{entry.path}</span>
                {entry.exists ? null : <span>({t('onboarding.missing')})</span>}
              </button>
            ))}
          </div>
        ) : null}

        {failureAt('recent')}
      </div>
    </div>
  );
}
