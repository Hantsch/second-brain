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
   available once a result exists — nothing here is a one-shot action. */

import type { CapacityVerdict, MachineFacts, UiLanguage } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { useLanguage, useT, type Vars } from '../../i18n';
import { formatBytes, formatNumber } from '../../lib/format';
import { decodeIpcError } from '../../lib/ipc-error';
import { useMachineScan } from '../../lib/queries/llm';

/** MB facts render through the same compact unit convention as file sizes. */
function mb(value: number | null, language: UiLanguage): string | null {
  return value === null ? null : formatBytes(value * 1024 * 1024, language);
}

function verdictSentence(
  t: (key: string, vars?: Vars) => string,
  verdict: CapacityVerdict,
): string {
  if (verdict.limitingFactor === 'unknown' || verdict.maxComfortableParamsB === null) {
    return t('settings.machine.verdict.unknown');
  }
  return t(`settings.machine.verdict.${verdict.limitingFactor}`, {
    comfortable: Math.round(verdict.maxComfortableParamsB),
    possible: Math.round(verdict.maxPossibleParamsB ?? verdict.maxComfortableParamsB),
  });
}

const UNKNOWN_FACT_KEY: Record<string, string> = {
  ram: 'settings.machine.fact.ram',
  vram: 'settings.machine.fact.vram',
  cpu: 'settings.machine.fact.cpu',
};

export function MachineCard() {
  const t = useT();
  const language = useLanguage();
  const scan = useMachineScan();

  const run = (): void => {
    scan.mutate();
  };

  const facts: MachineFacts | null = scan.data?.facts ?? null;
  const verdict: CapacityVerdict | null = scan.data?.verdict ?? null;
  const errorText = scan.error ? t(`error.code.${decodeIpcError(scan.error).code}`) : null;

  const gpuName =
    facts && facts.gpuDetection === 'detected' && facts.gpuName !== null
      ? facts.gpuName
      : t('settings.machine.unknown');

  return (
    <Panel
      title={t('settings.machine.title')}
      action={
        <Button variant="secondary" size="sm" icon="search" loading={scan.isPending} onClick={run}>
          {t(facts ? 'settings.machine.rescan' : 'settings.machine.scan')}
        </Button>
      }
      note={facts ? t('settings.machine.disclaimer') : undefined}
    >
      <div className="sb-setting-block">
        {errorText ? <p className="sb-note-detail sb-note-bad">{errorText}</p> : null}

        {!facts && !scan.isPending && !errorText ? (
          <p className="sb-panel-empty">{t('settings.machine.idle')}</p>
        ) : null}

        {facts && verdict ? (
          <>
            <p className="sb-routing-summary">{verdictSentence(t, verdict)}</p>

            {verdict.tiersThatFit.length > 0 ? (
              <p className="sb-routing-hint">
                {t('settings.machine.tiers', { tiers: verdict.tiersThatFit.join(', ') })}
              </p>
            ) : null}

            <dl className="sb-kv">
              <div>
                <dt>{t('settings.machine.fact.ram')}</dt>
                <dd className="sb-mono">
                  {mb(facts.totalRamMb, language) ?? t('settings.machine.unknown')}
                </dd>
              </div>
              <div>
                <dt>{t('settings.machine.fact.vram')}</dt>
                <dd className="sb-mono">
                  {mb(facts.vramMb, language) ?? t('settings.machine.unknown')}
                </dd>
              </div>
              <div>
                <dt>{t('settings.machine.fact.gpu')}</dt>
                <dd className="sb-mono">{gpuName}</dd>
              </div>
              <div>
                <dt>{t('settings.machine.fact.cpu')}</dt>
                <dd className="sb-mono">
                  {facts.cpuCores === null
                    ? t('settings.machine.unknown')
                    : formatNumber(facts.cpuCores, language)}
                </dd>
              </div>
              <div>
                <dt>{t('settings.machine.fact.disk')}</dt>
                <dd className="sb-mono">
                  {mb(facts.freeDiskMb, language) ?? t('settings.machine.unknown')}
                </dd>
              </div>
            </dl>

            {verdict.unknowns.length > 0 ? (
              <p className="sb-routing-hint">
                {t('settings.machine.unknowns', {
                  list: verdict.unknowns.map((key) => t(UNKNOWN_FACT_KEY[key] ?? key)).join(', '),
                })}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
