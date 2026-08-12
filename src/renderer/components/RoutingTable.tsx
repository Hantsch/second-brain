/* Jede LLM-Aufgabe der App als Zeile: was sie tut, welche Klasse empfohlen ist,
   welches Modell sie nimmt — und ein Testlauf, der die Antwort zeigt.

   Die Auswahl kennt drei Sorten Einträge: die Modelle je Provider (gruppiert,
   „provider / modell"), den Standard der Leistungsklasse und — wenn dieser
   Standard fehlt — die ehrliche Auskunft, dass die Aufgabe dann ohne Modell
   läuft. Ein per-Aufgabe-Aus gibt es im Vertrag (`Routing`) nicht; was hier
   steht, ist deshalb immer die tatsächliche Folge der Einstellung. */

import type { ModelRef, ProviderConfig, Routing, TaskDefinition, TaskKind } from '@shared/types';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { useT } from '../i18n';
import type { TaskTestResult } from '../lib/queries/llm';
import { TierBadge } from './TierBadge';

/** Gründe, die `llm:testTask` melden kann (aus `LlmUnavailable.reason`). */
const REASONS: readonly string[] = [
  'no-route',
  'provider-disabled',
  'no-key',
  'unreachable',
  'no-vault',
  'error',
];

/** Wert des Eintrags „Standard für diese Klasse" im Auswahlfeld. */
export const INHERIT_VALUE = 'inherit';

export interface RoutingTableProps {
  tasks: readonly TaskDefinition[];
  routing: Routing;
  providers: readonly ProviderConfig[];
  /** `null` heißt: Eintrag löschen, damit der Klassen-Standard greift. */
  onSetRoute: (task: TaskKind, ref: ModelRef | null) => void;
  onTest: (task: TaskKind) => void;
  /** Ergebnis je Aufgabe, solange der Screen offen ist. */
  results: Partial<Record<TaskKind, TaskTestResult>>;
  testingTask?: TaskKind | null;
}

/**
 * Provider und Modell in einem Auswahlwert. Getrennt wird beim ersten `|`:
 * Modellnamen tragen Doppelpunkte und Schrägstriche (`llama3.1:8b`,
 * `meta/llama-3`), eine Provider-Kennung nicht.
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

/** „provider / modell" — der Provider gibt dem Modellnamen seinen Kontext. */
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
          /* Ohne eigene Wahl und ohne Klassen-Standard läuft die Aufgabe ohne
             Modell. Was dann noch geht, steht in der Zeile der Aufgabe — über
             der Tabelle hat es niemand gelesen. */
          const fallback = own === undefined && inherited === undefined;
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
                {/* Nur die Marke: die Begründung stand in jeder Zeile wortwörtlich
                    gleich und machte sie 150 px hoch. Sie steht im Titel und
                    unter „Standard je Leistungsklasse". */}
                <TierBadge tier={task.suggested} title={t(`settings.tier.${task.suggested}.why`)} />
                {task.sensitive ? (
                  <Badge variant="warning" title={t('settings.routing.sensitive')}>
                    {t('settings.routing.sensitiveShort')}
                  </Badge>
                ) : null}
              </td>
              <td>
                <Select
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

/** Der Testlauf meldet den Grund des Gateways; daraus wird ein Satz im Klartext. */
export function reasonKey(reason: string | undefined): string {
  const known = reason !== undefined && REASONS.includes(reason) ? reason : 'error';
  return `settings.routing.reason.${known}`;
}
