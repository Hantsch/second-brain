/* Die Hooks des Erfassens: Dump schreiben, Vorschlag holen, ablegen, liegen
   lassen, verwerfen, zurücknehmen.

   Der Vorschlag wird bewusst verzögert geholt: wer mit j/k durch die Inbox
   fährt, soll nicht für jede Bewegung ein Modell arbeiten lassen. Nach der
   Verzögerung antwortet der Hauptprozess aus seinem Speicher, solange der Dump
   unverändert ist — die Bewegung zurück kostet dann nichts. */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { IpcRequest, IpcResponse } from '@shared/ipc';
import type { CaptureSettings, DumpItem, FilingProposal, FilingResult } from '@shared/types';
import { api } from '../api';
import { qk } from './keys';

/** So lange muss eine Auswahl stehen, bevor eingeordnet wird. */
export const PROPOSAL_DELAY_MS = 250;

/**
 * Verzögert einen Pfad; jede Änderung startet die Frist neu.
 *
 * Die erste Auswahl wartet nicht: dass die Liste geladen hat, ist keine Bewegung
 * des Nutzers — der Vorschlag zum obersten Dump soll sofort kommen. Gewartet wird
 * erst, wenn jemand mit j/k weitergeht.
 */
function useSettledPath(path: string | null, delayMs: number): string | null {
  const [settled, setSettled] = useState(path);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(path), settled === null ? 0 : delayMs);
    return () => clearTimeout(timer);
  }, [path, delayMs, settled]);
  return settled;
}

/**
 * Der Ablage-Vorschlag zu einem Dump. `null` heißt: gerade keiner ausgewählt —
 * dann wird nicht gefragt und nichts behauptet.
 */
export function useProposal(
  path: string | null,
  delayMs = PROPOSAL_DELAY_MS,
): UseQueryResult<FilingProposal> {
  const settled = useSettledPath(path, delayMs);
  return useQuery({
    queryKey: qk.capture.proposal(path ?? ''),
    queryFn: () => api.capture.classify(path ?? ''),
    enabled: path !== null && settled === path,
    /* Einordnen ist teuer und kann ohne Modell nicht besser werden: ein
       Fehlschlag bleibt ein Fehlschlag, den der Nutzer selbst wiederholt. */
    retry: false,
  });
}

/** Die Erfassen-Einstellungen des Vaults; `undefined`, solange unbekannt. */
export function useCaptureSettings(): CaptureSettings | undefined {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  return data?.vault?.capture;
}

/* Die Ablage berührt Projektdateien, Todos und den Index. Der Hauptprozess
   schickt danach `event:vault-changed`, was zentral alles Betroffene
   invalidiert; hier wird nur die Inbox sofort nachgeladen, damit die Karte ohne
   Umweg über ein Ereignis verschwindet. */
function refreshInbox(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.capture.inbox() });
}

export interface CaptureMutations {
  dump: UseMutationResult<DumpItem, unknown, IpcRequest<'capture:dump'>>;
  apply: UseMutationResult<FilingResult, unknown, FilingProposal>;
  keep: UseMutationResult<IpcResponse<'capture:keep'>, unknown, string>;
  discard: UseMutationResult<{ undoToken: string }, unknown, string>;
  undo: UseMutationResult<void, unknown, string>;
}

export function useCaptureMutations(): CaptureMutations {
  const client = useQueryClient();
  const done = (): void => refreshInbox(client);

  return {
    dump: useMutation({ mutationFn: api.capture.dump, onSuccess: done }),
    apply: useMutation({ mutationFn: api.capture.apply, onSuccess: done }),
    keep: useMutation({ mutationFn: api.capture.keep, onSuccess: done }),
    discard: useMutation({ mutationFn: api.capture.discard, onSuccess: done }),
    undo: useMutation({
      mutationFn: api.capture.undo,
      onSuccess: () => {
        refreshInbox(client);
        /* Der Rückweg holt den Dump zurück — sein Vorschlag von vorher ist
           damit wieder gültig, aber neu zu holen. */
        void client.invalidateQueries({ queryKey: ['capture', 'proposal'] });
      },
    }),
  };
}
