/* Tab „Sprachen": drei Einstellungen, die nichts miteinander zu tun haben
   müssen — Oberfläche, Dokumentsprache, Gesprächssprache. Jede mit einem Satz,
   was sie tut, und einem Beispiel, damit die Unterscheidung greifbar wird.

   Die Oberflächensprache wirkt sofort: die Antwort des Kanals ist der neue
   Einstellungsstand, und `App.tsx` hängt die Sprache daran. Kein Neustart. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsSnapshot, UiLanguage } from '@shared/types';
import type { IpcRequest } from '@shared/ipc';
import { Select } from '../../atoms/Select';
import { Switch } from '../../atoms/Switch';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries/keys';
import { Field } from './SettingsFields';
import { SectionMigrationCard } from './SectionMigrationCard';

const LANGUAGES: readonly UiLanguage[] = ['de', 'en'];

export function LanguagesTab() {
  const t = useT();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });

  /* Die Antwort ist der neue Stand — direkt in den Cache, ohne Nachfrage. */
  const write = (snapshot: SettingsSnapshot): void => {
    client.setQueryData(qk.settings.snapshot(), snapshot);
  };

  const setLanguages = useMutation({ mutationFn: api.settings.setLanguages, onSuccess: write });
  const setVault = useMutation({
    mutationFn: (patch: IpcRequest<'settings:setVault'>['patch']) => api.settings.setVault(patch),
    onSuccess: write,
  });

  if (settings.error) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  if (!settings.data) {
    return (
      <Panel title={t('settings.lang.title')}>
        <Skeleton lines={4} height={40} />
      </Panel>
    );
  }

  const languages = settings.data.vault?.languages ?? {
    ui: settings.data.app.uiLanguage,
    documents: 'de' as const,
    conversation: settings.data.app.uiLanguage,
    translateSources: true,
  };
  const options = LANGUAGES.map((code) => ({ value: code, label: t(`settings.lang.${code}`) }));

  return (
    <Panel title={t('settings.lang.title')} note={t('settings.lang.note')}>
      <div className="sb-setting-block">
        <Field example={t('settings.lang.ui.example')}>
          <Select
            label={t('settings.lang.ui.label')}
            hint={t('settings.lang.ui.hint')}
            options={options}
            value={languages.ui}
            onChange={(event) => setLanguages.mutate({ ui: event.target.value as UiLanguage })}
          />
        </Field>

        <Field example={t('settings.lang.documents.example')}>
          <Select
            label={t('settings.lang.documents.label')}
            hint={t('settings.lang.documents.hint')}
            options={options}
            value={languages.documents}
            onChange={(event) =>
              setLanguages.mutate({ documents: event.target.value as UiLanguage })
            }
          />
        </Field>

        {settings.data.vault ? <SectionMigrationCard to={languages.documents} /> : null}

        <Field example={t('settings.lang.conversation.example')}>
          <Select
            label={t('settings.lang.conversation.label')}
            hint={t('settings.lang.conversation.hint')}
            options={options}
            value={languages.conversation}
            onChange={(event) =>
              setLanguages.mutate({ conversation: event.target.value as UiLanguage })
            }
          />
        </Field>

        {/* Gelesen in `main/ipc/wiki-bridge.ts` (`wikiDeps.translateSources`) und
            von dort in `core/wiki/summarize` → `summarizeSourcePrompt`: aus bleibt
            die Verdichtung in der Sprache der Quelle. */}
        <Switch
          label={t('settings.lang.translate.label')}
          description={t('settings.lang.translate.hint')}
          checked={languages.translateSources}
          disabled={settings.data.vault === null}
          onChange={(event) =>
            setVault.mutate({ languages: { translateSources: event.target.checked } })
          }
        />
      </div>
    </Panel>
  );
}
