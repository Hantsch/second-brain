/* Einstiegspunkt des Hauptfensters. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { wireEvents } from './lib/events';
import './index.css';

/* HashRouter, weil der gebaute Renderer über `file://` läuft — dort gibt es
   keine History-API, die auf Pfade antwortet. */
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: false },
  },
});

wireEvents(client);

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
