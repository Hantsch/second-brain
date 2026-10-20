/* The dashboard's hooks: content, reminders, sessions — and the layout, which
   is saved immediately.

   The layout is the only write path that runs optimistically: moving things
   around shouldn't feel like a form. The new state sits in the cache before
   the main process has responded; if saving fails, the old state comes back
   and a message says so. A grid that looks different after a reload than it
   did before would be the worse outcome. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  ClaudeSession,
  DashboardData,
  DashboardLayout,
  OverviewSettings,
  Reminder,
  SettingsSnapshot,
} from '@shared/types';
import { api } from '../api';
import { pushToast } from '../toast';
import { qk } from './keys';
import { useVaultReady } from './data';

/** Everything the dashboard needs in one go. */
export function useDashboardData(): UseQueryResult<DashboardData> {
  const ready = useVaultReady();
  return useQuery({ queryKey: qk.dashboard.data(), queryFn: api.dashboard.data, enabled: ready });
}

/** The reminders as a separate query — the header needs them right away. */
export function useReminders(): UseQueryResult<Reminder[]> {
  const ready = useVaultReady();
  return useQuery({ queryKey: qk.reminders.list(), queryFn: api.reminders.list, enabled: ready });
}

/**
 * The sessions. A separate query, because the tile also needs to refetch them
 * after a link is made, without loading the whole dashboard.
 */
export function useClaudeSessions(limit?: number): UseQueryResult<ClaudeSession[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.claude.sessions(),
    queryFn: () => api.claude.sessions(limit),
    enabled: ready,
  });
}

/** The layout. It lives in the vault settings, not in the index. */
export function useDashboardLayout(): UseQueryResult<DashboardLayout> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.dashboard.layout(),
    queryFn: api.dashboard.layout,
    enabled: ready,
  });
}

/** The vault's thresholds — the tiles cite them in their empty states. */
export function useOverviewSettings(): OverviewSettings | undefined {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  return data?.vault?.overview;
}

/**
 * Write a slice of the overview settings back through `settings:setVault`.
 *
 * Same shape as the mutation in `settings/BehaviorTab.tsx`: the main process
 * validates and clamps, and its snapshot — not the value we sent — is what
 * lands in the cache. There is no separate channel for a single preference;
 * the settings file is the one place these live, which is also why they
 * survive a restart.
 *
 * Caveat for array fields: `deepMerge` in the main process replaces arrays
 * wholesale, so callers hand over the complete next array, never a delta.
 */
export function useSaveOverview(): UseMutationResult<
  SettingsSnapshot,
  unknown,
  Partial<OverviewSettings>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (overview: Partial<OverviewSettings>) => api.settings.setVault({ overview }),
    onSuccess: (snapshot: SettingsSnapshot) =>
      client.setQueryData(qk.settings.snapshot(), snapshot),
  });
}

interface LayoutContext {
  previous: DashboardLayout | undefined;
}

/**
 * Save the layout. Optimistic with rollback: `onMutate` sets the new state,
 * `onError` the old one — and reports it.
 */
export function useSaveLayout(): UseMutationResult<
  DashboardLayout,
  unknown,
  DashboardLayout,
  LayoutContext
> {
  const client = useQueryClient();
  return useMutation<DashboardLayout, unknown, DashboardLayout, LayoutContext>({
    mutationFn: (layout: DashboardLayout) => api.dashboard.setLayout(layout),
    onMutate: (layout: DashboardLayout) => {
      const previous = client.getQueryData<DashboardLayout>(qk.dashboard.layout());
      client.setQueryData(qk.dashboard.layout(), layout);
      return { previous };
    },
    onError: (_error, _layout, context) => {
      if (context?.previous !== undefined) {
        client.setQueryData(qk.dashboard.layout(), context.previous);
      }
      pushToast('error', 'dashboard.layout.saveFailed');
    },
    /* The main process validates the layout; its version is the authoritative one. */
    onSuccess: (saved) => client.setQueryData(qk.dashboard.layout(), saved),
  });
}

/** Snooze a reminder. Afterward, the list and dashboard need refetching. */
export function useSnoozeReminder(): UseMutationResult<
  void,
  unknown,
  { id: string; days: number }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => api.reminders.snooze(id, days),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.reminders.list() });
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
    },
  });
}

/**
 * Cancel the snooze — the reverse path to `useSnoozeReminder`. Without it,
 * snoozing would be an action with no undo; afterward the reminder starts
 * nagging again right away.
 */
export function useUnsnoozeReminder(): UseMutationResult<void, unknown, string> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reminders.unsnooze(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.reminders.list() });
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
    },
  });
}

/** Link a session to a project — this writes into the project file. */
export function useLinkSession(): UseMutationResult<
  void,
  unknown,
  { sessionId: string; project: string }
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, project }: { sessionId: string; project: string }) =>
      api.claude.link(sessionId, project),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.claude.sessions() });
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
