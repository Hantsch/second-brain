/* "Models" tab: providers on top, task routing below.

   The tab has to look fully meaningful with zero providers configured — that's
   the state the user sees first. So the entry card sits at the very top in
   that case: three paths, this machine's detection results, and the
   instructions. The routing table stays visible next to it; it shows which
   model each task would get, once one is assigned.

   A provider alone doesn't make the app any smarter: without routing, every
   task stays without a model and the inbox keeps saying "needs a model". So as
   soon as a connection is set up and responds, the tab fetches a routing
   proposal on its own and shows it as before/after. It's confirmed by hand —
   guardrail 2. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProviderConfig } from '@shared/types';
import { Button } from '../../atoms/Button';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { ProviderCard } from '../../components/ProviderCard';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import {
  resolveRoute,
  useLocalRuntimes,
  usePresets,
  useProviderMutations,
  useProviders,
  useRouting,
  useTasks,
  type LocalRuntime,
} from '../../lib/queries/llm';
import { LocalRuntimeCard } from './LocalRuntimeCard';
import { MachineCard } from './machine/MachineCard';
import { ProviderDialog } from './ProviderDialog';
import { RecommendationSection } from './RecommendationSection';
import { RoutingSection } from './RoutingSection';
import { StartCard } from './StartCard';

interface Note {
  text: string;
  tone: 'ok' | 'error';
}

export function ModelsTab() {
  const t = useT();
  const navigate = useNavigate();
  const providers = useProviders();
  const presets = usePresets();
  const tasks = useTasks();
  const routing = useRouting();
  const mutations = useProviderMutations();

  const empty = providers.data !== undefined && providers.data.length === 0;
  const runtimes = useLocalRuntimes(empty);

  const [dialog, setDialog] = useState<{ provider: ProviderConfig | null } | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Every counter bump means: a connection responded, fetch a routing proposal. */
  const [proposeSignal, setProposeSignal] = useState(0);

  const askForRouting = (provider: ProviderConfig): void => {
    if (provider.models.length > 0) setProposeSignal((count) => count + 1);
  };

  /* How many tasks already have a model — same resolution chain as in the gateway. */
  const routedCount =
    tasks.data === undefined || routing.data === undefined
      ? null
      : tasks.data.filter(
          (task) => resolveRoute(routing.data, tasks.data ?? [], task.kind) !== null,
        ).length;
  const hasModels = (providers.data ?? []).some((provider) => provider.models.length > 0);
  /* The tab's focus point is on routing, as long as no task has one yet. */
  const needsRouting = hasModels && routedCount === 0;

  const note = (id: string, value: Note | null): void =>
    setNotes((current) => {
      const next = { ...current };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });

  const failureText = (failure: unknown): string => t(`error.code.${decodeIpcError(failure).code}`);

  const probe = (provider: ProviderConfig): void => {
    setBusyId(provider.id);
    note(provider.id, null);
    mutations.probe.mutate(provider.id, {
      onSuccess: askForRouting,
      onError: (failure) => note(provider.id, { text: failureText(failure), tone: 'error' }),
      onSettled: () => setBusyId(null),
    });
  };

  const loadModels = (provider: ProviderConfig): void => {
    setBusyId(provider.id);
    note(provider.id, null);
    mutations.models.mutate(provider.id, {
      onSuccess: (models) => {
        if (models.length > 0) setProposeSignal((count) => count + 1);
        note(provider.id, {
          text: t('provider.modelsLoaded', { count: models.length }),
          tone: 'ok',
        });
      },
      onError: (failure) => note(provider.id, { text: failureText(failure), tone: 'error' }),
      onSettled: () => setBusyId(null),
    });
  };

  /**
   * Adopt a detected local runtime: create it, test it — and right after that,
   * fetch the routing proposal. "Adopt" without this step would end in a
   * half-finished state: provider green, no task routed.
   */
  const adopt = (runtime: LocalRuntime): void => {
    mutations.add.mutate(
      {
        label: runtime.label,
        kind: 'openai-compatible',
        baseUrl: runtime.baseUrl,
        local: true,
      },
      {
        onSuccess: (provider) => mutations.probe.mutate(provider.id, { onSuccess: askForRouting }),
      },
    );
  };

  if (providers.error) {
    return <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />;
  }

  return (
    <>
      {empty ? (
        <StartCard
          runtimes={runtimes.data}
          checking={runtimes.isFetching}
          failed={runtimes.isError}
          adopting={mutations.add.isPending || mutations.probe.isPending}
          onRecheck={() => void runtimes.refetch()}
          onAdopt={adopt}
          onAddProvider={() => setDialog({ provider: null })}
          onSkip={() => void navigate('/dashboard')}
        />
      ) : null}

      <MachineCard />

      <LocalRuntimeCard />

      <Panel
        title={t('settings.providers.title')}
        meta={
          providers.data && providers.data.length > 0
            ? plural(
                providers.data.length,
                'settings.providers.countOne',
                'settings.providers.count',
              )
            : undefined
        }
        action={
          empty ? undefined : (
            /* Secondary as long as no task has a model: in that case the teal
               belongs to routing, not to adding the next provider. */
            <Button
              variant={needsRouting ? 'secondary' : 'primary'}
              size="sm"
              icon="plus"
              onClick={() => setDialog({ provider: null })}
            >
              {t('settings.providers.add')}
            </Button>
          )
        }
        note={t('settings.providers.note')}
      >
        {providers.data === undefined ? (
          <Skeleton lines={2} height={72} />
        ) : providers.data.length === 0 ? (
          <p className="sb-panel-empty">{t('settings.providers.empty')}</p>
        ) : (
          <div className="sb-provider-grid">
            {providers.data.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                busy={busyId === provider.id}
                note={notes[provider.id]?.text ?? null}
                noteTone={notes[provider.id]?.tone ?? 'ok'}
                onProbe={() => probe(provider)}
                onLoadModels={() => loadModels(provider)}
                onEdit={() => setDialog({ provider })}
                onRemove={() => mutations.remove.mutate(provider.id)}
              />
            ))}
          </div>
        )}
      </Panel>

      {tasks.data && routing.data ? (
        <RoutingSection
          tasks={tasks.data}
          routing={routing.data}
          providers={providers.data ?? []}
          proposeSignal={proposeSignal}
        />
      ) : (
        <Panel title={t('settings.routing.title')}>
          <Skeleton lines={6} height={40} />
        </Panel>
      )}

      {tasks.data ? (
        <RecommendationSection tasks={tasks.data} providers={providers.data ?? []} />
      ) : (
        <Panel title={t('settings.recommend.title')}>
          <Skeleton lines={4} height={40} />
        </Panel>
      )}

      {dialog ? (
        <ProviderDialog
          presets={presets.data ?? []}
          provider={dialog.provider}
          onClose={() => setDialog(null)}
          submit={async (input) => {
            const existing = dialog.provider;
            if (!existing) return mutations.add.mutateAsync(input);
            return mutations.update.mutateAsync({
              id: existing.id,
              patch: {
                label: input.label,
                kind: input.kind,
                baseUrl: input.baseUrl,
                local: input.local,
              },
              ...(input.apiKey ? { apiKey: input.apiKey } : {}),
            });
          }}
          probe={async (id) => {
            const probed = await mutations.probe.mutateAsync(id);
            askForRouting(probed);
            return probed;
          }}
        />
      ) : null}
    </>
  );
}
