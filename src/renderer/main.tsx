/* Entry point of the main window. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { wireEvents } from './lib/events';
import { bridge } from './lib/bridge';
import { setWorkTasks } from './lib/tasks-store';
import './index.css';

/* HashRouter, because the built renderer runs over `file://` — there is no
   History API there that responds to paths. */
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: false },
  },
});

wireEvents(client);

/* The work queue's live feed (072, D3) — wired here rather than inside
   `wireEvents`, because `tasks-store.ts` needs no `QueryClient`: unlike every
   listener in `events.ts`, this one touches no query cache, only the module
   store `useWorkTasks` reads. Never unsubscribed, exactly like `wireEvents`
   itself above — this file's module scope outlives the whole app. */
bridge().on('event:work-tasks', setWorkTasks);

const container = document.getElementById('root');
if (!container) throw new Error('Kein #root im Dokument');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
);
