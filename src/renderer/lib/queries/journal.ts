/* The journal's hooks: a day, its write paths, the conversation, and the day
   close.

   Three things worth knowing:

   - **The stream does not run through TanStack Query.** `journal:coach`
     responds with a token; the chunks arrive as `event:llm-stream` into the
     buffer from `lib/llm-stream.ts`. Only the write in the main process and the
     resulting `event:vault-changed` reload the day — only then does the round
     exist as a file, not as in-memory state.
   - **The day close is a mutation, not a query.** It costs a model call; it
     only runs when someone triggers it.
   - **The confidentiality line comes from routing**, not from a guess:
     `useCoachRoute` resolves the same chain as the gateway in the core and
     names the provider the conversation actually goes to. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  IpcRequest,
  JournalCloseSuggestion,
  JournalDayView,
  JournalInterviewPlan,
  JournalInterviewStep,
  WriteRequest,
} from '@shared/ipc';
import type { CoachMode, JournalDay, JournalSettings, WriteResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';
import { resolveRoute, useProviders, useRouting, useTasks } from './llm';

/** A day with its three sections. `null` means the file doesn't exist. */
export function useJournalDay(date: string | null): UseQueryResult<JournalDayView | null> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.journal.day(date ?? ''),
    queryFn: () => api.journal.get(date ?? ''),
    enabled: ready && date !== null,
  });
}

/** The vault's journal settings; `undefined` while unknown. */
export function useJournalSettings(): JournalSettings | undefined {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  return data?.vault?.journal;
}

export interface CoachRoute {
  /** Is a model configured for `journal-chat`? `undefined` = still unknown. */
  routed: boolean | undefined;
  /** Name of the provider the conversation goes to. */
  provider: string | null;
  /** Does this provider run on this machine? */
  local: boolean;
}

/**
 * Where the conversation goes. Same chain as `RoutingGateway.routeFor`: its own
 * route, otherwise the performance class's default.
 */
export function useCoachRoute(): CoachRoute {
  const routing = useRouting();
  const tasks = useTasks();
  const providers = useProviders();
  if (!routing.data || !tasks.data) return { routed: undefined, provider: null, local: false };
  const route = resolveRoute(routing.data, tasks.data, 'journal-chat');
  if (route === null) return { routed: false, provider: null, local: false };
  const provider = (providers.data ?? []).find((entry) => entry.id === route.ref.providerId);
  return {
    routed: true,
    provider: provider?.label ?? route.ref.providerId,
    /* Without a known provider, "not local" applies: a promise about the user's
       own machine must never rest on an assumption. */
    local: provider?.local === true,
  };
}

function refreshDay(client: QueryClient, date: string): void {
  void client.invalidateQueries({ queryKey: qk.journal.day(date) });
  void client.invalidateQueries({ queryKey: qk.journal.list() });
}

export interface JournalMutations {
  append: UseMutationResult<WriteResult, unknown, IpcRequest<'journal:append'>>;
  setDay: UseMutationResult<WriteResult, unknown, IpcRequest<'journal:setDay'>>;
  setMood: UseMutationResult<JournalDay, unknown, IpcRequest<'journal:setMood'>>;
  /** The manual "mark as finished" / "reopen" switch (009, D3/D6) — a day-level
      field patch exactly like `setMood`: no rewritten user line, so it carries
      `expectedHash` only when the caller has one, and a stale hash surfaces as
      `conflict` instead of silently overwriting. */
  setClosed: UseMutationResult<JournalDay, unknown, IpcRequest<'journal:setClosed'>>;
  coach: UseMutationResult<
    { threadId: string; messageId: string },
    unknown,
    IpcRequest<'journal:coach'>
  >;
  abort: UseMutationResult<void, unknown, string>;
  close: UseMutationResult<JournalCloseSuggestion | null, unknown, string>;
  applyClose: UseMutationResult<
    { written: string[]; undo: WriteRequest[] },
    unknown,
    IpcRequest<'journal:applyClose'>
  >;
  /** Run the undo path of a day close — exactly the write requests from there. */
  undo: UseMutationResult<void, unknown, readonly WriteRequest[]>;
  /** One-time migration (011, D9): folds a legacy `## Conversation` into the
      day stream. Hash-guarded exactly like `setDay` — a stale hash surfaces
      as `conflict` instead of silently overwriting. */
  foldDay: UseMutationResult<WriteResult, unknown, IpcRequest<'journal:foldDay'>>;
}

