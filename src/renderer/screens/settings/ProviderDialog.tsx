/* Adding or editing a provider — in two steps: pick a preset, fill in the
   rest. The presets come from `core/llm/presets`, so from the core; the
   address and kind are already fixed by that, at most the key needs to be
   filled in.

   Saving always includes a test: a connection that doesn't answer is not a
   connection. The result appears in the dialog, not in a toast that flies
   away. */

import { useState } from 'react';
import type { ProviderConfig, ProviderPreset } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { Input } from '../../atoms/Input';
import { Switch } from '../../atoms/Switch';
import { useT } from '../../i18n';
import { decodeIpcError } from '../../lib/ipc-error';

export interface ProviderDialogProps {
  presets: readonly ProviderPreset[];
  /** Set means: edit this provider. Otherwise, create a new one. */
  provider?: ProviderConfig | null;
  onClose: () => void;
  submit: (input: {
    label: string;
    kind: ProviderConfig['kind'];
    baseUrl: string;
    apiKey?: string;
    local: boolean;
  }) => Promise<ProviderConfig>;
  probe: (id: string) => Promise<ProviderConfig>;
}

interface Draft {
  label: string;
  baseUrl: string;
  kind: ProviderConfig['kind'];
  local: boolean;
  apiKey: string;
  /** Only when editing: whether a key is already stored. */
  hasKey: boolean;
}

function draftFromPreset(preset: ProviderPreset): Draft {
  return {
    label: preset.label,
    baseUrl: preset.baseUrl,
    kind: preset.kind,
    local: preset.local,
    apiKey: '',
    hasKey: false,
  };
}

function draftFromProvider(provider: ProviderConfig): Draft {
  return {
    label: provider.label,
    baseUrl: provider.baseUrl,
    kind: provider.kind,
    local: provider.local,
    apiKey: '',
    hasKey: provider.hasKey,
  };
}

export function ProviderDialog({
  presets,
  provider = null,
  onClose,
  submit,
  probe,
}: ProviderDialogProps) {
  const t = useT();
  const [draft, setDraft] = useState<Draft | null>(provider ? draftFromProvider(provider) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const change = (patch: Partial<Draft>): void =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const save = async (): Promise<void> => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const saved = await submit({
        label: draft.label.trim(),
        kind: draft.kind,
        baseUrl: draft.baseUrl.trim(),
        local: draft.local,
        ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
      });
      const probed = await probe(saved.id);
      setResult(
        probed.probe?.ok === true
          ? { ok: true, text: t('provider.probeOk', { ms: probed.probe.latencyMs ?? 0 }) }
          : { ok: false, text: probed.probe?.error ?? t('provider.probeFailed') },
      );
    } catch (failure) {
      setError(t(`error.code.${decodeIpcError(failure).code}`));
    } finally {
      setBusy(false);
    }
  };

  const title = provider ? t('provider.dialog.editTitle') : t('provider.dialog.addTitle');

  /* Step 1: only when creating — when editing, the preset is already fixed. */
  if (!draft) {
    return (
      <Dialog open title={title} onClose={onClose} closeLabel={t('common.close')} size="md">
        <p className="sb-dialog-lead">{t('provider.dialog.presetLead')}</p>
        <ul className="sb-preset-list">
          {presets.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                className="sb-preset"
                onClick={() => setDraft(draftFromPreset(preset))}
              >
                <span className="sb-preset-name">{preset.label}</span>
                {preset.hint ? <span className="sb-preset-hint">{t(preset.hint)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    );
  }

  const done = result !== null;

  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      closeLabel={t('common.close')}
      size="md"
      footer={
        <>
          {!provider && !done ? (
            <Button variant="ghost" size="sm" icon="chevron-left" onClick={() => setDraft(null)}>
              {t('provider.dialog.back')}
            </Button>
          ) : null}
          {done ? (
            <Button size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                icon="check"
                loading={busy}
                disabled={!draft.label.trim() || !draft.baseUrl.trim()}
                onClick={() => void save()}
              >
                {t('provider.dialog.save')}
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="sb-setting-block">
        <Input
          label={t('provider.dialog.labelLabel')}
          hint={t('provider.dialog.labelHint')}
          value={draft.label}
          onChange={(event) => change({ label: event.target.value })}
        />
        <Input
          label={t('provider.dialog.baseUrlLabel')}
          hint={t('provider.dialog.baseUrlHint')}
          value={draft.baseUrl}
          className="sb-mono-field"
          onChange={(event) => change({ baseUrl: event.target.value })}
        />
        {draft.local ? null : (
          <Input
            label={t('provider.dialog.keyLabel')}
            hint={draft.hasKey ? t('provider.dialog.keyKeep') : t('provider.dialog.keyHint')}
            type="password"
            autoComplete="off"
            value={draft.apiKey}
            onChange={(event) => change({ apiKey: event.target.value })}
          />
        )}
        <Switch
          label={t('provider.dialog.localLabel')}
          description={t('provider.dialog.localHint')}
          checked={draft.local}
          onChange={(event) => change({ local: event.target.checked })}
        />

        {busy ? <p className="sb-setting-readout">{t('provider.dialog.testing')}</p> : null}
        {error ? <p className="sb-note-detail sb-note-bad">{error}</p> : null}
        {result ? (
          <p className={result.ok ? 'sb-setting-readout' : 'sb-note-detail sb-note-bad'}>
            {result.text}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
