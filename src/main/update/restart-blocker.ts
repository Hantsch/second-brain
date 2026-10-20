/* What stops an update restart from happening right now.
 *
 * A restart kills in-flight work, so the installer must wait for it. The task
 * check comes first because a running task is the more specific reason to show
 * the user; both are cheap reads of state main already holds.
 */

import { isAnyLlmStreaming } from '../ipc/llm-stream';
import type { Services } from '../services';
import { hasRunningTask } from '../work-queue';

export type RestartBlocker = 'taskRunning' | 'llmStreaming';

/** The reason a restart must wait, or `null` when it is safe. */
export function restartBlocker(services: Services): RestartBlocker | null {
  if (hasRunningTask(services)) return 'taskRunning';
  if (isAnyLlmStreaming()) return 'llmStreaming';
  return null;
}