export function useJournalMutations(date: string): JournalMutations {
  const client = useQueryClient();
  /* The main process reports `event:vault-changed` after every write, which
     centrally invalidates everything affected. Here the open day is additionally
     reloaded right away, so the view doesn't wait on an event. */
  const done = (): void => refreshDay(client, date);

  return {
    append: useMutation({
      mutationFn: (request: IpcRequest<'journal:append'>) =>
        api.journal.append(request.date, request.text),
      onSuccess: done,
    }),
    setDay: useMutation({ mutationFn: api.journal.setDay, onSuccess: done }),
    setMood: useMutation({ mutationFn: api.journal.setMood, onSuccess: done }),
    setClosed: useMutation({ mutationFn: api.journal.setClosed, onSuccess: done }),
    coach: useMutation({ mutationFn: api.journal.coach }),
    abort: useMutation({ mutationFn: api.journal.abort }),
    close: useMutation({ mutationFn: api.journal.close }),
    applyClose: useMutation({ mutationFn: api.journal.applyClose, onSuccess: done }),
    undo: useMutation({
      mutationFn: async (plan: readonly WriteRequest[]) => {
        /* In order: the write requests arrive in the order they must be run, and
           each carries the hash of the state it reverts. */
        for (const entry of plan) await api.vault.write(entry);
      },
      onSuccess: done,
    }),
    foldDay: useMutation({
      /* `api.journal.foldDay` takes positional args (date, expectedHash?), unlike
         `setDay`/`applyClose` which take the request object directly — this
         adapter is the only difference from the other mutations here. */
      mutationFn: (request: IpcRequest<'journal:foldDay'>) =>
        api.journal.foldDay(request.date, request.expectedHash),
      onSuccess: done,
    }),
  };
}

/**
 * The interview's plan for one day (012): which of the five topics are still
 * open, fetched once while the overlay (`InterviewDialog.tsx`) is open —
 * mirrors `useJournalDay`'s `enabled` pattern. The dialog owns this read
 * itself, so the caller only ever needs `open`/`date`/`onClose`.
 *
 * Later steps come from this same response, held in the overlay's own local
 * state: a plan re-fetch after every answer would risk the model extending
 * the five topics, which the story explicitly rules out.
 */
export function useInterviewPlan(
  date: string,
  open: boolean,
): UseQueryResult<JournalInterviewPlan> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.journal.interview(date),
    queryFn: () => api.journal.interviewPlan(date),
    enabled: ready && open,
  });
}

export interface InterviewMutations {
  answer: UseMutationResult<
    { path: string; hash: string; at: string },
    unknown,
    { step: JournalInterviewStep; answer: string }
  >;
  /** The optional one-question follow-up on a just-answered backbone step.
      Writes nothing itself, so unlike `answer` it never refreshes the day. */
  followUp: UseMutationResult<
    { question: string | null; noModel: boolean },
    unknown,
    { step: JournalInterviewStep; answer: string }
  >;
}

export function useInterviewMutations(date: string): InterviewMutations {
  const client = useQueryClient();
  const done = (): void => refreshDay(client, date);

  return {
    answer: useMutation({
      mutationFn: ({ step, answer }: { step: JournalInterviewStep; answer: string }) =>
        api.journal.interviewAnswer(date, step, answer),
      onSuccess: done,
    }),
    followUp: useMutation({
      mutationFn: ({ step, answer }: { step: JournalInterviewStep; answer: string }) =>
        api.journal.interviewFollowUp(date, step, answer),
    }),
  };
}

/** The three stances, in the order they appear in the segment. */
export const COACH_MODE_ORDER: readonly CoachMode[] = ['listen', 'tips', 'analyze'];
