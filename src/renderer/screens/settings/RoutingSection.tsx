/* Task routing: summary, table, fallback chain, proposal.

   The summary line is the honest core of the screen: it counts how many
   tasks have a model — and states in the same breath what needs to be done.
   What still works without a model is stated per task in its table row; as a
   nested sentence above the table, nobody ever read it.

   "Route automatically" fetches a proposal and shows it as before/after. It's
   only written on confirmation, row by row, via `llm:setRoute` and
   `llm:setDefault` respectively. If a provider has models but not a single
   task is routed, this proposal is the tab's focus point — otherwise setup
   ends in a half-finished state: provider green, routing empty. */

import { useEffect, useRef, useState } from 'react';
import type { ModelTier, ProviderConfig, Routing, TaskDefinition, TaskKind } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Select } from '../../atoms/Select';
import { Panel } from '../../components/Panel';
import {
  RoutingTable,
  describeRef,
  parseValue,
  refValue,
  routingSelectId,
  INHERIT_VALUE,
} from '../../components/RoutingTable';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { decodeIpcError } from '../../lib/ipc-error';
import { resolveRoute, useRoutingMutations, type TaskTestResult } from '../../lib/queries/llm';
import { routingDiff, type RoutingChange } from './routing-diff';

const TIERS: readonly ModelTier[] = ['cheap', 'balanced', 'strong'];

/**
 * Raised by the recommendation panel's "Assign manually" button (067, D2):
 * `nonce` bumps on every click so the effect below fires even if the same
 * task is picked twice in a row — mirroring `proposeSignal`'s counter, just
 * carrying which task to focus along with it.
 */
export interface FocusRequest {
  task: TaskKind;
  nonce: number;
}

export interface RoutingSectionProps {
  tasks: readonly TaskDefinition[];
  routing: Routing;
  providers: readonly ProviderConfig[];
  /**
   * Counts up whenever a provider was added and tested elsewhere. In that
   * case, this section fetches a proposal on its own and opens the
   * before/after preview — it's still confirmed by hand regardless.
   */
  proposeSignal?: number;
  /** Scrolls the named task's select into view and focuses it. */
  focusRequest?: FocusRequest | null;
}

