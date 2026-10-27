/* Tasks — the place above maintenance for what still needs doing.

   D1 built the shell (header, honest empty state, no data). D3 built the
   plumbing this reads: `useWorkTasks`/`useWorkTasksLoaded` (the live queue),
   `useGardenerProgress` (the maintenance run), the three mutations, and
   `tasks-view.ts`'s `buildTasksView` — which already decides grouping,
   ordering, and the maintenance pseudo-row. This D4 layer only renders that
   view: one `TaskGroup` per non-empty group from `buildTasksView`, in the
   fixed order it already returns them in.

   The empty state may only appear once the queue has answered at least once
   (`useWorkTasksLoaded`) — a queue that has not answered yet renders neither
   the empty state nor a spinner, honestly nothing, rather than flashing
   "no task in sight yet" before the first `work:list` response lands (AC7).
   A running maintenance pass counts as "something to show" independent of
   that flag: `buildTasksView` folds it in from `gardener-progress.ts`, which
   already answers synchronously on a screen mounting mid-run. */

import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { useGardenerProgress } from '../../lib/gardener-progress';
import { useAgentJobMutations, useAgentJobs } from '../../lib/queries/agent-jobs';
import { useTaskCancel, useTaskRemove, useTaskRetry } from '../../lib/queries/tasks';
import { useWorkTasks, useWorkTasksLoaded } from '../../lib/tasks-store';
import { buildTasksView } from '../../lib/tasks-view';
import { TaskGroup } from './TaskGroup';

export function TasksScreen() {
  const t = useT();
  const tasks = useWorkTasks();
  const loaded = useWorkTasksLoaded();
  const progress = useGardenerProgress();
  const cancel = useTaskCancel();
  const remove = useTaskRemove();
  const retry = useTaskRetry();
  const agentJobs = useAgentJobs();
  const { withdraw } = useAgentJobMutations();

  const groups = buildTasksView(tasks, progress, t, agentJobs.data);
  const showEmpty = loaded && groups.length === 0;

  return (
    <div className="sb-screen sb-screen--wide">
      <ScreenHeader overline={t('screen.tasks.overline')} title={t('screen.tasks.title')} />
      {showEmpty ? (
        <EmptyState
          icon="list-checks"
          title={t('screen.tasks.empty.title')}
          body={t('screen.tasks.empty.body')}
        />
      ) : (
        <div className="sb-tgroups">
          {groups.map((group) => (
            <TaskGroup
              key={group.kind}
              kind={group.kind}
              tasks={group.tasks}
              jobs={group.jobs}
              onWithdrawJob={(id) => withdraw.mutate(id)}
              cancel={cancel}
              remove={remove}
              retry={retry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
