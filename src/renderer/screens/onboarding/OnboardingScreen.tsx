/* Onboarding — what the user sees as long as no vault is open.

   Two separate paths, in reading order: at the top "open vault" as the one
   primary action, below it, set apart, "create new vault" — there, label
   first, then the name field, then a hint, then the button that uses the
   field. The field only appears once this path is chosen: someone who just
   wants to open a vault shouldn't have to wonder whether they need a name.

   The error appears directly below the action that triggered it, and offers
   the same action again.

   Above all of that sits the one choice this screen can make before a vault
   even exists: the language. Picking one sets `uiLanguage` *and* the seed
   for the vault-level document and conversation language
   (`AppSettings.newVaultLanguages`) — all three, since there's no vault yet
   to tell them apart. It writes through `settings:setApp` (the machine-bound
   app settings, not `settings:setLanguages` — that channel needs an open
   vault). The response is written straight into the settings query cache,
   the same way `LanguagesTab` does it; `App`'s own settings effect then
   calls `setLanguage()` from the cache, so this screen's own text switches
   immediately, without a reload.

   "Advanced" expands the same three settings `LanguagesTab` shows once a
   vault is open — document language, conversation language, and translating
   foreign-language sources — so someone who wants German documents but
   English chat doesn't have to wait until a vault exists to say so. Once a
   vault is created or opened for the first time, `SettingsService.openVault`
   reads this seed into the vault's own `languages`; after that the vault's
   file is the truth and this screen is gone anyway.

   Below the vault actions sits a calm, factual statement: no model is
   configured yet. That's not a guess — provider and routing configuration
   travels with the vault (`VaultSettings`), so before one is open there is
   architecturally nothing to configure. Neither the language buttons nor
   this statement carry the screen's one teal accent; that stays on "open a
   vault". */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, SettingsSnapshot, UiLanguage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Input } from '../../atoms/Input';
import { Select } from '../../atoms/Select';
import { Switch } from '../../atoms/Switch';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { decodeIpcError } from '../../lib/ipc-error';
import { qk } from '../../lib/queries/keys';
import { Field } from '../settings/SettingsFields';

/** Action group an attempt originated from. */
type Origin = 'open' | 'create' | 'recent';

/** Order of the two-way language choice above the header. */
const UI_LANGUAGES: readonly UiLanguage[] = ['de', 'en'];

export function OnboardingScreen() {
  const t = useT();
  const language = useLanguage();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  /* The response is the new settings state — straight into the cache, no
     refetch. `App`'s settings effect reads from the same cache entry and
     calls `setLanguage()`, which is what makes this screen's own texts
     switch without a restart. */
  const writeSettings = (snapshot: SettingsSnapshot): void => {
    client.setQueryData(qk.settings.snapshot(), snapshot);
  };
  const setUiLanguage = useMutation({
    /* The simple choice: one language for all three, since there's no vault
       yet to tell "interface", "documents" and "conversation" apart. */
    mutationFn: (code: UiLanguage) =>
      api.settings.setApp({
        uiLanguage: code,
        newVaultLanguages: { documents: code, conversation: code },
      }),
    onSuccess: writeSettings,
  });
  const setNewVaultLanguages = useMutation({
    mutationFn: (patch: Partial<AppSettings['newVaultLanguages']>) =>
      api.settings.setApp({ newVaultLanguages: patch }),
    onSuccess: writeSettings,
  });
  const [advanced, setAdvanced] = useState(false);
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

  const languageOptions = UI_LANGUAGES.map((code) => ({
    value: code,
    label: t(`settings.lang.${code}`),
  }));
  const newVaultLanguages = settings.data?.app.newVaultLanguages ?? {
    documents: 'de' as const,
    conversation: 'de' as const,
    translateSources: true,
  };

  return (
    <div className="sb-onboarding">
      <div className="sb-onboarding-card">
        <div className="sb-onboarding-lang">
          <span className="gs-overline sb-onboarding-lang-label">
            {t('onboarding.language.label')}
          </span>
          <span
            className="sb-onboarding-lang-seg"
            role="group"
            aria-label={t('onboarding.language.label')}
          >
            {UI_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                className={`sb-onboarding-langbtn ${
                  language === code ? 'sb-onboarding-langbtn--active' : ''
                }`.trim()}
                aria-pressed={language === code}
                onClick={() => setUiLanguage.mutate(code)}
              >
                {t(`onboarding.language.${code}`)}
              </button>
            ))}
          </span>
        </div>
        <div className="sb-onboarding-lang-foot">
          <span className="gs-hint">{t('onboarding.language.hint')}</span>
          <button
            type="button"
            className="sb-onboarding-lang-advtoggle"
            aria-expanded={advanced}
            onClick={() => setAdvanced((value) => !value)}
          >
            <Icon name={advanced ? 'chevron-down' : 'chevron-right'} size={13} />
            {t('onboarding.language.advanced')}
          </button>
        </div>

        {advanced ? (
          <div className="sb-onboarding-lang-adv">
            <Field example={t('settings.lang.documents.example')}>
              <Select
                label={t('settings.lang.documents.label')}
                hint={t('settings.lang.documents.hint')}
                options={languageOptions}
                value={newVaultLanguages.documents}
                onChange={(event) =>
                  setNewVaultLanguages.mutate({ documents: event.target.value as UiLanguage })
                }
              />
            </Field>
            <Field example={t('settings.lang.conversation.example')}>
              <Select
                label={t('settings.lang.conversation.label')}
                hint={t('settings.lang.conversation.hint')}
                options={languageOptions}
                value={newVaultLanguages.conversation}
                onChange={(event) =>
                  setNewVaultLanguages.mutate({ conversation: event.target.value as UiLanguage })
                }
              />
            </Field>
            <Switch
              label={t('settings.lang.translate.label')}
              description={t('settings.lang.translate.hint')}
              checked={newVaultLanguages.translateSources}
              onChange={(event) =>
                setNewVaultLanguages.mutate({ translateSources: event.target.checked })
              }
            />
          </div>
        ) : null}

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

        {/* Provider and routing configuration travels with the vault
            (`VaultSettings`), so before one is open there is no model to
            check for — this is a fact of the current state, not a guess. */}
        <p className="sb-llm-note sb-onboarding-nomodel">
          <Icon name="info" size={14} />
          <span>{t('onboarding.noModel.body')}</span>
        </p>
      </div>
    </div>
  );
}
