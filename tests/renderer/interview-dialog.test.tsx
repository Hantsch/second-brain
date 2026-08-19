// @vitest-environment jsdom
/* The interview overlay (012, D5): one question at a time, an answer that
 * writes before the next question appears, a skip that writes nothing, two
 * ways out (Esc, "leave and write myself"), progress in mono, a line naming
 * the running engine, and a closing panel once the plan is finished.
 *
 * A focused file of its own rather than an addition to `journal.test.tsx`
 * (already ~1000 lines): `InterviewDialog` is self-contained and needs none
 * of that file's day/close-out fixtures.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse, JournalInterviewPlan } from '@shared/ipc';
import type { ProviderConfig, Routing, TaskDefinition, VaultStatus } from '@shared/types';
import { InterviewDialog } from '@renderer/screens/journal/InterviewDialog';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';

type Handlers = Partial<{
  [K in IpcChannel]: (payload: IpcRequest<K>) => IpcResponse<K>;
}>;

interface Mock {
  payloadOf(channel: IpcChannel): unknown;
  payloadsOf(channel: IpcChannel): unknown[];
}

function installMock(handlers: Handlers): Mock {
  const calls: { channel: IpcChannel; payload: unknown }[] = [];
  const invoke = vi.fn(async (channel: IpcChannel, payload?: unknown) => {
    calls.push({ channel, payload });
    const handler = handlers[channel] as ((request: unknown) => unknown) | undefined;
    if (!handler)
      throw Object.assign(new Error(`kein Handler für ${channel}`), { code: 'invalid' });
    return handler(payload);
  });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
  return {
    payloadOf: (channel) => calls.find((entry) => entry.channel === channel)?.payload,
    payloadsOf: (channel) =>
      calls.filter((entry) => entry.channel === channel).map((entry) => entry.payload),
  };
}

const DATE = '2026-08-10';

const status: VaultStatus = {
  root: 'C:/vaults/demo',
  name: 'Demo',
  ready: true,
  docCount: 12,
  indexedAt: new Date().toISOString(),
  indexing: false,
};

const LOCAL_PROVIDER: ProviderConfig = {
  id: 'local-1',
  label: 'Ollama',
  kind: 'openai-compatible',
  baseUrl: 'http://localhost:11434/v1',
  hasKey: false,
  local: true,
  enabled: true,
  models: ['qwen2.5:14b'],
  createdAt: new Date().toISOString(),
};

const CLOUD_PROVIDER: ProviderConfig = {
  ...LOCAL_PROVIDER,
  id: 'cloud-1',
  label: 'Anthropic',
  kind: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  hasKey: true,
  local: false,
  models: ['claude-sonnet-4'],
};

const TASKS: TaskDefinition[] = [
  {
    kind: 'journal-chat',
    labelKey: 'task.journal-chat.label',
    hintKey: 'task.journal-chat.hint',
    suggested: 'cheap',
    sensitive: true,
    streams: true,
    structured: false,
  },
];

function routing(providerId: string | null): Routing {
  return providerId === null
    ? { tasks: {}, defaults: {} }
    : { tasks: { 'journal-chat': { providerId, model: 'qwen2.5:14b' } }, defaults: {} };
}

function plan(
  steps: JournalInterviewPlan['steps'],
  mode?: JournalInterviewPlan['mode'],
): JournalInterviewPlan {
  return {
    steps,
    /* `mode` is the server's own decision (`gateway.isAvailable('journal-chat')`),
       not something the dialog re-derives from `llm:routing` — a test that
       wants "no route" has to say so on the plan too, exactly like the real
       IPC handler would (012, F3 review fix). */
    mode: mode ?? (steps.length === 0 ? 'fixed' : 'model'),
    finished: steps.length === 0,
  };
}

const WORK_STEP = { topic: 'work' as const, question: 'What did you work on today?' };
const EVENTS_STEP = { topic: 'events' as const, question: 'What happened today that stood out?' };

interface Rendered {
  sb: Mock;
  onClose: () => void;
}

