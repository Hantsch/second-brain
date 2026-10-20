/* llama.cpp's model source (033, D11): search Hugging Face for GGUF
   repositories, pick a file, download it with progress and a working
   cancel. Ollama fills its models from its own `pull` tag; llama.cpp has no
   such registry, so this panel is its equivalent of `LocalRuntimePullList`
   — reusing that file's `PullRow` for the download itself (AC: "reuse of
   its progress row") rather than a second progress bar.

   Every lookup here is anonymous and public (Decisions: "Hugging Face
   access") — no key, no token, and a gated/401 repository is an honest
   state (`HfLookupReason`), never a thrown error the user has to decode
   from a stack trace. */

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { HfModelFile, HfPullFile, RuntimeBlockedReason } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Input } from '../../atoms/Input';
import { useLanguage, useT } from '../../i18n';
import { formatBytes } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { findPullEntry, useAllPulls } from '../../lib/pullStore';
import {
  useHfModelFiles,
  useHfModelSearch,
  useLlamaCppModelPull,
} from '../../lib/queries/hf-search';
import { PullRow } from './LocalRuntimePullList';

/** The tree entry's path can nest inside a subdirectory (`Q4_K_M/model.gguf`)
    — only the base name is meaningful once the file lands flat in
    `models/gguf/`. Mirrors `llamacpp-pull.ts`'s `targetFileName`, duplicated
    here only for display: this value is never sent back as a path itself,
    `file.path` is (see `download` below). */
function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

/** The refusal shape `llamacpp-pull.ts`'s `pull` throws before the first
    byte moves: a typed `invalid` error whose `detail` names the blocked
    reason and the actual free-disk figure (AC 5 — "refused with the number
    named"), not a generic message the panel would have to parse. */
interface DiskRefusalDetail {
  blockedReason: RuntimeBlockedReason;
  freeDiskMb: number | null;
}

function isDiskRefusal(detail: unknown): detail is DiskRefusalDetail {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    (detail as { blockedReason?: unknown }).blockedReason === 'insufficient-disk'
  );
}

export function LlamaCppModelPanel() {
  const t = useT();
  const language = useLanguage();
  const [query, setQuery] = useState('');
  const [repo, setRepo] = useState<string | null>(null);
  const search = useHfModelSearch();
  const files = useHfModelFiles();
  const pulls = useAllPulls();
  const { start, cancel } = useLlamaCppModelPull();

  const searchResult = search.data && search.data.step === 'search' ? search.data : null;
  const fileResult = files.data && files.data.step === 'files' ? files.data : null;

  const runSearch = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    setRepo(null);
    search.mutate(trimmed);
  };

  const pickRepo = (id: string): void => {
    setRepo(id);
    files.mutate(id);
  };

  const download = (file: HfModelFile, repoId: string): void => {
    const hfFile: HfPullFile = {
      repoId,
      path: file.path,
      downloadUrl: file.downloadUrl,
      sizeBytes: file.sizeBytes,
    };
    start.mutate(hfFile);
  };

  const startError = start.error ? decodeIpcError(start.error) : null;
  const refusal = startError && isDiskRefusal(startError.detail) ? startError.detail : null;
  const startErrorText =
    refusal && refusal.freeDiskMb !== null
      ? t('settings.runtime.model.diskRefused', { mb: refusal.freeDiskMb })
      : startError
        ? t(`error.code.${startError.code}`)
        : null;

  return (
    <section className="sb-runtime-pull" aria-label={t('settings.runtime.model.title')}>
      <span className="gs-overline">{t('settings.runtime.model.title')}</span>
      <p className="sb-routing-hint">{t('settings.runtime.model.note')}</p>

      <form onSubmit={runSearch} className="sb-setting-actions">
        <Input
          label={t('settings.runtime.model.searchLabel')}
          placeholder={t('settings.runtime.model.searchPlaceholder')}
          icon="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="sm" loading={search.isPending}>
          {t('settings.runtime.model.searchButton')}
        </Button>
      </form>

      {searchResult && !searchResult.ok ? (
        <p className="sb-note-detail sb-note-bad">
          {t(`settings.runtime.model.reason.${searchResult.reason}`)}
        </p>
      ) : searchResult && searchResult.ok && searchResult.results.length === 0 ? (
        <p className="sb-panel-empty">{t('settings.runtime.model.searchEmpty')}</p>
      ) : searchResult && searchResult.ok && searchResult.results.length > 0 ? (
        <ul className="sb-preset-list">
          {searchResult.results.map((result) => (
            <li key={result.id}>
              <button type="button" className="sb-preset" onClick={() => pickRepo(result.id)}>
                <span className="sb-preset-name sb-mono">{result.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {repo ? (
        <div className="sb-setting-block">
          <span className="sb-routing-hint">{t('settings.runtime.model.filesFor', { repo })}</span>

          {files.isPending ? (
            <p className="sb-routing-hint">{t('settings.runtime.model.loadingFiles')}</p>
          ) : fileResult && !fileResult.ok ? (
            <p className="sb-note-detail sb-note-bad">
              {t(`settings.runtime.model.reason.${fileResult.reason}`)}
            </p>
          ) : fileResult && fileResult.ok && fileResult.files.length === 0 ? (
            <p className="sb-panel-empty">{t('settings.runtime.model.filesEmpty')}</p>
          ) : fileResult && fileResult.ok && fileResult.files.length > 0 ? (
            <ul className="sb-runtime-pull-list">
              {fileResult.files.map((file) => {
                const name = baseName(file.path);
                return (
                  <PullRow
                    key={file.path}
                    modelId={name}
                    sizeLabel={
                      file.sizeBytes === null
                        ? t('settings.runtime.model.sizeUnknown')
                        : formatBytes(file.sizeBytes, language)
                    }
                    meta={file.quantisation ?? t('settings.runtime.model.quantUnknown')}
                    entry={findPullEntry(pulls, name)}
                    pulling={start.isPending}
                    onPull={() => download(file, repo)}
                    onCancel={(pullId) => cancel.mutate(pullId)}
                  />
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {startErrorText ? <p className="sb-note-detail sb-note-bad">{startErrorText}</p> : null}
    </section>
  );
}
