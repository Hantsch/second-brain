/* The `claude` CLI's presence on this machine.

   Only a PATH lookup through `@core/agent` — nothing is started, so the answer
   is cheap and safe to ask whenever the settings tab opens. (story 083) */

import fs from 'node:fs';
import { findClaudeCli } from '../../core/agent/cli-presence';
import type { AgentCliStatus } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

/* On Windows `process.env` is case-insensitive, so `PATH` finds `Path`. */
export function detectClaudeCli(): Promise<AgentCliStatus> {
  return findClaudeCli({
    pathValue: process.env.PATH ?? '',
    pathExt: process.env.PATHEXT,
    platform: process.platform,
    stat: fs.promises.stat,
  });
}

export function agentHandlers(_services: Services): HandlerMap {
  return defineHandlers({
    'agent:cliStatus': detectClaudeCli,
  });
}
