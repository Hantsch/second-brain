/* Every LLM task of the app as a row: what it does, which tier is
   recommended, which model it uses — and a test run that shows the response.

   The dropdown knows three kinds of entries: the models per provider
   (grouped, "provider / model"), the performance tier's default, and — if
   that default is missing — the honest disclosure that the task then runs
   without a model. There's no per-task off-switch in the contract
   (`Routing`); so what's shown here is always the actual consequence of the
   configuration. */

import { loadCatalogue } from '@core/llm/catalogue';
import { judgeRouteForSensitiveTask } from '@core/llm/sensitive';
import type { ModelRef, ProviderConfig, Routing, TaskDefinition, TaskKind } from '@shared/types';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { useT } from '../i18n';
import type { TaskTestResult } from '../lib/queries/llm';
import { TierBadge } from './TierBadge';

/* Bundled, pure and small (3.4 KB) — loaded once at module scope, same way
   `MachineCard.tsx` pulls a pure `@core/llm` helper straight into the
   renderer instead of a new IPC round trip (067, D3). Only used to judge
   whether the model a row is *currently* routed to would pass the
   sensitive-task rule; the table itself never filters on it. */
const CATALOGUE_ENTRIES = loadCatalogue().entries;

/** Reasons `llm:testTask` can report (from `LlmUnavailable.reason`). */
const REASONS: readonly string[] = [
  'no-route',
  'provider-disabled',
  'no-key',
  'unreachable',
  'no-vault',
  'error',
];

/** Value of the "default for this tier" entry in the dropdown. */
export const INHERIT_VALUE = 'inherit';

/**
 * Stable DOM id for a task's routing select — the focus target the
 * recommendation panel's "Assign manually" button points at (067, D2). A
 * plain template rather than `useId()`: the id has to be predictable from a
 * `TaskKind` alone, from outside this component's own render.
 */
export function routingSelectId(task: TaskKind): string {
  return `routing-select-${task}`;
}

export interface RoutingTableProps {
  tasks: readonly TaskDefinition[];
  routing: Routing;
  providers: readonly ProviderConfig[];
  /** `null` means: clear the entry so the tier default takes effect. */
  onSetRoute: (task: TaskKind, ref: ModelRef | null) => void;
  onTest: (task: TaskKind) => void;
  /** Result per task, for as long as the screen is open. */
  results: Partial<Record<TaskKind, TaskTestResult>>;
  testingTask?: TaskKind | null;
}

/**
 * Provider and model combined into one dropdown value. Split at the first
 * `|`: model names carry colons and slashes (`llama3.1:8b`, `meta/llama-3`),
 * a provider id doesn't.
 */
export function refValue(ref: ModelRef): string {
  return `${ref.providerId}|${ref.model}`;
}

export function parseValue(value: string): ModelRef | null {
  const cut = value.indexOf('|');
  if (cut <= 0) return null;
  const providerId = value.slice(0, cut);
  const model = value.slice(cut + 1);
  return model ? { providerId, model } : null;
}

/** "provider / model" — the provider gives the model name its context. */
export function describeRef(ref: ModelRef, providers: readonly ProviderConfig[]): string {
  const provider = providers.find((entry) => entry.id === ref.providerId);
  return `${provider?.label ?? ref.providerId} / ${ref.model}`;
}

export function RoutingTable({
  tasks,
  routing,
  providers,
  onSetRoute,
  onTest,
  results,
  testingTask = null,
}: RoutingTableProps) {
  const t = useT();
  const withModels = providers.filter((provider) => provider.models.length > 0);

  return (
    <table className="gs-table sb-routing">
      <thead>
        <tr>
          <th scope="col">{t('settings.routing.col.task')}</th>
          <th scope="col">{t('settings.routing.col.suggestion')}</th>
          <th scope="col">{t('settings.routing.col.model')}</th>
          <th scope="col">{t('settings.routing.col.test')}</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const label = t(task.labelKey);
          const own = routing.tasks[task.kind];
          const inherited = routing.defaults[task.suggested];
          const result = results[task.kind];
          /* Without its own choice and without a tier default, the task runs
             without a model. What still works then is stated in the task's
             own row — above the table, nobody ever read it. */
          const fallback = own === undefined && inherited === undefined;
          /* What the row actually runs on right now: its own choice, or
             failing that the tier default — the same resolution `fallback`
             above uses. A sensitive task routed (directly or by default) to
             a target that would not pass the rule gets a warning; the
             table never blocks or filters on it (067, D3, AC2). */
          const effectiveRef = own ?? inherited;
          const sensitiveWarning =
            task.sensitive && effectiveRef
              ? judgeRouteForSensitiveTask(task.kind, effectiveRef, providers, CATALOGUE_ENTRIES)
              : null;
          return (
            <tr key={task.kind}>
              <td>
                <span className="sb-routing-task">{label}</span>
                <span className="sb-routing-hint">{t(task.hintKey)}</span>
                {fallback ? (
                  <span className="sb-routing-fallback">
                    {t('settings.routing.withoutRow', {
                      fallback: t(`settings.fallback.${task.kind}`),
                    })}
                  </span>
                ) : null}
              </td>
              <td>
                {/* Badge only: the reasoning used to appear verbatim in every
                    row and made it 150px tall. It now lives in the title and
                    under "default per performance tier". */}
                <TierBadge tier={task.suggested} title={t(`settings.tier.${task.suggested}.why`)} />
                {task.sensitive ? (
                  <Badge variant="warning" title={t('settings.routing.sensitive')}>
                    {t('settings.routing.sensitiveShort')}
                  </Badge>
                ) : null}
              </td>
              <td>
                <Select
                  id={routingSelectId(task.kind)}
                  aria-label={t('settings.routing.selectAria', { task: label })}
                  value={own ? refValue(own) : INHERIT_VALUE}
                  onChange={(event) =>
                    onSetRoute(
                      task.kind,
                      event.target.value === INHERIT_VALUE ? null : parseValue(event.target.value),
                    )
                  }
                >
                  <option value={INHERIT_VALUE}>
                    {t('settings.routing.inherit', {
                      model: inherited
                        ? describeRef(inherited, providers)
                        : t('settings.routing.noModel'),
                    })}
                  </option>
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
                {sensitiveWarning?.warn ? (
                  <span className="sb-routing-fallback">
                    {t(`settings.routing.sensitiveWarn.${sensitiveWarning.reason}`)}
                  </span>
                ) : null}
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="zap"
                  loading={testingTask === task.kind}
                  onClick={() => onTest(task.kind)}
                >
                  {t('settings.routing.test')}
                </Button>
                {result ? (
                  <span className="sb-routing-result">
                    <span className={result.ok ? undefined : 'sb-note-bad'}>
                      {result.ok
                        ? t('settings.routing.testOk', { ms: result.latencyMs })
                        : t('settings.routing.testFailed')}
                    </span>
                    <span className="sb-note-detail">
                      {result.ok ? result.sample : t(reasonKey(result.error))}
                    </span>
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The test run reports the gateway's reason; this turns it into a plain-language sentence. */
export function reasonKey(reason: string | undefined): string {
  const known = reason !== undefined && REASONS.includes(reason) ? reason : 'error';
  return `settings.routing.reason.${known}`;
}
