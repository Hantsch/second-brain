// @vitest-environment jsdom
/* 067, D3: the manual routing table's own sensitivity warning (AC2). Never
 * a gate — the option stays selectable and `onSetRoute` still fires with
 * whatever the user picked. The warning only says, in one sentence, why the
 * model the row is *currently* pointed at would not pass the sensitive-task
 * rule (`judgeRouteForSensitiveTask` in `@core/llm/sensitive`).
 *
 * `classify-dump` is a sensitive task per `tasks.ts`; `title-tags` is not —
 * used as the non-sensitive control.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig, Routing, TaskDefinition, TaskKind } from '@shared/types';
import { RoutingTable } from '@renderer/components/RoutingTable';
import { setLanguage } from '@renderer/i18n';

const TASKS: TaskDefinition[] = [
  {
    kind: 'classify-dump',
    labelKey: 'task.classify-dump.label',
    hintKey: 'task.classify-dump.hint',
    suggested: 'cheap',
    typicalTokens: { in: 600, out: 120 },
    sensitive: true,
    streams: false,
    structured: true,
    minLocalParamsB: undefined,
  },
  {
    kind: 'title-tags',
    labelKey: 'task.title-tags.label',
    hintKey: 'task.title-tags.hint',
    suggested: 'cheap',
    typicalTokens: { in: 500, out: 60 },
    sensitive: false,
    streams: false,
    structured: true,
    minLocalParamsB: undefined,
  },
];

/* Two providers, both remote (`local: false`): one carries a model
   (`openrouter/some-free-model`) whose bundled catalogue entry has
   `dataPolicy: 'trains'`, the other a model (`anthropic/claude-haiku-4-5`)
   whose bundled entry reads `no-training` with a source and a date — a real
   pass/fail pair straight from `models.json` rather than an invented id, so
   the test proves the actual rule, not a stub of it. */
function providers(): ProviderConfig[] {
  return [
    {
      id: 'openrouter-1',
      label: 'OpenRouter',
      kind: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      hasKey: true,
      local: false,
      enabled: true,
      models: ['openrouter/some-free-model'],
      createdAt: '2026-08-01T10:00:00.000Z',
    },
    {
      id: 'anthropic-1',
      label: 'Anthropic',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      hasKey: true,
      local: false,
      enabled: true,
      models: ['anthropic/claude-haiku-4-5'],
      createdAt: '2026-08-01T10:00:00.000Z',
    },
  ];
}

function routingWith(model: string, providerId: string, task: TaskKind = 'classify-dump'): Routing {
  return { tasks: { [task]: { providerId, model } }, defaults: {} };
}

function renderTable(routing: Routing, onSetRoute = vi.fn()) {
  render(
    <RoutingTable
      tasks={TASKS}
      routing={routing}
      providers={providers()}
      results={{}}
      onSetRoute={onSetRoute}
      onTest={() => undefined}
    />,
  );
  return onSetRoute;
}

beforeEach(() => {
  setLanguage('en');
});

describe('RoutingTable: sensitive-task warning in the manual table', () => {
  it('warns, naming the reason, when a sensitive task is routed to a model that fails the rule — but does not block the assignment', async () => {
    const onSetRoute = renderTable(routingWith('openrouter/some-free-model', 'openrouter-1'));

    expect(
      screen.getByText(
        'This provider trains on submitted content — not fit for a task that reads personal content.',
      ),
    ).toBeTruthy();

    // Non-blocking: the failing option is still present and selectable, and
    // picking it still calls back with exactly that ref.
    const select = screen.getByRole('combobox', { name: 'Model for Sort a dump' });
    const failingOption = within(select).getByRole('option', {
      name: 'OpenRouter / openrouter/some-free-model',
    });
    expect((failingOption as HTMLOptionElement).disabled).toBe(false);

    await userEvent.selectOptions(select, 'openrouter-1|openrouter/some-free-model');
    expect(onSetRoute).toHaveBeenCalledWith('classify-dump', {
      providerId: 'openrouter-1',
      model: 'openrouter/some-free-model',
    });
  });

  it('shows no warning when the routed model passes the sensitivity rule', () => {
    renderTable(routingWith('anthropic/claude-haiku-4-5', 'anthropic-1'));

    expect(
      screen.queryByText(
        'This provider trains on submitted content — not fit for a task that reads personal content.',
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        'No data policy is known for this model — not fit for a task that reads personal content.',
      ),
    ).toBeNull();
  });

  it('shows no warning for a non-sensitive task, even routed to the same training model', () => {
    renderTable(routingWith('openrouter/some-free-model', 'openrouter-1', 'title-tags'));

    expect(
      screen.queryByText(
        'This provider trains on submitted content — not fit for a task that reads personal content.',
      ),
    ).toBeNull();
  });
});
