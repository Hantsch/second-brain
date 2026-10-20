/* "What this machine is" (035, D7): the scan-only facts — RAM, GPU, CPU
   cores, free disk space. VRAM is deliberately not here: it is the one fact
   the user may also enter or correct (028), so its row lives in `VramRow`
   instead, grouped with the card's editable controls rather than in this
   read-only list. */

import type { CapacityVerdict, MachineFacts, UiLanguage } from '@shared/types';
import type { Vars } from '../../../i18n';
import { formatNumber } from '../../../lib/format';
import { mb, plannedNote } from './format';

interface MachineFactsListProps {
  facts: MachineFacts;
  /** Only for the RAM row's planned-figure suffix (029, D4). */
  verdict: CapacityVerdict;
  language: UiLanguage;
  t: (key: string, vars?: Vars) => string;
}

export function MachineFactsList({ facts, verdict, language, t }: MachineFactsListProps) {
  const gpuName =
    facts.gpuDetection === 'detected' && facts.gpuName !== null
      ? facts.gpuName
      : t('settings.machine.unknown');
  const plannedRam = plannedNote(t, language, verdict.plannedRamMb, verdict.budgetPercent);

  return (
    <dl className="sb-kv">
      <div>
        <dt>{t('settings.machine.fact.ram')}</dt>
        <dd className="sb-mono">
          {mb(facts.totalRamMb, language) ?? t('settings.machine.unknown')}
          {plannedRam ? <span className="sb-note-detail"> · {plannedRam}</span> : null}
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
  );
}
