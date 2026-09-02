/* Central event wiring: whatever comes from the main process invalidates
   exactly the affected query keys here. No polling, no scattered
   listeners in components. */

import type { QueryClient } from '@tanstack/react-query';
import { bridge } from './bridge';
import { setGardenerProgress } from './gardener-progress';
import { appendStream } from './llm-stream';
import { appendPull } from './pullStore';
import { pushToast } from './toast';
import { qk, VAULT_DEPENDENT_ROOTS } from './queries/keys';
import { invalidateLlamaStartPlan, invalidateProviders } from './queries/llm';
import { setLanguage } from '../i18n';

function invalidateVaultDependent(client: QueryClient): void {
  for (const root of VAULT_DEPENDENT_ROOTS) {
    void client.invalidateQueries({ queryKey: [root] });
  }
}

/** Subscribes to all events; the return value unsubscribes them again. */
export function wireEvents(client: QueryClient): () => void {
  const sb = bridge();
  const unsubscribes: (() => void)[] = [];

  unsubscribes.push(
    sb.on('event:vault-changed', () => {
      invalidateVaultDependent(client);
    }),
  );

  unsubscribes.push(
    sb.on('event:vault-status', (status) => {
      client.setQueryData(qk.vault.status(), status);
      invalidateVaultDependent(client);
    }),
  );

  unsubscribes.push(
    sb.on('event:index-progress', ({ indexing }) => {
      if (indexing) return;
      void client.invalidateQueries({ queryKey: qk.index.stats() });
      void client.invalidateQueries({ queryKey: qk.vault.status() });
    }),
  );

  unsubscribes.push(
    sb.on('event:settings', (snapshot) => {
      client.setQueryData(qk.settings.snapshot(), snapshot);
      setLanguage(snapshot.vault?.languages.ui ?? snapshot.app.uiLanguage);
    }),
  );

  unsubscribes.push(
    sb.on('event:ingest-progress', () => {
      void client.invalidateQueries({ queryKey: qk.ingest.jobs() });
    }),
  );

  unsubscribes.push(
    sb.on('event:reminder', () => {
      void client.invalidateQueries({ queryKey: qk.reminders.list() });
    }),
  );

  /* Progress lives in `gardener-progress`, not the query cache — several
     events per second, and this is the one listener for them: it is wired once
     with the window and never unmounts, so a screen mounting mid-run reads the
     current step instead of the nothing an own subscription would have (042).

     A maintenance run can also finish while nobody is on the maintenance
     screen — when opening the vault, for instance (`gardener.runOnOpen`). More
     than the report hangs off this afterward: the dashboard shows the health
     score, the module cards their module's finding count. Without this spot,
     the old number would still be showing there, and two screens would say
     different things about the same run. */
  unsubscribes.push(
    sb.on('event:gardener-progress', (progress) => {
      setGardenerProgress(progress);
      if (progress.phase !== 'done') return;
      void client.invalidateQueries({ queryKey: qk.gardener.report() });
      void client.invalidateQueries({ queryKey: qk.dashboard.data() });
      void client.invalidateQueries({ queryKey: qk.modules.list() });
    }),
  );

  unsubscribes.push(
    sb.on('event:toast', ({ kind, message }) => {
      pushToast(kind, message);
    }),
  );

  unsubscribes.push(
    sb.on('event:llm-stream', (chunk) => {
      appendStream(chunk.messageId, chunk);
      /* Only invalidate the query at the end — otherwise every chunk re-renders. */
      if (chunk.done) {
        void client.invalidateQueries({ queryKey: qk.chat.thread(chunk.threadId) });
        void client.invalidateQueries({ queryKey: qk.chat.threads() });
      }
    }),
  );

  /* Progress lives in `pullStore`, not the query cache — many events per
     second, and nothing here needs re-fetching until the pull is done. Once
     it finishes *successfully*, though, a model just became installed —
     the same "provider models" picture `invalidateProviders` already
     refreshes for every other provider-changing action, so the routing
     table's model list re-probes and picks the new model up on its next
     natural refresh (019c, F6) instead of staying silently stale. A
     cancelled or failed pull changes nothing installed, so it skips this.
     A finished pull is also a new `.gguf` file on disk, which is what 034's
     derived start plan is computed over — hence the second invalidation, so
     the llama.cpp card plans against the model that is now actually there. */
  unsubscribes.push(
    sb.on('event:pull-progress', (chunk) => {
      appendPull(chunk.pullId, chunk);
      if (chunk.done && chunk.error === undefined) {
        invalidateProviders(client);
        invalidateLlamaStartPlan(client);
      }
    }),
  );

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
