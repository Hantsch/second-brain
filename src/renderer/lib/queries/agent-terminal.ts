/* Opening a terminal in the vault with Claude Code started. Nothing in the vault
   changes, so there is nothing to invalidate. */

import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { TerminalLaunchResult } from '@shared/types';
import { api } from '../api';

export function useLaunchAgentTerminal(): UseMutationResult<TerminalLaunchResult, unknown, void> {
  return useMutation({ mutationFn: () => api.agent.launchTerminal() });
}
