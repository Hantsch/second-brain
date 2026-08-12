/* Die Hooks der Pflege: den letzten Bericht lesen, einen Lauf starten und
   abbrechen, „passt so" setzen und zurücknehmen, einen Fix anwenden und
   zurückdrehen.

   Drei Eigenheiten, alle begründet:

   - **`gardener:report` prüft nicht.** Die Abfrage ist billig (eine Datei) und
     liefert `null`, solange niemand geprüft hat. Der Screen sagt dann „noch nicht
     geprüft" — und keine Zahl.
   - **Der Lauf ist eine Mutation, kein `refetch`.** Er schreibt (den Bericht) und
     kostet Zeit; als Abfrage würde ihn jeder Mount neu starten.
   - **Der Fortschritt hängt am Ereignis, nicht am Cache.** `event:gardener-progress`
     kommt mehrmals pro Sekunde; jedes Stück in den Query-Cache zu schreiben würde
     den halben Screen neu rendern. Deshalb ein eigener kleiner Speicher, genau wie
     beim Antwort-Strom (`llm-stream.ts`) — und ein Abonnement, das nur so lange
     lebt, wie der Screen offen ist. */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcEvents, IpcResponse } from '@shared/ipc';
import type { GardenerFinding, GardenerReport } from '@shared/types';
import { api } from '../api';
import { bridge } from '../bridge';
import { qk } from './keys';
import { useVaultReady } from './data';

export type GardenerProgress = IpcEvents['event:gardener-progress'];
export type FixResult = IpcResponse<'gardener:applyFix'>;
export type UndoFixResult = IpcResponse<'gardener:undoFix'>;

/** Der letzte Bericht. `null` heißt: es gibt keinen — nicht „alles gut". */
export function useGardenerReport(): UseQueryResult<GardenerReport | null> {
  const ready = useVaultReady();
  return useQuery({
    queryKey: qk.gardener.report(),
    queryFn: api.gardener.report,
    enabled: ready,
  });
}

/** Bericht, Dashboard und Modul-Zählungen hängen am selben Lauf. */
function refresh(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.gardener.report() });
  void client.invalidateQueries({ queryKey: qk.dashboard.data() });
  /* Die Modulkarte zeigt die Befunde ihres Moduls (`modules:list`). „Passt so"
     senkt die Zahl dort mit — sonst widersprächen sich zwei Screens. */
  void client.invalidateQueries({ queryKey: qk.modules.list() });
}

/**
 * Ein Lauf. `useLlm` überschreibt die Einstellung für diesen Lauf; ohne Angabe
 * entscheidet `gardener.useLlm` im Vault.
 */
export function useGardenerRun(): UseMutationResult<GardenerReport, unknown, boolean | undefined> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (useLlm?: boolean) => api.gardener.run(useLlm),
    /* Der Hauptprozess hat den Bericht schon abgelegt; seine Fassung ist die
       gültige und steht damit ohne zweite Runde im Cache. */
    onSuccess: (report) => {
      client.setQueryData(qk.gardener.report(), report);
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
      void client.invalidateQueries({ queryKey: qk.modules.list() });
    },
    /* Ein Lauf ist teuer und wird vom Nutzer ausgelöst: kein stiller Wiederholer. */
    retry: false,
  });
}

export function useGardenerCancel(): UseMutationResult<void, unknown, void> {
  return useMutation({ mutationFn: () => api.gardener.cancel(), retry: false });
}

export interface GardenerMutations {
  dismiss: UseMutationResult<void, unknown, string>;
  undismiss: UseMutationResult<void, unknown, string>;
  fix: UseMutationResult<FixResult, unknown, GardenerFinding>;
  undoFix: UseMutationResult<UndoFixResult, unknown, string>;
}

/** Die vier Schreibwege des Screens. Jeder hat seinen Rückweg daneben. */
export function useGardenerMutations(): GardenerMutations {
  const client = useQueryClient();
  const done = (): void => refresh(client);
  return {
    dismiss: useMutation({ mutationFn: api.gardener.dismiss, onSuccess: done, retry: false }),
    undismiss: useMutation({ mutationFn: api.gardener.undismiss, onSuccess: done, retry: false }),
    fix: useMutation({ mutationFn: api.gardener.applyFix, onSuccess: done, retry: false }),
    undoFix: useMutation({ mutationFn: api.gardener.undoFix, onSuccess: done, retry: false }),
  };
}

/**
 * Der Fortschritt des laufenden Pflegelaufs. `null` heißt: gerade läuft keiner.
 * Das Abonnement lebt so lange wie der Screen — ein Fortschritt, den niemand
 * ansieht, muss niemand einsammeln.
 */
export function useGardenerProgress(): GardenerProgress | null {
  const [progress, setProgress] = useState<GardenerProgress | null>(null);

  useEffect(() => {
    return bridge().on('event:gardener-progress', (next) => {
      setProgress(next.running ? next : null);
    });
  }, []);

  return progress;
}
