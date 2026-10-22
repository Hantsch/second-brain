/* Opening a terminal in the vault with Claude Code started. Nothing in the vault
   changes, so there is nothing to invalidate. */

import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { TerminalIntent, TerminalLaunchResult } from '@shared/types';
import { api } from '../api';

export function useLaunchAgentTerminal(): UseMutationResult<
  TerminalLaunchResult,
  unknown,
  TerminalIntent
> {
  return useMutation({ mutationFn: (intent: TerminalIntent) => api.agent.launchTerminal(intent) });
}
