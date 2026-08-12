/* Die Hooks des Dashboards: Inhalte, Erinnerungen, Sitzungen — und die
   Anordnung, die sofort gespeichert wird.

   Die Anordnung ist der einzige Schreibweg, der optimistisch läuft: verschieben
   soll sich nicht wie ein Formular anfühlen. Der neue Zustand steht im Cache,
   bevor der Hauptprozess geantwortet hat; scheitert das Speichern, kommt der
   alte zurück und eine Meldung sagt es. Ein Gitter, das nach dem Neuladen anders
   aussieht als vorher, wäre die schlimmere Variante. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  ClaudeSession,
  DashboardData,
  DashboardLayout,
  OverviewSettings,
  Reminder,
} from '@shared/types';
import { api } from '../api';
import { pushToast } from '../toast';
import { qk } from './keys';
import { useVaultReady } from './data';

/** Alles, was das Dashboard in einem Rutsch braucht. */
export function useDashboardData(): UseQueryResult<DashboardData> {
  const ready = useVaultReady();
  return useQuery({ queryKey: qk.dashboard.data(), queryFn: api.dashboard.data, enabled: ready });
}

/** Die Erinnerungen als eigene Abfrage — die Kopfzeile braucht sie sofort. */
export function useReminders(): UseQueryResult<Reminder[]> {
  const ready = useVaultReady();
  return useQuery({ queryKey: qk.reminders.list(), queryFn: api.reminders.list, enabled: ready });
}

/**
 * Die Sitzungen. Eigene Abfrage, weil die Kachel sie auch nach einer Zuordnung
 * neu holen muss, ohne das ganze Dashboard zu laden.
 */
export function useClaudeSessions(limit?: number): UseQueryResult<ClaudeSession[]> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.claude.sessions(),
    queryFn: () => api.claude.sessions(limit),
    enabled: ready,
  });
}

/** Die Anordnung. Sie liegt in den Vault-Einstellungen, nicht im Index. */
export function useDashboardLayout(): UseQueryResult<DashboardLayout> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.dashboard.layout(),
    queryFn: api.dashboard.layout,
    enabled: ready,
  });
}

/** Die Schwellen des Vaults — die Kacheln nennen sie in ihren Leerzuständen. */
export function useOverviewSettings(): OverviewSettings | undefined {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  return data?.vault?.overview;
}

interface LayoutContext {
  previous: DashboardLayout | undefined;
}

/**
 * Anordnung speichern. Optimistisch mit Rücknahme: `onMutate` setzt den neuen
 * Zustand, `onError` den alten — und sagt es.
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
    /* Der Hauptprozess prüft die Anordnung; seine Fassung ist die gültige. */
    onSuccess: (saved) => client.setQueryData(qk.dashboard.layout(), saved),
  });
}

/** Eine Erinnerung ruhig stellen. Danach sind Liste und Dashboard neu zu holen. */
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
 * Die Ruhe aufheben — der Rückweg zu `useSnoozeReminder`. Ohne ihn wäre „ruhig
 * stellen" eine Aktion ohne Rückgängig; danach mahnt die Erinnerung sofort wieder.
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

/** Eine Sitzung einem Projekt zuordnen — das schreibt in die Projektdatei. */
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
