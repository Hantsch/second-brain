/**
 * Dumps, die zu lange in der Inbox liegen.
 *
 * Die Frist ist keine eigene Einstellung, sondern `overview.staleAfterDays` — die
 * Schwelle, ab der der Ueberblick etwas als stagnierend meldet. Eine zweite Zahl
 * fuer dieselbe Frage waere eine zweite Wahrheit.
 *
 * Gezaehlt werden nur `raw` und `proposed`: ein Dump mit unbeantwortetem Vorschlag
 * ist genauso unsortiert wie ein unberuehrter. **`kept` ist kein Befund** — dieser
 * Status heisst „bleibt bewusst liegen" (VAULT-FORMAT.md), und was der Nutzer
 * ausdruecklich liegen laesst, mahnt die App nicht wieder an. `filed` ist erledigt.
 *
 * Der Fix schreibt nichts: er fuehrt in den Inbox-Screen, wo der Vorschlag steht.
 */

import type { DumpItem, GardenerFinding } from '@shared/types';
import { daysBetween } from '@core/index/dates';
import { asDate } from '@core/index/text';
import { buildFinding, buildFix } from '../types';
import type { Check, GardenerContext } from '../types';

/** Zustaende, die „noch nicht eingeordnet" bedeuten. */
const OPEN_STATUSES: readonly DumpItem['status'][] = ['raw', 'proposed'];

export const unfiledDumpCheck: Check = {
  kind: 'unfiled-dump',

  run(ctx: GardenerContext): GardenerFinding[] {
    const findings: GardenerFinding[] = [];

    for (const dump of ctx.index.dumps()) {
      if (!OPEN_STATUSES.includes(dump.status)) continue;
      const created = asDate(dump.created);
      if (created === null) continue;
      /* Das Alter wird hier neu gerechnet: `ageDays` im Index haengt an der Uhr des
         Indexdienstes, der Befund an dem „heute", das dieser Lauf bekommen hat. */
      const ageDays = daysBetween(created, ctx.today);
      if (ageDays === null || ageDays < ctx.limits.unfiledAfterDays) continue;
      const text = ctx.labels.unfiledDump(dump.title, ageDays);
      findings.push(
        buildFinding(ctx, {
          kind: 'unfiled-dump',
          severity: 'warn',
          title: text.title,
          detail: text.detail,
          paths: [dump.path],
          module: null,
          key: [dump.path],
          fix: buildFix(ctx, 'open-classify'),
        }),
      );
    }
    return findings;
  },
};