export function RoutingSection({
  tasks,
  routing,
  providers,
  proposeSignal = 0,
  focusRequest = null,
}: RoutingSectionProps) {
  const t = useT();
  const { setRoute, setDefault, test } = useRoutingMutations();
  const [results, setResults] = useState<Partial<Record<TaskKind, TaskTestResult>>>({});
  const [testing, setTesting] = useState<TaskKind | null>(null);
  const [suggestion, setSuggestion] = useState<Routing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withModels = providers.filter((provider) => provider.models.length > 0);
  const unrouted = tasks.filter((task) => resolveRoute(routing, tasks, task.kind) === null);
  const routed = tasks.length - unrouted.length;

  const runTest = (task: TaskKind): void => {
    setTesting(task);
    test.mutate(task, {
      onSuccess: (result) => setResults((current) => ({ ...current, [task]: result })),
      onError: (failure) =>
        setResults((current) => ({
          ...current,
          [task]: {
            ok: false,
            latencyMs: 0,
            sample: '',
            error: decodeIpcError(failure).code === 'no-vault' ? 'no-vault' : 'error',
          },
        })),
      onSettled: () => setTesting(null),
    });
  };

  const propose = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setSuggestion(await api.llm.suggestRouting());
    } catch (failure) {
      setError(t(`error.code.${decodeIpcError(failure).code}`));
    } finally {
      setBusy(false);
    }
  };

  /* No dependency list, with a marker instead: `propose` closes over every
     render, but only a jump in the signal should trigger it. */
  const seen = useRef(proposeSignal);
  useEffect(() => {
    if (proposeSignal === seen.current) return;
    seen.current = proposeSignal;
    void propose();
  });

  /* Same marker pattern as `proposeSignal` above: only a new `nonce` should
     move focus, not every render this component happens to do. */
  const seenFocus = useRef(focusRequest?.nonce ?? 0);
  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === seenFocus.current) return;
    seenFocus.current = focusRequest.nonce;
    const select = document.getElementById(routingSelectId(focusRequest.task));
    select?.scrollIntoView?.({ block: 'center' });
    (select as HTMLSelectElement | null)?.focus();
  });

  const changes = suggestion ? routingDiff(routing, suggestion, tasks) : [];

  const apply = async (): Promise<void> => {
    setBusy(true);
    try {
      /* Row by row through the contract's channels: every change is
         individually traceable and can be reverted individually. */
      for (const change of changes) {
        if (change.kind === 'task') {
          await setRoute.mutateAsync({ task: change.task, ref: change.after });
        } else {
          await setDefault.mutateAsync({ tier: change.tier, ref: change.after });
        }
      }
      setSuggestion(null);
    } catch (failure) {
      setError(t(`error.code.${decodeIpcError(failure).code}`));
    } finally {
      setBusy(false);
    }
  };

  /* A provider with models but not a single task routed: in that case,
     routing is the action everything is waiting on — and gets the teal. */
  const needsRouting = withModels.length > 0 && routed === 0;

  return (
    <Panel
      title={t('settings.routing.title')}
      action={
        <Button
          variant={needsRouting ? 'primary' : 'secondary'}
          size="sm"
          icon="sparkles"
          loading={busy && suggestion === null}
          disabled={withModels.length === 0}
          onClick={() => void propose()}
        >
          {t('settings.routing.auto')}
        </Button>
      }
      note={t('settings.routing.note')}
    >
      <div className="sb-setting-block">
        <p className="sb-routing-summary">
          <span>{t('settings.routing.summary', { routed, total: tasks.length })}</span>
          {unrouted.length === 0 ? (
            <span>{t('settings.routing.allRouted')}</span>
          ) : needsRouting ? (
            <span>{t('settings.routing.callToAction')}</span>
          ) : null}
        </p>

        {error ? <p className="sb-note-detail sb-note-bad">{error}</p> : null}

        {suggestion ? (
          <section className="sb-diff" aria-label={t('settings.routing.preview.title')}>
            <span className="gs-overline">{t('settings.routing.preview.title')}</span>
            <p>
              {changes.length === 0
                ? t('settings.routing.preview.none')
                : changes.length === 1
                  ? t('settings.routing.preview.leadOne')
                  : t('settings.routing.preview.lead', { count: changes.length })}
            </p>
            <ul className="sb-diff-list">
              {changes.map((change) => (
                <li key={changeKey(change)}>
                  <span className="sb-diff-name">{changeLabel(change, tasks, t)}</span>
                  <span className="sb-mono">
                    {change.before
                      ? describeRef(change.before, providers, t('settings.routing.agent'))
                      : t('settings.routing.noModel')}
                  </span>
                  <span className="sb-diff-arrow">{t('settings.routing.preview.arrow')}</span>
                  <span className="sb-mono sb-diff-after">
                    {change.after
                      ? describeRef(change.after, providers, t('settings.routing.agent'))
                      : t('settings.routing.noModel')}
                  </span>
                </li>
              ))}
            </ul>
            <div className="sb-setting-actions">
              {changes.length > 0 ? (
                <Button size="sm" icon="check" loading={busy} onClick={() => void apply()}>
                  {t('settings.routing.preview.apply')}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
                {t('settings.routing.preview.discard')}
              </Button>
            </div>
          </section>
        ) : null}

        {withModels.length === 0 ? (
          <p className="sb-routing-hint">{t('settings.routing.empty')}</p>
        ) : null}

        <RoutingTable
          tasks={tasks}
          routing={routing}
          providers={providers}
          results={results}
          testingTask={testing}
          onSetRoute={(task, ref) => setRoute.mutate({ task, ref })}
          onTest={runTest}
        />

        <div className="sb-defaults">
          <span className="gs-overline">{t('settings.routing.defaults')}</span>
          <p className="sb-routing-hint">{t('settings.routing.defaultsNote')}</p>
          <div className="sb-defaults-row">
            {TIERS.map((tier) => {
              const current = routing.defaults[tier];
              return (
                <Select
                  key={tier}
                  label={t(`settings.tier.${tier}`)}
                  hint={t(`settings.tier.${tier}.why`)}
                  aria-label={t('settings.routing.defaultAria', {
                    tier: t(`settings.tier.${tier}`),
                  })}
                  value={current ? refValue(current) : INHERIT_VALUE}
                  onChange={(event) =>
                    setDefault.mutate({
                      tier,
                      ref:
                        event.target.value === INHERIT_VALUE
                          ? null
                          : parseValue(event.target.value),
                    })
                  }
                >
                  <option value={INHERIT_VALUE}>{t('settings.routing.noModel')}</option>
                  {withModels.map((provider) => (
                    <optgroup key={provider.id} label={provider.label}>
                      {provider.models.map((model) => (
                        <option
                          key={`${provider.id}/${model}`}
                          value={refValue({ providerId: provider.id, model })}
                        >
                          {`${provider.label} / ${model}`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function changeKey(change: RoutingChange): string {
  return change.kind === 'task' ? `task:${change.task}` : `tier:${change.tier}`;
}

function changeLabel(
  change: RoutingChange,
  tasks: readonly TaskDefinition[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (change.kind === 'default') {
    return t('settings.routing.preview.tier', { tier: t(`settings.tier.${change.tier}`) });
  }
  const task = tasks.find((definition) => definition.kind === change.task);
  return task ? t(task.labelKey) : change.task;
}
