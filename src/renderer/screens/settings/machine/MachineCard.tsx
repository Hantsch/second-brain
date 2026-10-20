/* Machine capacity card: scans this machine's RAM/VRAM/CPU/disk over IPC
   (`llm:scanMachine`) — main runs the pure heuristic (`judgeCapacity` in
   `@core/llm`) and sends the structured verdict back alongside the facts;
   the renderer never imports `core/llm` itself (it's outside the renderer's
   TypeScript project, `tsconfig.web.json`, on purpose — only main may run
   it). This file only turns that structured data into a sentence, per
   guardrail 7.

   Always rendered, in every state of the models tab: it isn't gated by
   whether a provider exists, because "what can this machine carry" is a
   useful answer even with zero providers configured. Re-scanning is always
   available once a result exists — nothing here is a one-shot action.

   Split into three visually distinct groups plus the scan-meta line (035,
   D7), one file per section under this folder: `MachineFactsList` (what
   this machine is), the verdict sentence below (what it can carry, kept
   inline — it's two short paragraphs, not worth a file of its own), and
   `VramRow` + `BudgetRow` together in a `<fieldset>` (what you may change).
   This shell only fetches data, derives the current facts/verdict, and
   lays the groups out. */

import { useState } from 'react';
/* `describeCapacityBand` is a pure vocabulary function (035, D6) — unlike
   `judgeCapacity`, it does no detection work, so unlike the rest of
   `core/llm` it is fine for the renderer to call it directly instead of
   going through main over IPC. */
import { describeCapacityBand } from '@core/llm/capacity-bands';
import type { CapacityVerdict, MachineFacts, MachineScanResult } from '@shared/types';
import { Panel } from '../../../components/Panel';
import { useLanguage, useT, type Vars } from '../../../i18n';
import { decodeIpcError } from '../../../lib/ipc-error';
import { useMachineScan, useMachineScanResult } from '../../../lib/queries/llm';
import { BudgetRow } from './BudgetRow';
import { UNKNOWN_FACT_KEY } from './format';
import { MachineFactsList } from './MachineFactsList';
import { MachineScanMeta } from './MachineScanMeta';
import { VramRow } from './VramRow';

/**
 * The card's headline sentence (035, D6): what class of local work this
 * machine can carry, and which resource is the ceiling — no parameter
 * counts, no size tiers. `verdict.unknown` stays for the case detection
 * itself failed; everything else composes a band (`describeCapacityBand`)
 * with the named limiting resource into one plain-language sentence.
 */
function verdictSentence(
  t: (key: string, vars?: Vars) => string,
  verdict: CapacityVerdict,
): string {
  if (verdict.limitingFactor === 'unknown' || verdict.maxComfortableParamsB === null) {
    return t('settings.machine.verdict.unknown');
  }
  const resource = t(`settings.machine.resource.${verdict.limitingFactor}`);
  const band = describeCapacityBand(verdict);
  return t(`settings.machine.verdict.band.${band}`, { resource });
}

export function MachineCard() {
  const t = useT();
  const language = useLanguage();
  const scan = useMachineScan();
  /* The remembered scan (035, D2): the card's initial value on mount, so it
     doesn't ask to be scanned as if it had never been. A mutation result —
     from a rescan or from a VRAM/budget edit — still wins once one exists,
     kept here in local state exactly as before this story. */
  const cached = useMachineScanResult();
  const [latest, setLatest] = useState<MachineScanResult | null>(null);

  const run = (): void => {
    scan.mutate(undefined, { onSuccess: setLatest });
  };

  const facts: MachineFacts | null =
    latest?.facts ?? scan.data?.facts ?? cached.data?.facts ?? null;
  const verdict: CapacityVerdict | null =
    latest?.verdict ?? scan.data?.verdict ?? cached.data?.verdict ?? null;
  const scannedAt: string | null =
    latest?.scannedAt ?? scan.data?.scannedAt ?? cached.data?.scannedAt ?? null;
  const errorText = scan.error ? t(`error.code.${decodeIpcError(scan.error).code}`) : null;

  return (
    <Panel
      title={t('settings.machine.title')}
      note={facts ? t('settings.machine.disclaimer') : undefined}
    >
      <div className="sb-setting-block">
        <MachineScanMeta
          scannedAt={scannedAt}
          language={language}
          t={t}
          pending={scan.isPending}
          hasFacts={facts !== null}
          onRescan={run}
        />

        {errorText ? <p className="sb-note-detail sb-note-bad">{errorText}</p> : null}

        {!facts && !scan.isPending && !cached.isLoading && !errorText ? (
          <p className="sb-panel-empty">{t('settings.machine.idle')}</p>
        ) : null}

        {facts && verdict ? (
          <>
            <div>
              <span className="gs-overline">{t('settings.machine.group.facts')}</span>
              <MachineFactsList facts={facts} verdict={verdict} language={language} t={t} />
            </div>

            <div>
              <span className="gs-overline">{t('settings.machine.group.capacity')}</span>
              <p className="sb-routing-summary">{verdictSentence(t, verdict)}</p>
              {verdict.unknowns.length > 0 ? (
                <p className="sb-routing-hint">
                  {t('settings.machine.unknowns', {
                    list: verdict.unknowns.map((key) => t(UNKNOWN_FACT_KEY[key] ?? key)).join(', '),
                  })}
                </p>
              ) : null}
            </div>

            <fieldset className="sb-setting-block sb-fieldset">
              <legend className="gs-overline">{t('settings.machine.group.editable')}</legend>
              <dl className="sb-kv">
                <VramRow
                  facts={facts}
                  verdict={verdict}
                  language={language}
                  t={t}
                  onResult={setLatest}
                />
                <BudgetRow verdict={verdict} t={t} onResult={setLatest} />
              </dl>
            </fieldset>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
