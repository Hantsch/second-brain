/* Tab „Verhalten": wie die App arbeitet, wenn niemand zusieht.

   Jede Änderung geht sofort über `settings:setVault` und wird dort geprüft und
   geklemmt — es gibt keinen „Speichern"-Knopf und damit auch keinen Zustand, in
   dem die Oberfläche etwas anderes zeigt als die Datei.

   **Jeder Schalter hier hat einen Leser, und der steht als Kommentar daneben.**
   Ein Schalter, der sich umlegen lässt und nichts bewegt, ist eine Behauptung —
   und die ist schlimmer als der fehlende Schalter. Deshalb gibt es hier keinen
   abgeschalteten Rahmen „kommt später" mehr: was niemand liest, ist aus den
   Einstellungen verschwunden, nicht stillgelegt.

   Ohne Vault gibt es keine Vault-Einstellungen: dann steht hier der Hinweis
   statt einer Reihe toter Schalter. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IpcRequest } from '@shared/ipc';
import type { CoachMode, SettingsSnapshot, VaultSettings } from '@shared/types';
import { Input } from '../../atoms/Input';
import { Radio } from '../../atoms/Radio';
import { Switch } from '../../atoms/Switch';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries/keys';
import { HotkeyRecorder } from './HotkeyRecorder';
import { NumberField } from './SettingsFields';

const COACH_MODES: readonly CoachMode[] = ['listen', 'tips', 'analyze'];

export function BehaviorTab() {
  const t = useT();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  const save = useMutation({
    mutationFn: (patch: IpcRequest<'settings:setVault'>['patch']) => api.settings.setVault(patch),
    onSuccess: (snapshot: SettingsSnapshot) =>
      client.setQueryData(qk.settings.snapshot(), snapshot),
  });

  if (settings.error) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  if (!settings.data) {
    return (
      <Panel title={t('settings.behavior.capture')}>
        <Skeleton lines={5} height={40} />
      </Panel>
    );
  }

  const vault: VaultSettings | null = settings.data.vault;
  if (!vault) {
    return (
      <EmptyState
        icon="database"
        title={t('vault.none')}
        body={t('settings.vault.about')}
        action={{
          label: t('settings.vaultOpen'),
          icon: 'folder-open',
          onClick: () => void api.vault.choose().catch(() => undefined),
        }}
      />
    );
  }

  const { capture, overview, journal, gardener } = vault;
  const patch = (value: IpcRequest<'settings:setVault'>['patch']): void => save.mutate(value);

  return (
    <>
      <Panel title={t('settings.behavior.capture')}>
        <div className="sb-setting-block">
          <div className="sb-setting">
            <span className="gs-label">{t('settings.behavior.hotkey.label')}</span>
            <HotkeyRecorder
              value={capture.quickCaptureShortcut}
              onCommit={(accelerator) => patch({ capture: { quickCaptureShortcut: accelerator } })}
            />
            <span className="gs-hint">{t('settings.behavior.hotkey.hint')}</span>
          </div>

          {/* Gelesen in `main/ipc/capture.ts` (`autoClassify`) nach `capture:dump`. */}
          <Switch
            label={t('settings.behavior.autoClassify.label')}
            description={t('settings.behavior.autoClassify.hint')}
            checked={capture.autoClassify}
            onChange={(event) => patch({ capture: { autoClassify: event.target.checked } })}
          />

          {/* Gelesen im Schnell-Erfassen-Fenster (`QuickCapture.save`). */}
          <Switch
            label={t('settings.behavior.closeAfter.label')}
            description={t('settings.behavior.closeAfter.hint')}
            checked={capture.closeAfterCapture}
            onChange={(event) => patch({ capture: { closeAfterCapture: event.target.checked } })}
          />
        </div>
      </Panel>

      <Panel title={t('settings.behavior.overview')}>
        <div className="sb-setting-block">
          {/* Gelesen in `core/index/projects` (stagnierende Projekte) und in
              `core/gardener/checks/unfiled-dump` als Frist des liegengebliebenen
              Dumps — eine zweite Zahl für dieselbe Frage wäre eine Ausrede. */}
          <NumberField
            label={t('settings.behavior.stale.label')}
            hint={t('settings.behavior.stale.hint')}
            suffix={t('settings.behavior.days')}
            value={overview.staleAfterDays}
            min={1}
            max={365}
            onCommit={(value) => patch({ overview: { staleAfterDays: value } })}
          />

          {/* Gelesen in `core/overview/reminders` über `dashboard:data` und
              `reminders:list`; die Benachrichtigung wertet denselben Schalter aus
              (`main/reminder-notify.ts`). */}
          <NumberField
            label={t('settings.behavior.deadline.label')}
            hint={t('settings.behavior.deadline.hint')}
            suffix={t('settings.behavior.days')}
            value={overview.deadlineHorizonDays}
            min={1}
            max={365}
            onCommit={(value) => patch({ overview: { deadlineHorizonDays: value } })}
          />
          {/* Gelesen in `core/overview/reminders` (`fromWaiting`). */}
          <NumberField
            label={t('settings.behavior.waiting.label')}
            hint={t('settings.behavior.waiting.hint')}
            suffix={t('settings.behavior.days')}
            value={overview.waitingNudgeDays}
            min={1}
            max={365}
            onCommit={(value) => patch({ overview: { waitingNudgeDays: value } })}
          />

          {/* Gelesen in `main/reminder-notify.ts` (`why()` gibt sonst 'off'). */}
          <Switch
            label={t('settings.behavior.notifications.label')}
            description={t('settings.behavior.notifications.hint')}
            checked={overview.notifications}
            onChange={(event) => patch({ overview: { notifications: event.target.checked } })}
          />

          {/* Gelesen in `main/ipc/overview-deps.ts`: der Schalter entscheidet, ob
              `~/.claude/projects` überhaupt gelesen wird, das Feld sagt wo. */}
          <Switch
            label={t('settings.behavior.claude.label')}
            description={t('settings.behavior.claude.hint')}
            checked={overview.useClaudeSessions}
            onChange={(event) => patch({ overview: { useClaudeSessions: event.target.checked } })}
          />
          <Input
            label={t('settings.behavior.claude.dir.label')}
            hint={t('settings.behavior.claude.dir.hint')}
            defaultValue={overview.claudeProjectsDir}
            onBlur={(event) => {
              const next = event.target.value.trim();
              if (next !== overview.claudeProjectsDir) {
                patch({ overview: { claudeProjectsDir: next } });
              }
            }}
          />
        </div>
      </Panel>

      <Panel title={t('settings.behavior.journal')}>
        <div className="sb-setting-block">
          {/* Gelesen in `screens/journal/JournalScreen` über `useJournalSettings`:
              `stance = mode ?? settings.mode` — die Haltung, mit der das Segment
              startet und mit der eine Runde losgeht, wenn niemand umschaltet. */}
          <fieldset className="sb-setting-block sb-fieldset">
            <legend className="gs-label">{t('settings.behavior.coach.label')}</legend>
            {COACH_MODES.map((mode) => (
              <Radio
                key={mode}
                name="sb-coach-mode"
                label={t(`settings.behavior.coach.${mode}`)}
                description={t(`settings.behavior.coach.${mode}.hint`)}
                checked={journal.mode === mode}
                onChange={() => patch({ journal: { mode } })}
              />
            ))}
          </fieldset>
          <span className="gs-hint">{t('settings.behavior.coach.where')}</span>
        </div>
      </Panel>

      <Panel title={t('settings.behavior.gardener')}>
        <div className="sb-setting-block">
          {/* Gelesen in `main/gardener-autorun.ts` beim Öffnen des Vaults. */}
          <Switch
            label={t('settings.behavior.runOnOpen.label')}
            description={t('settings.behavior.runOnOpen.hint')}
            checked={gardener.runOnOpen}
            onChange={(event) => patch({ gardener: { runOnOpen: event.target.checked } })}
          />

          {/* Gelesen in `core/gardener/checks/stale-page.ts` über
              `GardenerContext.limits.reviewAfterDays`. */}
          <NumberField
            label={t('settings.behavior.review.label')}
            hint={t('settings.behavior.review.hint')}
            suffix={t('settings.behavior.days')}
            value={gardener.reviewAfterDays}
            min={7}
            max={3650}
            onCommit={(value) => patch({ gardener: { reviewAfterDays: value } })}
          />

          {/* Gelesen in `main/ipc/gardener-deps.ts` (`runWithProgress`) und dort
              zusätzlich gegen `gateway.isAvailable('gardener-audit')` gehalten:
              ohne Route wird die Deutung nicht einmal angekündigt. */}
          <Switch
            label={t('settings.behavior.gardenerLlm.label')}
            description={t('settings.behavior.gardenerLlm.hint')}
            checked={gardener.useLlm}
            onChange={(event) => patch({ gardener: { useLlm: event.target.checked } })}
          />
        </div>
      </Panel>
    </>
  );
}
