// @vitest-environment jsdom
/* LlamaCppModelPanel (033, D11): search Hugging Face, pick a file, download
 * it with progress and a working cancel. Rendered standalone (no `App`, no
 * router) — the panel needs nothing but a query client and `window.sb`, and
 * i18n is module-level state, not React context.
 *
 * Covered: repo/file/size/quantisation rendering, the three honest states
 * (empty result, gated repo, offline network), a disk-refused download
 * naming the actual MB figure, and cancel clearing an in-progress row.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HfModelSearchRequest, HfModelSearchResponse, HfPullFile } from '@shared/types';
import { LlamaCppModelPanel } from '@renderer/screens/settings/LlamaCppModelPanel';
import type { SbBridge } from '@renderer/lib/bridge';
import { setLanguage } from '@renderer/i18n';
import { appendPull, clearPull } from '@renderer/lib/pullStore';

let searchImpl: (query: string) => HfModelSearchResponse;
let filesImpl: (modelId: string) => HfModelSearchResponse;
let pullImpl: (hfFile: HfPullFile) => Promise<{ pullId: string }>;

const invoke = vi.fn(async (channel: string, payload?: unknown): Promise<unknown> => {
  switch (channel) {
    case 'llm:searchModelFiles': {
      const request = payload as HfModelSearchRequest;
      return request.step === 'search' ? searchImpl(request.query) : filesImpl(request.modelId);
    }
    case 'llm:pullModel': {
      const { hfFile } = payload as { hfFile?: HfPullFile };
      if (!hfFile) throw new Error('expected an hfFile for the llamacpp pull');
      return pullImpl(hfFile);
    }
    case 'llm:cancelPull':
      return undefined;
    default:
      throw new Error(`unexpected channel in this test: ${channel}`);
  }
});

const REPO_ID = 'TheBloke/Qwen2.5-1.5B-GGUF';
const FILE_ITEM = {
  path: 'Q4_K_M/qwen2.5-1.5b.Q4_K_M.gguf',
  sizeBytes: 4_100_000_000,
  quantisation: 'Q4_K_M' as string | null,
  downloadUrl:
    'https://huggingface.co/TheBloke/Qwen2.5-1.5B-GGUF/resolve/main/Q4_K_M/qwen2.5-1.5b.Q4_K_M.gguf',
};
const FILE: HfModelSearchResponse = { step: 'files', ok: true, files: [FILE_ITEM] };

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LlamaCppModelPanel />
    </QueryClientProvider>,
  );
}

async function search(query = 'qwen2.5 1.5b gguf') {
  renderPanel();
  await userEvent.type(screen.getByLabelText('Modellsuche'), query);
  await userEvent.click(screen.getByRole('button', { name: 'Suchen' }));
}

beforeEach(() => {
  setLanguage('de');
  invoke.mockClear();
  searchImpl = () => ({
    step: 'search',
    ok: true,
    results: [{ id: REPO_ID, downloads: 10, likes: 1, tags: [] }],
  });
  filesImpl = () => FILE;
  pullImpl = async () => ({ pullId: 'pull-1' });
  window.sb = { invoke, on: () => () => undefined, off: () => undefined } as unknown as SbBridge;
});

afterEach(() => {
  delete window.sb;
});

describe('LlamaCppModelPanel: Suche', () => {
  it('zeigt Repository, Datei, Größe und Quantisierung', async () => {
    await search();
    await userEvent.click(await screen.findByRole('button', { name: REPO_ID }));

    expect(await screen.findByText('qwen2.5-1.5b.Q4_K_M.gguf')).toBeTruthy();
    // 4_100_000_000 bytes in binary GB (`formatBytes`'s own convention),
    // paired with the quantisation on the same line — matched together so
    // the assertion can't accidentally hit the file name's own "Q4_K_M".
    expect(screen.getByText(/3,8 GB.*Q4_K_M/)).toBeTruthy();
  });

  it('nennt „Quantisierung unbekannt“, wenn die Datei keine trägt', async () => {
    filesImpl = () => ({ step: 'files', ok: true, files: [{ ...FILE_ITEM, quantisation: null }] });
    await search();
    await userEvent.click(await screen.findByRole('button', { name: REPO_ID }));

    expect(await screen.findByText(/Quantisierung unbekannt/)).toBeTruthy();
  });

  it('meldet ein leeres Suchergebnis ehrlich', async () => {
    searchImpl = () => ({ step: 'search', ok: true, results: [] });
    await search();

    expect(await screen.findByText('Keine passenden Modelle gefunden.')).toBeTruthy();
  });

  it('meldet ein gesperrtes Repository ehrlich', async () => {
    filesImpl = () => ({ step: 'files', ok: false, reason: 'gated' });
    await search();
    await userEvent.click(await screen.findByRole('button', { name: REPO_ID }));

    expect(
      await screen.findByText('Dieses Repository benötigt Zugriff auf huggingface.co.'),
    ).toBeTruthy();
  });

  it('meldet eine nicht erreichbare Hugging-Face-API ehrlich', async () => {
    searchImpl = () => ({ step: 'search', ok: false, reason: 'network-error' });
    await search();

    expect(await screen.findByText('Hugging Face war nicht erreichbar.')).toBeTruthy();
  });
});

describe('LlamaCppModelPanel: Download', () => {
  it('nennt beim Ablehnen wegen Speicherplatz die tatsächliche Zahl in MB', async () => {
    pullImpl = () => {
      throw {
        code: 'invalid',
        message: 'irrelevant',
        detail: { blockedReason: 'insufficient-disk', freeDiskMb: 812 },
      };
    };
    await search();
    await userEvent.click(await screen.findByRole('button', { name: REPO_ID }));
    await userEvent.click(
      await screen.findByRole('button', { name: /qwen2.5-1.5b.Q4_K_M.gguf holen/ }),
    );

    expect(
      await screen.findByText('Nicht genug freier Speicherplatz — nur 812 MB frei.'),
    ).toBeTruthy();
  });

  it('bricht einen laufenden Download ab', async () => {
    try {
      await search();
      await userEvent.click(await screen.findByRole('button', { name: REPO_ID }));
      await userEvent.click(
        await screen.findByRole('button', { name: /qwen2.5-1.5b.Q4_K_M.gguf holen/ }),
      );

      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith(
          'llm:pullModel',
          expect.objectContaining({ runtime: 'llamacpp' }),
        ),
      );
      appendPull('pull-1', {
        modelId: 'qwen2.5-1.5b.Q4_K_M.gguf',
        status: 'downloading',
        completed: 100,
        total: 1000,
        done: false,
      });
      expect(await screen.findByRole('progressbar')).toBeTruthy();

      await userEvent.click(
        screen.getByRole('button', { name: /Download von qwen2.5-1.5b.Q4_K_M.gguf abbrechen/ }),
      );
      await waitFor(() =>
        expect(invoke).toHaveBeenCalledWith('llm:cancelPull', { pullId: 'pull-1' }),
      );

      /* The closing event a real cancel produces (`llamacpp-pull.ts`: cancel
         → `done: true, error: 'cancelled'`) — simulated here since this
         test's bridge doesn't wire `event:pull-progress` to `pullStore`
         itself (same convention as `settings.test.tsx`'s progress test). */
      appendPull('pull-1', {
        modelId: 'qwen2.5-1.5b.Q4_K_M.gguf',
        status: 'error',
        completed: 0,
        total: 1000,
        done: true,
        error: 'cancelled',
      });

      expect(await screen.findByText(/Der Download ist fehlgeschlagen/)).toBeTruthy();
      expect(screen.queryByRole('progressbar')).toBeNull();
    } finally {
      clearPull('pull-1'); // module-level store — must not leak into other tests
    }
  });
});
