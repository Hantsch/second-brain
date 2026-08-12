/* Onboarding — was der Nutzer sieht, solange kein Vault offen ist.

   Zwei getrennte Wege, in Lesereihenfolge: oben „Vault öffnen" als die eine
   primäre Aktion, darunter abgesetzt „Neuen Vault anlegen" — dort erst Label,
   dann Namensfeld, dann Hinweis, dann der Knopf, der das Feld benutzt. Das Feld
   erscheint erst, wenn dieser Weg gewählt ist: wer nur öffnen will, soll nicht
   rätseln, ob er einen Namen braucht.

   Der Fehler steht unmittelbar unter der Aktion, die ihn ausgelöst hat, und
   bietet dieselbe Aktion noch einmal an. */

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

/** Aktionsgruppe, aus der ein Versuch kam. */
type Origin = 'open' | 'create' | 'recent';

export function OnboardingScreen() {
  const t = useT();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  /* Der letzte Versuch, damit „Erneut versuchen" wirklich dasselbe tut, und die
     Gruppe, aus der er kam — die Fehlerkarte gehört unter genau diese Gruppe. */
  const [attempt, setAttempt] = useState<{
    origin: Origin;
    run: () => Promise<unknown>;
    /** Der Gegenstand des Versuchs, wenn er bekannt ist — steht in der Meldung. */
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
      /* Ein abgebrochener Ordner-Dialog ist kein Fehler. */
      if (decodeIpcError(caught).code !== 'cancelled') setError(caught);
    } finally {
      setBusy(false);
    }
  };

  /* Der Fehler erscheint genau unter der Gruppe, die ihn ausgelöst hat — und
     nennt den Ordner, um den es ging. „Erneut versuchen" bleibt sekundär: das
     eine Teal dieses Screens gehört „Vault öffnen". */
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
