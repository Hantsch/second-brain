/* Filing an answer back as a wiki page — the whole concern, not just the form.

   `FileBackDialog` is the form. What stood around it — which question belonged
   to the answer, the write itself, and the path that comes back afterwards —
   used to sit in `AskPanel` and had nothing to do with the conversation that
   panel owns. It lives here so the panel stays about asking.

   The panel keeps exactly one thing: which answer is being filed. That is
   where the action starts, in the answer feed. Mounted with the message id as
   its key, so every filing starts from scratch — no result and no error from
   the previous one hanging around. */

import { useState } from 'react';
import type { ChatMessage, KnowledgeModule, WriteResult } from '@shared/types';
import { useChatMutations } from '../../lib/queries/chat';
import { FileBackDialog } from './FileBackDialog';

/** A question and its answer share the marker for a round; the question carries `-q`. */
const QUESTION_SUFFIX = '-q';

/** The question an answer belongs to: the last user turn above it. */
function questionOf(
  messages: readonly ChatMessage[],
  message: ChatMessage,
  threadTitle: string,
): string {
  const at = messages.findIndex((entry) => entry.id === message.id);
  for (let index = at - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate?.role === 'user') return candidate.content;
  }
  return message.id.endsWith(QUESTION_SUFFIX) ? '' : threadTitle;
}

export interface FileBackProps {
  /** The answer being filed. `null` keeps the dialog closed. */
  message: ChatMessage | null;
  /** The thread it belongs to. Without one there is nothing to write. */
  threadId: string | null;
  /** All messages of the thread — the question is read out of them. */
  messages: readonly ChatMessage[];
  /** Fallback when no question stands above the answer. */
  threadTitle: string;
  modules: readonly KnowledgeModule[];
  onOpen: (path: string) => void;
  onClose: () => void;
}

export function FileBack({
  message,
  threadId,
  messages,
  threadTitle,
  modules,
  onOpen,
  onClose,
}: FileBackProps) {
  const [written, setWritten] = useState<WriteResult | null>(null);
  const mutations = useChatMutations();

  return (
    <FileBackDialog
      message={message}
      question={message === null ? '' : questionOf(messages, message, threadTitle)}
      modules={modules}
      busy={mutations.fileBack.isPending}
      error={mutations.fileBack.error}
      result={written}
      onSubmit={({ module, title }) => {
        if (message === null || threadId === null) return;
        mutations.fileBack.mutate(
          { threadId, messageId: message.id, module, title },
          { onSuccess: (result) => setWritten(result) },
        );
      }}
      onOpen={onOpen}
      onClose={onClose}
    />
  );
}
