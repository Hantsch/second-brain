/* Pflege — hier wird sichtbar, ob das Second Brain gesund ist.

   Von oben nach unten in der Reihenfolge, in der man es braucht: der Wert mit
   seiner Begründung, der Rat, dann die Befunde nach Art gruppiert und filterbar.

   Vier Zustände, alle ausdrücklich:
   - **Kein Bericht** → „noch nicht geprüft" plus der eine Fokuspunkt „jetzt
     prüfen". Keine erfundene 100.
   - **Keine Befunde** → eine ruhige Feststellung mit dem Zeitpunkt und dem, was
     geprüft wurde. Kein Konfetti.
   - **Kein Modell** → die maschinellen Befunde stehen vollständig da, und eine
     Zeile sagt, was ein Modell zusätzlich fände, mit dem Weg in die Einstellung.
     Der Screen ist ohne Modell voll brauchbar; das ist der Normalfall.
   - **Fehler** → als Karte an der Stelle der Aktion, mit Details dahinter.

   Ein Fokuspunkt: „Jetzt prüfen" oben rechts. Alles in den Karten bleibt ruhig.

   Nichts hier löst einen Widerspruch auf, und keine Aktion tut mehr, als sie
   ankündigt: die Vorschau zeigt die Zeile, die geschrieben wird, „passt so"
   blendet aus (mit Rückweg), und was nur öffnet, sagt das. */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GardenerFinding } from '@shared/types';
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
import type { SupersedeWrite } from './ContradictionCard';
import { FindingList } from './FindingList';
import { HealthCard } from './HealthCard';
import { OutcomeStrip } from './OutcomeStrip';
import type { Outcome } from './OutcomeStrip';
import { RunBar } from './RunBar';
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
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* Ein Pfad führt dorthin, wo die Datei in der App steht — sonst zur Datei. */
  const openPath = (path: string): void => {
    const target = targetFor(path);
    if (target.kind === 'route') void navigate(target.to);
    else void api.shell.openPath(target.path).catch(() => undefined);
  };

  const openFile = (path: string): void => {
    void api.shell.openPath(path).catch(() => undefined);
  };

  const start = (): void => {
    setOutcome(null);
    run.mutate(undefined);
  };

  const stop = (): void => {
    cancel.mutate(undefined, { onSuccess: () => setOutcome({ kind: 'cancelled' }) });
  };

  const applyFix = (finding: GardenerFinding): void => {
    setBusyId(finding.id);
    mutations.fix.mutate(finding, {
      onSettled: () => setBusyId(null),
      /* Was die Bestätigung sagt, entscheidet das Ergebnis: ohne geschriebene
         Datei ist nichts geschrieben, auch wenn der Knopf danach klang. */
      onSuccess: (result) => {
        const opened = result.open ?? [];
        if (result.written.length === 0) {
          if (opened.length > 0) {
            setOutcome({ kind: 'opened', paths: opened });
            openPath(opened[0] ?? '');
          }
          return;
        }
        setOutcome({
          kind: 'fixed',
          files: result.written,
          undoToken: result.undoToken ?? null,
        });
      },
    });
  };

  const dismiss = (finding: GardenerFinding): void => {
    setBusyId(finding.id);
    mutations.dismiss.mutate(finding.id, {
      onSettled: () => setBusyId(null),
      onSuccess: () => setOutcome({ kind: 'dismissed', id: finding.id }),
    });
  };

  /* Der Wert und der Hash wurden beim Laden der Karte eingefroren; hat jemand die
     Datei seither angefasst, kommt `conflict` zurück und steht als Karte da. */
  const supersede = (write: SupersedeWrite): void => {
    pages.savePage.mutate(
      {
        path: write.path,
        frontmatter: { supersedes: write.supersedes },
        expectedHash: write.expectedHash,
      },
      {
        /* Der Rückweg braucht den Stand von vorher und den Hash von jetzt. */
        onSuccess: (written) =>
          setOutcome({
            kind: 'superseded',
            file: write.path,
            before: write.before,
            hash: written.hash,
          }),
      },
    );
  };

  const undo = (): void => {
    if (outcome === null) return;
    if (outcome.kind === 'dismissed') {
      mutations.undismiss.mutate(outcome.id, { onSuccess: () => setOutcome(null) });
      return;
    }
    if (outcome.kind === 'fixed' && outcome.undoToken !== null) {
      mutations.undoFix.mutate(outcome.undoToken, {
        onSuccess: (result) => setOutcome({ kind: 'undone', kept: result.kept }),
      });
      return;
    }
    if (outcome.kind === 'superseded') {
      /* Zurück auf den Stand von vorher. War das Feld leer, bleibt eine leere
         Liste stehen: über den Merge lässt sich ein Feld nicht entfernen, und
         `supersedes: []` sagt dasselbe wie „überholt nichts". */
      pages.savePage.mutate(
        {
          path: outcome.file,
          frontmatter: { supersedes: outcome.before },
          expectedHash: outcome.hash,
        },
        { onSuccess: () => setOutcome({ kind: 'undone', kept: [] }) },
      );
    }
  };

  const undoable =
    outcome !== null &&
    (outcome.kind === 'dismissed' ||
      outcome.kind === 'superseded' ||
      (outcome.kind === 'fixed' && outcome.undoToken !== null));

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
    mutations.undoFix.error ??
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
            mutations.undoFix.isPending || mutations.undismiss.isPending || pages.savePage.isPending
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
      <HealthCard report={data} />

      {modelRouted === false ? (
        <div className="sb-gllm">
          <p className="sb-ghealth-note">
            <span className="sb-gllm-title">{t('garden.llm.title')}: </span>
            {t('garden.llm.body')}
          </p>
          <LlmMissing task="gardener-audit" tone="note" />
        </div>
      ) : null}

      {data.findings.length === 0 ? (
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
          filter={filter}
          onFilter={setFilter}
          busyId={busyId}
          onFix={applyFix}
          onDismiss={dismiss}
          onOpenPath={openPath}
          onOpenFile={openFile}
          onSupersede={supersede}
        />
      )}
    </div>
  );
}
