/* Maintenance — this is where it becomes visible whether Gaston's vault is
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
import type { GardenerRunScope, GardenerStageId } from '@shared/types';
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
import { useFindingActions } from './useFindingActions';
import { ALL_FILTERS } from './filter';
import type { FindingFilterState } from './filter';
import { scopeLabel } from './scope';
import { targetFor } from './targets';

/* 021b, D4: names a missing stage in the "stopped partway" notice — the same
   labels `RunStrip`'s "still to come" line uses for a running plan's remaining
   stages, so a stage is never called two different things on this screen. */
const STAGE_LABEL_KEYS: Record<GardenerStageId, string> = {
  checks: 'garden.run.stage.checks',
  audit: 'garden.run.stage.audit',
  'loose-ends': 'garden.run.stage.loose-ends',
};

export function GardenScreen() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const report = useGardenerReport();
  const run = useGardenerRun();
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
    applyFix,
    dismiss,
    snooze,
    restore,
    recheck,
    supersede,
    supersedeDuplicate,
    discarded,
    linkOrphan,
    linkOrphans,
    answerLooseEnd,
    undo,
  } = useFindingActions(mutations, pages, run, openPath);

  /* 021a D6: a run is going the moment `useGardenerProgress` reports one —
     not only while *this* mutation instance is pending. That query is
     correct on mount (021a, D4), so it also catches a run this screen didn't
     start itself (autostart, or a click from before a remount). Guarding
     `start` itself, not just the button's `disabled` attribute, is what
     actually stops a second `gardener:run` from firing — a rapid second
     click must not reach the IPC call just because the disabled state
     hasn't re-rendered yet. */
  const running = run.isPending || progress !== null;
  const data = report.data ?? null;
  /* 021b, D4: a run that never reached every planned stage names what it
     missed — `missingStages` is only set together with `complete: false`
     (see `GardenerReport`), so the length check alone decides whether
     "continue" has anything to offer. A no-model run's plan is just
     `checks`, which always completes, so this never shows there. */
  const missingStages = data?.missingStages ?? [];
  const canContinue = data?.complete === false && missingStages.length > 0;
  const missingStagesLabel = missingStages.map((stage) => t(STAGE_LABEL_KEYS[stage])).join(', ');
  /* 021c, D4: a scoped run is a kind of incomplete run (021b's machinery), but
     it must not read as the same "stopped partway" sentence — that would
     claim stages were skipped rather than deliberately left for later. Keyed
     off `scope` itself, not `missingStages`, since a scoped run's own plan
     completes in full. */
  const scope = data?.scope;
  const scopedLabel = scope === undefined ? null : scopeLabel(scope, t);

  const start = (): void => {
    if (running) return;
    reset();
    run.mutate(undefined);
  };

  /* Continues the stopped run instead of starting over — the stages it
     already finished are not run a second time (021b, D3). */
  const resume = (): void => {
    if (running) return;
    reset();
    run.mutate({ resume: true });
  };

  /* 021c, D3: "check only this" — the same run mutation as "check now", just
     scoped to whatever the filter currently narrows to. Guarded the same way
     `start`/`resume` are: a run already going must not accept a second one. */
  const checkOnly = (scope: GardenerRunScope): void => {
    if (running) return;
    reset();
    run.mutate({ scope });
  };

  const header = (
    <ScreenHeader
      overline={t('screen.garden.overline')}
      title={t('screen.garden.title')}
      action={
        <div className="sb-gheader-actions">
          {canContinue ? (
            <Button
              variant="secondary"
              icon="refresh-cw"
              loading={run.isPending}
              disabled={running}
              title={running ? t('garden.run.disabledWhileRunning') : undefined}
              onClick={resume}
            >
              {t('garden.run.continue')}
            </Button>
          ) : null}
          <Button
            icon="sprout"
            loading={run.isPending}
            disabled={running}
            title={running ? t('garden.run.disabledWhileRunning') : undefined}
            onClick={start}
          >
            {data === null ? t('garden.run.action') : t('garden.run.again')}
          </Button>
        </div>
      }
    />
  );

  const failed =
    run.error ??
    mutations.fix.error ??
    mutations.dismiss.error ??
    mutations.undismiss.error ??
    mutations.snooze.error ??
    mutations.unsnooze.error ??
    mutations.undoFix.error ??
    mutations.supersede.error ??
    mutations.linkOrphan.error ??
    mutations.linkOrphans.error ??
    mutations.answerLooseEnd.error ??
    pages.savePage.error ??
    null;

  const notes = (
    <>
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
      {/* 021c, D4 finding 4: a run can be both scoped and stopped mid-stage —
          e.g. "check only module X" cancelled before its own plan finished.
          The two notices answer different questions ("what did I ask for"
          vs. "did it finish") and stand beside each other rather than one
          replacing the other, so "continue check" stays offered whenever it
          is actually possible. */}
      {data.complete === false && scopedLabel !== null ? (
        <div className="sb-gllm" role="status">
          <p className="sb-ghealth-note">
            <span className="sb-gllm-title">{scopedLabel}</span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon="sprout"
            loading={run.isPending}
            disabled={running}
            title={running ? t('garden.run.disabledWhileRunning') : undefined}
            onClick={start}
          >
            {t('garden.scope.checkEverything')}
          </Button>
        </div>
      ) : null}
      {canContinue ? (
        <div className="sb-gllm" role="status">
          <p className="sb-ghealth-note">
            <span className="sb-gllm-title">{t('garden.stopped.title')}</span>
          </p>
          <p className="sb-ghealth-note">
            {t('garden.stopped.missing', { list: missingStagesLabel })}
          </p>
        </div>
      ) : null}
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
          onCheckOnly={checkOnly}
          checkOnlyDisabled={running}
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
          onLinkOrphans={linkOrphans}
          onAnswerLooseEnd={answerLooseEnd}
          onRestore={restore}
        />
      )}
    </div>
  );
}
