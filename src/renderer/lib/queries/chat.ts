/* The hooks for asking: threads, a single thread, ask, abort, delete,
   file back.

   The stream doesn't go through TanStack Query: every chunk arrives as
   `event:llm-stream` and lands in the buffer from `lib/llm-stream.ts`. Only
   once it's finished does `lib/events.ts` invalidate the thread — this way
   nothing flickers, and afterward the answer exists as a file, not as
   in-memory state. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { AskAnswer, IpcRequest } from '@shared/ipc';
import type { ChatThread, WriteResult } from '@shared/types';
import { api } from '../api';
import { clearStream } from '../llm-stream';
import { qk } from './keys';
import { useVaultReady } from './data';

/** From this many characters on, the history search kicks in — below that, the plain list is shown. */
export const MIN_THREAD_QUERY = 2;

/**
 * The thread list. Without a search term these are the most recent ones; from
 * `MIN_THREAD_QUERY` characters on, the main process searches titles and
 * messages, which also finds threads that have fallen out of the list.
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

/** A thread with all its messages. `null` means: none selected. */
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
    /* The question exists as a file immediately — that's why the list
       refetches right away instead of waiting for the end of the stream. */
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

    /* Filing back creates a wiki page; the main process then emits
       `event:vault-changed`, which refreshes modules and the index centrally. */
    fileBack: useMutation({ mutationFn: api.chat.fileBack }),
  };
}
