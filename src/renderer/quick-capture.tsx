/* Einstiegspunkt des Schnell-Erfassen-Fensters. Bewusst ohne Router und ohne
   Rail: ein Textfeld, eine Hinweiszeile. */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickCapture } from './screens/quick-capture/QuickCapture';
import './index.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const container = document.getElementById('root');
if (!container) throw new Error('Kein #root im Dokument');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <QuickCapture />
    </QueryClientProvider>
  </StrictMode>,
);
