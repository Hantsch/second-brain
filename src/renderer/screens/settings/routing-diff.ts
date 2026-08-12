/* Der Unterschied zwischen dem, was eingestellt ist, und dem, was vorgeschlagen
   wird. Grundlage der Vorschau: die KI schlägt vor, der Mensch bestätigt — und
   dafür muss sichtbar sein, was sich ändern würde.

   Reine Rechnung, kein React: so ist sie einzeln prüfbar. */

import type { ModelRef, ModelTier, Routing, TaskDefinition, TaskKind } from '@shared/types';

export interface RouteChange {
  kind: 'task';
  task: TaskKind;
  before: ModelRef | null;
  after: ModelRef | null;
}

export interface DefaultChange {
  kind: 'default';
  tier: ModelTier;
  before: ModelRef | null;
  after: ModelRef | null;
}

export type RoutingChange = RouteChange | DefaultChange;

const TIERS: readonly ModelTier[] = ['cheap', 'balanced', 'strong'];

function same(one: ModelRef | undefined, other: ModelRef | undefined): boolean {
  if (!one || !other) return one === other || (!one && !other);
  return one.providerId === other.providerId && one.model === other.model;
}

/** Alle Zuordnungen, die der Vorschlag verändern würde — in Anzeigereihenfolge. */
export function routingDiff(
  current: Routing,
  suggested: Routing,
  tasks: readonly TaskDefinition[],
): RoutingChange[] {
  const changes: RoutingChange[] = [];
  for (const task of tasks) {
    const before = current.tasks[task.kind];
    const after = suggested.tasks[task.kind];
    if (same(before, after)) continue;
    changes.push({ kind: 'task', task: task.kind, before: before ?? null, after: after ?? null });
  }
  for (const tier of TIERS) {
    const before = current.defaults[tier];
    const after = suggested.defaults[tier];
    if (same(before, after)) continue;
    changes.push({ kind: 'default', tier, before: before ?? null, after: after ?? null });
  }
  return changes;
}
