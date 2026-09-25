/**
 * Loses Ende: ein Tag hat etwas fuer einen spaeteren Tag angekuendigt — der ist
 * vorbei, niemand hat seitdem etwas dazu gesagt.
 *
 * Die ganze Erkennung steckt in `findLooseEnds()` (`@core/journal`, 020 D1) —
 * dieser Check liest nur den Index, ruft sie auf und macht aus jedem Fund einen
 * `GardenerFinding`. Kein Modell hier: die Deutung durch ein Modell ist eine
 * eigene, spaetere Stufe (`modelLooseEnds`, D4), die `report.ts` nach den Checks
 * fuehrt — sie benutzt dieselbe Eingabe (`looseEndInput`) und dieselbe Abbildung
 * (`looseEndFinding`) wie dieser Check, damit ein loses Ende in beiden Wegen
 * dieselbe Kennung und dieselbe Gestalt hat.
 *
 * Schwere `info`: eine liegengebliebene Erwaehnung kostet einen Blick, keinen
 * Vertrauensverlust — dieselbe Einstufung wie `orphan`. Kein Fix: was daraus
 * folgt (nachfragen, ein Todo anlegen, den Tag verlinken), kann nur ein Mensch
 * entscheiden, die App wuerde sonst eine Antwort erfinden.
 */

import { looseEndsDerived } from '@core/journal';
import type { LooseEndDay, LooseEndTodo } from '@core/journal';
import type { GardenerFinding, LooseEnd } from '@shared/types';
import { buildFinding } from '../types';
import type { Check, GardenerContext } from '../types';

/** Ein Tag des Index, wie `findLooseEnds` ihn braucht — Rumpf und Zeile fehlen
 * bei einem Tag ohne indizierte Datei, dann faellt er still heraus. */
function looseEndDayOf(
  ctx: Pick<GardenerContext, 'index'>,
  day: { date: string; path: string },
): LooseEndDay | null {
  const doc = ctx.index.index().byPath.get(day.path);
  if (doc === undefined) return null;
  return { day, doc: { body: doc.body, bodyLine: doc.bodyLine } };
}

/**
 * Tage und Todos des Index — die Eingabe beider Stufen, Heuristik und Modell.
 * Nimmt bewusst nur `ctx.index` (`Pick<GardenerContext, 'index'>`) statt des
 * ganzen Laufkontexts: `journal:interviewPlan` (020, D8) braucht dieselben
 * zwei Listen fuer seine Frage nach einem losen Ende, hat aber keinen echten
 * Pflegelauf-Kontext (kein `labels`, kein `ranAt`) zur Hand — ein zweites Mal
 * dieselbe Ableitung zu schreiben waere die Kopie, die diese Funktion gerade
 * vermeidet.
 */
export function looseEndInput(ctx: Pick<GardenerContext, 'index'>): {
  days: LooseEndDay[];
  todos: LooseEndTodo[];
} {
  return {
    days: ctx.index
      .journal()
      .map((entry) => looseEndDayOf(ctx, entry))
      .filter((entry): entry is LooseEndDay => entry !== null),
    todos: ctx.index.todos().map((todo) => ({ text: todo.text, due: todo.due })),
  };
}

/**
 * Ein Fund als Befund. Die Herkunft kommt vom Fund selbst mit: die Heuristik
 * liefert `heuristic`, die Modellstufe `model` — der Screen kann damit je Befund
 * sagen, wer ihn gefunden hat (AC 11), und nicht nur je Lauf.
 */
export function looseEndFinding(ctx: GardenerContext, looseEnd: LooseEnd): GardenerFinding {
  const text = ctx.labels.looseEnd(looseEnd.quote, looseEnd.day);
  return {
    ...buildFinding(ctx, {
      kind: 'loose-end',
      severity: 'info',
      title: text.title,
      detail: text.detail,
      paths: [looseEnd.path],
      module: null,
      key: [looseEnd.id],
      fix: null,
    }),
    origin: looseEnd.origin,
  };
}

export const looseEndCheck: Check = {
  kind: 'loose-end',

  run(ctx: GardenerContext): GardenerFinding[] {
    return looseEndsDerived(ctx.index.index(), ctx.today).looseEnds.map((looseEnd) =>
      looseEndFinding(ctx, looseEnd),
    );
  },
};
