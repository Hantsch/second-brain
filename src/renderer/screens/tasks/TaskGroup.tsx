/* One of the three fixed groups — running, waiting, finished — as its own
   `Panel`, mirroring the dashboard's modules and `FindingList`'s per-kind
   sections (017 D4): a title plus a count, a list of rows below.

   Ordering and which groups exist at all is decided once, in `tasks-view.ts`'s
   `groupTasks`/`buildTasksView` — this component only renders whatever group
   it was handed, it never re-derives the order or filters an empty group out
   itself (the caller, `TasksScreen`, only ever hands it non-empty groups). */

import type { UseMutationResult } from '@tanstack/react-query';
import type { AgentJobView, WorkTask } from '@shared/types';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';
import type { TaskGroupKind } from '../../lib/tasks-view';
import { AgentJobRow } from './AgentJobRow';
import { TaskRow } from './TaskRow';

const HEADING_KEY: Record<TaskGroupKind, string> = {
  running: 'tasks.group.running',
  waiting: 'tasks.group.waiting',
  agent: 'tasks.group.agent',
  finished: 'tasks.group.finished',
};

export interface TaskGroupProps {
  kind: TaskGroupKind;
  tasks: readonly WorkTask[];
  jobs?: readonly AgentJobView[];
  onWithdrawJob: (id: string) => void;
  cancel: UseMutationResult<boolean, unknown, string>;
  remove: UseMutationResult<boolean, unknown, string>;
  retry: UseMutationResult<WorkTask | null, unknown, string>;
}

export function TaskGroup({
  kind,
  tasks,
  jobs = [],
  onWithdrawJob,
  cancel,
  remove,
  retry,
}: TaskGroupProps) {
  const t = useT();
  return (
    <Panel title={t(HEADING_KEY[kind])} meta={String(tasks.length + jobs.length)}>
      <ul className="sb-tlist">
        {tasks.map((task) => (
          <li key={task.id}>
            <TaskRow task={task} cancel={cancel} remove={remove} retry={retry} />
          </li>
        ))}
        {jobs.map((job) => (
          <li key={job.id}>
            <AgentJobRow job={job} onWithdraw={onWithdrawJob} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
