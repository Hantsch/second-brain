/* Die Hooks des Fragens: Gespräche, ein Gespräch, fragen, abbrechen, löschen,
   zurückschreiben.

   Der Stream läuft nicht über TanStack Query: jedes Stück kommt als
   `event:llm-stream` und landet im Puffer aus `lib/llm-stream.ts`. Erst wenn er
   fertig ist, invalidiert `lib/events.ts` das Gespräch — so flackert nichts und
   die Antwort steht danach als Datei, nicht als Zustand im Speicher. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { AskAnswer, IpcRequest } from '@shared/ipc';
import type { ChatThread, WriteResult } from '@shared/types';
import { api } from '../api';
import { clearStream } from '../llm-stream';
import { qk } from './keys';
import { useVaultReady } from './data';

/** Ab so vielen Zeichen sucht die Verlaufssuche — darunter zählt die Liste. */
export const MIN_THREAD_QUERY = 2;

/**
 * Die Gesprächsliste. Ohne Suchbegriff sind es die neuesten; ab
 * `MIN_THREAD_QUERY` Zeichen sucht der Hauptprozess in Titeln und Nachrichten und
 * findet damit auch, was aus der Liste herausgefallen ist.
 */
export function useThreads(query = ''): UseQueryResult<ChatThread[]> {
  const ready = useVaultReady();
  const needle = query.trim();
  const searching = needle.length >= MIN_THREAD_QUERY;
  return useQuery({
    queryKey: searching ? qk.chat.search(needle, 'ask') : qk.chat.threads('ask'),
    queryFn: () => api.chat.threads({ kind: 'ask', ...(searching ? { query: needle } : {}) }),
    enabled: ready,
  });
}

/** Ein Gespräch mit allen Nachrichten. `null` heißt: keines ausgewählt. */
export function useThread(id: string | null): UseQueryResult<ChatThread | null> {
  return useQuery({
    queryKey: qk.chat.thread(id ?? ''),
    queryFn: () => api.chat.thread(id ?? ''),
    enabled: id !== null,
  });
}

function refreshThreads(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.chat.threads('ask') });
}

export interface ChatMutations {
  ask: UseMutationResult<AskAnswer, unknown, IpcRequest<'chat:ask'>>;
  abort: UseMutationResult<void, unknown, string>;
  remove: UseMutationResult<void, unknown, string>;
  fileBack: UseMutationResult<WriteResult, unknown, IpcRequest<'chat:fileBack'>>;
}

export function useChatMutations(): ChatMutations {
  const client = useQueryClient();

  return {
    /* Die Frage steht sofort als Datei — die Liste holt deshalb gleich nach, statt
       auf das Ende des Streams zu warten. */
    ask: useMutation({ mutationFn: api.chat.ask, onSuccess: () => refreshThreads(client) }),

    abort: useMutation({ mutationFn: api.chat.abort }),

    remove: useMutation({
      mutationFn: api.chat.remove,
      onSuccess: (_result, id) => {
        clearStream(id);
        void client.removeQueries({ queryKey: qk.chat.thread(id) });
        refreshThreads(client);
      },
    }),

    /* Zurückschreiben legt eine Wiki-Seite an; der Hauptprozess meldet danach
       `event:vault-changed`, was Module und Index zentral nachzieht. */
    fileBack: useMutation({ mutationFn: api.chat.fileBack }),
  };
}