function open(extra: Handlers = {}): Rendered {
  const onClose = vi.fn();
  const sb = installMock({
    'vault:status': () => status,
    'llm:routing': () => routing(LOCAL_PROVIDER.id),
    'llm:tasks': () => TASKS,
    'llm:providers': () => [LOCAL_PROVIDER],
    'journal:interviewPlan': () => plan([WORK_STEP, EVENTS_STEP]),
    'journal:interviewAnswer': () => ({ path: 'x', hash: 'h-2', at: '10:00' }),
    'journal:interviewFollowUp': () => ({ question: null, noModel: false }),
    ...extra,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <InterviewDialog open date={DATE} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { sb, onClose };
}

afterEach(() => {
  delete window.sb;
});

describe('Interview-Overlay', () => {
  it('zeigt genau eine Frage auf einmal', async () => {
    setLanguage('en');
    open();

    expect(await screen.findByText(WORK_STEP.question)).toBeTruthy();
    expect(screen.queryByText(EVENTS_STEP.question)).toBeNull();
  });

  it('schreibt die Antwort, bevor die nächste Frage erscheint', async () => {
    setLanguage('en');
    const { sb } = open();

    await screen.findByText(WORK_STEP.question);
    await userEvent.type(screen.getByLabelText('Your answer'), 'Mostly the interview overlay.');
    await userEvent.click(screen.getByRole('button', { name: 'Answer and continue' }));

    await waitFor(() =>
      expect(sb.payloadOf('journal:interviewAnswer')).toEqual({
        date: DATE,
        step: WORK_STEP,
        answer: 'Mostly the interview overlay.',
      }),
    );
    expect(await screen.findByText(EVENTS_STEP.question)).toBeTruthy();
    expect(screen.queryByText(WORK_STEP.question)).toBeNull();
    /* The field is cleared for the next question. */
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe('');
  });

  it('übernimmt eine Rückfrage als eingeschobenen Schritt, ohne den Nenner zu erhöhen', async () => {
    setLanguage('en');
    const { sb } = open({
      'journal:interviewFollowUp': () => ({ question: 'Anything blocking it?', noModel: false }),
    });

    await screen.findByText(WORK_STEP.question);
    await userEvent.type(screen.getByLabelText('Your answer'), 'Mostly the interview overlay.');
    await userEvent.click(screen.getByRole('button', { name: 'Answer and continue' }));

    expect(await screen.findByText('Anything blocking it?')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    await waitFor(() =>
      expect(sb.payloadOf('journal:interviewFollowUp')).toEqual({
        date: DATE,
        step: WORK_STEP,
        answer: 'Mostly the interview overlay.',
      }),
    );

    /* Answering the follow-up moves on to the second backbone topic, and it
       is never asked a follow-up of its own. */
    await userEvent.type(screen.getByLabelText('Your answer'), 'No, it was smooth.');
    await userEvent.click(screen.getByRole('button', { name: 'Answer and continue' }));
    expect(await screen.findByText(EVENTS_STEP.question)).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(sb.payloadsOf('journal:interviewFollowUp')).toHaveLength(1);
  });

  it('überspringt eine Frage, ohne journal:interviewAnswer aufzurufen', async () => {
    setLanguage('en');
    const { sb } = open();

    await screen.findByText(WORK_STEP.question);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(await screen.findByText(EVENTS_STEP.question)).toBeTruthy();
    expect(sb.payloadsOf('journal:interviewAnswer')).toEqual([]);
  });

  it('schließt über „Verlassen und selbst schreiben" und über Esc', async () => {
    setLanguage('en');
    const { onClose } = open();

    await screen.findByText(WORK_STEP.question);
    await userEvent.click(screen.getByRole('button', { name: 'Leave and write myself' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('zeigt den Fortschritt in Mono', async () => {
    setLanguage('en');
    open();

    const progress = await screen.findByText('1 / 2');
    expect(progress.className).toContain('sb-mono');
  });

  it('nennt ein lokales Modell', async () => {
    setLanguage('en');
    open({ 'llm:routing': () => routing(LOCAL_PROVIDER.id) });

    expect(
      await screen.findByText('Follow-up questions run locally on this machine.'),
    ).toBeTruthy();
  });

  it('nennt den Provider, wenn Rückfragen den Rechner verlassen', async () => {
    setLanguage('en');
    open({
      'llm:routing': () => routing(CLOUD_PROVIDER.id),
      'llm:providers': () => [CLOUD_PROVIDER],
    });

    expect(
      await screen.findByText(
        'Follow-up questions go to Anthropic — a local model stays on this machine.',
      ),
    ).toBeTruthy();
  });

  it('nennt den festen Fragenkatalog ohne geroutetes Modell', async () => {
    setLanguage('en');
    open({
      'llm:routing': () => routing(null),
      'journal:interviewPlan': () => plan([WORK_STEP, EVENTS_STEP], 'fixed'),
    });

    expect(await screen.findByText('Fixed question set — no model needed.')).toBeTruthy();
  });

  it('bleibt beim festen Fragenkatalog, wenn eine Route existiert, aber der Plan trotzdem "fixed" meldet', async () => {
    /* The plan's own `mode` is the source of truth (F3): a stale/misconfigured
       route (disabled provider, missing key) must never make the overlay
       claim a model is answering when the server-side check already said
       otherwise. */
    setLanguage('en');
    open({
      'llm:routing': () => routing(CLOUD_PROVIDER.id),
      'llm:providers': () => [CLOUD_PROVIDER],
      'journal:interviewPlan': () => plan([WORK_STEP, EVENTS_STEP], 'fixed'),
    });

    expect(await screen.findByText('Fixed question set — no model needed.')).toBeTruthy();
    expect(screen.queryByText(/go to Anthropic/)).toBeNull();
  });

  it('zeigt den Abschluss, sobald der Plan fertig ist, und nennt Stimmung/Energie', async () => {
    setLanguage('en');
    open({ 'journal:interviewPlan': () => plan([]) });

    expect(
      await screen.findByText(
        'The interview is done for today — anything skipped stays open. Mood and energy still wait on the pickers at the top of the day.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Your answer')).toBeNull();
  });

  it('erreicht denselben Abschluss, wenn der Plan clientseitig durchlaufen wird', async () => {
    setLanguage('en');
    open({ 'journal:interviewPlan': () => plan([WORK_STEP]) });

    await screen.findByText(WORK_STEP.question);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(
      await screen.findByText(
        'The interview is done for today — anything skipped stays open. Mood and energy still wait on the pickers at the top of the day.',
      ),
    ).toBeTruthy();
  });
});
