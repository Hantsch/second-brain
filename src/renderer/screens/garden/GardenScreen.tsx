/* Maintenance — this is where it becomes visible whether the Second Brain is
   healthy.

   Top to bottom in the order you need it: the score with its reasoning, the
   advice, then the findings grouped by kind and filterable.

   Four states, all explicit:
   - **No report** → "not checked yet" plus the one focal point "check now".
     No invented 100.
   - **No findings** → a calm statement with the timestamp and what was
     checked. No confetti.
   - **No model** → the mechanical findings appear in full, and one line says
     what a model would additionally find, with the path into the setting.
     The screen is fully usable without a model; that's the normal case.
   - **Error** → as a card in the action's place, with details behind it.

   One focal point: "Check now" top right. Everything in the cards stays calm.

   Nothing here resolves a contradiction on its own, and no action does more
   than it announces: the preview shows the line that will be written, "looks
   fine" hides it (with a way back), and whatever merely opens says so. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LlmMissing } from '../../components/LlmMissing';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useLanguage, useT } from '../../i18n';
import { api } from '../../lib/api';
import { formatAge } from '../../lib/format';
import {
  useGardenerCancel,
  useGardenerMutations,
  useGardenerProgress,
  useGardenerReport,
  useGardenerRun,
} from '../../lib/queries/gardener';
import { useTaskRouted } from '../../lib/queries/llm';
import { useModuleMutations } from '../../lib/queries/modules';
import { FindingList } from './FindingList';
import { HealthCard } from './HealthCard';
import { OutcomeStrip } from './OutcomeStrip';
import { RunBar } from './RunBar';
import { useFindingActions } from './useFindingActions';
import { ALL_FILTERS } from './filter';
import type { FindingFilterState } from './filter';
import { targetFor } from './targets';

export function GardenScreen() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const report = useGardenerReport();
  const run = useGardenerRun();
  const cancel = useGardenerCancel();
  const progress = useGardenerProgress();
  const mutations = useGardenerMutations();
  const pages = useModuleMutations();
  const modelRouted = useTaskRouted('gardener-audit');

  const [filter, setFilter] = useState<FindingFilterState>(ALL_FILTERS);

  /* A path leads to where the file lives in the app — otherwise to the file. */
  const openPath = (path: string): void => {
    const target = targetFor(path);
    if (target.kind === 'route') void navigate(target.to);
    else void api.shell.openPath(target.path).catch(() => undefined);
  };

  const openFile = (path: string): void => {
    void api.shell.openPath(path).catch(() => undefined);
  };

  const {
    outcome,
    busyId,
    undoable,
    reset,
    cancelled,
    applyFix,
    dismiss,
    snooze,
    restore,
    recheck,
    supersede,
    supersedeDuplicate,
    discarded,
    linkOrphan,
    answerLooseEnd,
    undo,
  } = useFindingActions(mutations, pages, run, openPath);

  const start = (): void => {
    reset();
    run.mutate(undefined);
  };

  const stop = (): void => {
    cancel.mutate(undefined, { onSuccess: cancelled });
  };

  const header = (
    <ScreenHeader
      overline={t('screen.garden.overline')}
      title={t('screen.garden.title')}
      action={
        <Button icon="sprout" loading={run.isPending} disabled={run.isPending} onClick={start}>
          {report.data === null || report.data === undefined
            ? t('garden.run.action')
            : t('garden.run.again')}
        </Button>
      }
    />
  );

  const failed =
    run.error ??
    cancel.error ??
    mutations.fix.error ??
    mutations.dismiss.error ??
    mutations.undismiss.error ??
    mutations.snooze.error ??
    mutations.unsnooze.error ??
    mutations.undoFix.error ??
    mutations.supersede.error ??
    mutations.linkOrphan.error ??
    mutations.answerLooseEnd.error ??
    pages.savePage.error ??
    null;

  const notes = (
    <>
      <RunBar
        progress={progress}
        busy={run.isPending}
        cancelling={cancel.isPending}
        onCancel={stop}
      />
      {outcome === null ? null : (
        <OutcomeStrip
          outcome={outcome}
          busy={
            mutations.undoFix.isPending ||
            mutations.undismiss.isPending ||
            mutations.unsnooze.isPending ||
            pages.savePage.isPending
          }
          {...(undoable ? { onUndo: undo } : {})}
          onOpenSecond={openPath}
        />
      )}
      {failed === null ? null : <ErrorState error={failed} variant="secondary" scrollIntoView />}
    </>
  );

  if (report.error) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      </div>
    );
  }

  if (report.isPending) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <Skeleton lines={4} height={64} />
      </div>
    );
  }

  const data = report.data ?? null;

  if (data === null) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        {notes}
        <EmptyState
          icon="sprout"
          title={t('garden.health.unknown')}
          body={`${t('garden.health.unknownBody')} ${t('screen.garden.empty.body')}`}
          action={{ label: t('garden.run.action'), icon: 'sprout', onClick: start }}
        />
        {modelRouted === false ? <LlmMissing task="gardener-audit" tone="note" /> : null}
      </div>
    );
  }

  return (
    <div className="sb-screen sb-screen--wide">
      {header}
      {notes}
      <HealthCard
        report={data}
        onShowHidden={() => setFilter((prev) => ({ ...prev, state: 'all' }))}
      />

      {modelRouted === false ? (
        <div className="sb-gllm">
          <p className="sb-ghealth-note">
            <span className="sb-gllm-title">{t('garden.llm.title')}: </span>
            {t('garden.llm.body')}
          </p>
          <LlmMissing task="gardener-audit" tone="note" />
        </div>
      ) : null}

      {data.findings.length === 0 && (data.hidden ?? []).length === 0 ? (
        <EmptyState
          icon="circle-check-big"
          title={t('garden.findings.none')}
          body={`${t('garden.checkedAt', { when: formatAge(data.ranAt, language) })} ${t(
            'garden.findings.noneBody',
          )}`}
        />
      ) : (
        <FindingList
          findings={data.findings}
          hidden={data.hidden ?? []}
          filter={filter}
          onFilter={setFilter}
          busyId={busyId}
          onFix={applyFix}
          onDismiss={dismiss}
          onSnooze={snooze}
          onRecheck={recheck}
          onOpenPath={openPath}
          onOpenFile={openFile}
          onSupersede={supersede}
          onSupersedeDuplicate={supersedeDuplicate}
          onDiscarded={discarded}
          onLinkOrphan={linkOrphan}
          onAnswerLooseEnd={answerLooseEnd}
          onRestore={restore}
        />
      )}
    </div>
  );
}
