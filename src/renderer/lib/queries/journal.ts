/* Die Hooks des Tagebuchs: ein Tag, seine Schreibwege, das Gespräch und der
   Tagesabschluss.

   Drei Dinge, die man kennen muss:

   - **Der Stream läuft nicht über TanStack Query.** `journal:coach` antwortet mit
     einer Marke; die Stücke kommen als `event:llm-stream` in den Puffer aus
     `lib/llm-stream.ts`. Erst der Schreibvorgang im Hauptprozess und das daraus
     folgende `event:vault-changed` laden den Tag neu — dann steht die Runde als
     Datei da, nicht als Zustand im Speicher.
   - **Der Tagesabschluss ist eine Mutation, keine Query.** Er kostet einen
     Modellaufruf; er läuft nur, wenn jemand darauf drückt.
   - **Die Vertraulichkeitszeile kommt aus dem Routing**, nicht aus einer Vermutung:
     `useCoachRoute` löst dieselbe Kette auf wie das Gateway im Kern und nennt den
     Provider, an den das Gespräch wirklich geht. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, JournalCloseSuggestion, JournalDayView, WriteRequest } from '@shared/ipc';
import type { CoachMode, JournalDay, JournalSettings, WriteResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';
import { useVaultReady } from './data';
import { resolveRoute, useProviders, useRouting, useTasks } from './llm';

/** Ein Tag mit seinen drei Abschnitten. `null` heißt: es gibt die Datei nicht. */
export function useJournalDay(date: string | null): UseQueryResult<JournalDayView | null> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.journal.day(date ?? ''),
    queryFn: () => api.journal.get(date ?? ''),
    enabled: ready && date !== null,
  });
}

/** Die Tagebuch-Einstellungen des Vaults; `undefined`, solange unbekannt. */
export function useJournalSettings(): JournalSettings | undefined {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  return data?.vault?.journal;
}

export interface CoachRoute {
  /** Liegt für `journal-chat` ein Modell? `undefined` = noch unbekannt. */
  routed: boolean | undefined;
  /** Name des Providers, an den das Gespräch geht. */
  provider: string | null;
  /** Läuft dieser Provider auf diesem Rechner? */
  local: boolean;
}

/**
 * Wohin das Gespräch geht. Dieselbe Kette wie `RoutingGateway.routeFor`: eigene
 * Route, sonst der Standard der Leistungsklasse.
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
    /* Ohne bekannten Provider gilt „nicht lokal": eine Zusage über den eigenen
       Rechner darf nicht auf einer Annahme stehen. */
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
  /** Den Rückweg eines Tagesabschlusses ausführen — genau die Aufträge von dort. */
  undo: UseMutationResult<void, unknown, readonly WriteRequest[]>;
}

export function useJournalMutations(date: string): JournalMutations {
  const client = useQueryClient();
  /* Der Hauptprozess meldet nach jedem Schreibvorgang `event:vault-changed`, was
     zentral alles Betroffene invalidiert. Hier wird der offene Tag zusätzlich
     sofort nachgeladen, damit die Ansicht nicht auf ein Ereignis wartet. */
  const done = (): void => refreshDay(client, date);

  return {
    append: useMutation({
      mutationFn: (request: IpcRequest<'journal:append'>) =>
        api.journal.append(request.date, request.text),
      onSuccess: done,
    }),
    setDay: useMutation({ mutationFn: api.journal.setDay, onSuccess: done }),
    setMood: useMutation({ mutationFn: api.journal.setMood, onSuccess: done }),
    coach: useMutation({ mutationFn: api.journal.coach }),
    abort: useMutation({ mutationFn: api.journal.abort }),
    close: useMutation({ mutationFn: api.journal.close }),
    applyClose: useMutation({ mutationFn: api.journal.applyClose, onSuccess: done }),
    undo: useMutation({
      mutationFn: async (plan: readonly WriteRequest[]) => {
        /* Der Reihe nach: die Aufträge kommen so, wie sie ausgeführt werden müssen,
           und jeder trägt den Hash des Stands, den er zurückdreht. */
        for (const entry of plan) await api.vault.write(entry);
      },
      onSuccess: done,
    }),
  };
}

/** Die drei Haltungen in der Reihenfolge, in der sie im Segment stehen. */
export const COACH_MODE_ORDER: readonly CoachMode[] = ['listen', 'tips', 'analyze'];
