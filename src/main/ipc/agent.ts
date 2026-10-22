/* The `claude` CLI's presence on this machine.

   Only a PATH lookup through `@core/agent` — nothing is started, so the answer
   is cheap and safe to ask whenever the settings tab opens. (story 083) */

import fs from 'node:fs';
import { findClaudeCli } from '../../core/agent/cli-presence';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

export function agentHandlers(_services: Services): HandlerMap {
  return defineHandlers({
    /* On Windows `process.env` is case-insensitive, so `PATH` finds `Path`. */
    'agent:cliStatus': () =>
      findClaudeCli({
        pathValue: process.env.PATH ?? '',
        pathExt: process.env.PATHEXT,
        platform: process.platform,
        stat: fs.promises.stat,
      }),
  });
}
