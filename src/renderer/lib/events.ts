/* Zentrale Ereignis-Verdrahtung: was aus dem Hauptprozess kommt, invalidiert
   hier genau die betroffenen Query-Keys. Kein Polling, keine verstreuten
   Listener in Components. */

import type { QueryClient } from '@tanstack/react-query';
import { bridge } from './bridge';
import { appendStream } from './llm-stream';
import { pushToast } from './toast';
import { qk, VAULT_DEPENDENT_ROOTS } from './queries/keys';
import { setLanguage } from '../i18n';

function invalidateVaultDependent(client: QueryClient): void {
  for (const root of VAULT_DEPENDENT_ROOTS) {
    void client.invalidateQueries({ queryKey: [root] });
  }
}

/** Meldet alle Ereignisse an; Rückgabe hängt sie wieder ab. */
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

  /* Ein Pflegelauf endet auch, wenn niemand auf dem Pflege-Screen steht — beim
     Öffnen des Vaults etwa (`gardener.runOnOpen`). Danach hängt mehr als der
     Bericht daran: das Dashboard zeigt den Gesundheitswert, die Modulkarten die
     Befundzahl ihres Moduls. Ohne diese Stelle stünde dort die Zahl von vorher,
     und zwei Screens sagten Verschiedenes über denselben Lauf. */
  unsubscribes.push(
    sb.on('event:gardener-progress', ({ phase }) => {
      if (phase !== 'done') return;
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
      /* Erst am Ende die Query invalidieren — sonst rendert jedes Stück neu. */
      if (chunk.done) {
        void client.invalidateQueries({ queryKey: qk.chat.thread(chunk.threadId) });
        void client.invalidateQueries({ queryKey: qk.chat.threads() });
      }
    }),
  );

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
