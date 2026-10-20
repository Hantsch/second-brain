/* Answering a loose end (020, D5): the core write (`answerLooseEnd`,
   `stream.ts#appendEntry` underneath) plus the exclusion it enables once the
   answered id is recorded (`main/loose-end-state.ts`) — the same generic
   `dismissed` filter `runGardener` already applies for 017's "looks fine"
   ids (`report.ts`), fed from a different file because answering is its own
   kind of decision (binding decision of 020). */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answerLooseEnd } from '@core/journal';
import { looseEndCheck, runGardener } from '@core/gardener';
import type { GardenerFinding } from '@shared/types';
import { LooseEndState } from '../../../src/main/loose-end-state';
import { day } from '../../helpers/time';
import { SETTINGS, gardenerFixture } from '../gardener/fixtures';
import { journalFile, journalPathOf } from './fixtures';

const NOTARY_DAY = day(-5);
const NOTARY_TEXT = 'Morgen bin ich beim Notar.';
const TODAY = day(0);
const TODAY_PATH = journalPathOf(TODAY);

function onlyLooseEnds(findings: readonly GardenerFinding[]): GardenerFinding[] {
  return findings.filter((finding) => finding.kind === 'loose-end');
}

describe('answerLooseEnd', () => {
  it('schreibt den Rückverweis und den Text unverändert in den heutigen Strom, legt den Tag an', async () => {
    const fixture = await gardenerFixture({
      [journalPathOf(NOTARY_DAY)]: journalFile(NOTARY_DAY, NOTARY_TEXT),
    });
    expect(await fixture.store.stat(TODAY_PATH)).toBeNull();

    const written = await answerLooseEnd(
      fixture.store,
      TODAY,
      NOTARY_DAY,
      'War in zehn Minuten erledigt, alles unterschrieben.',
    );

    expect(written.path).toBe(TODAY_PATH);
    const file = await fixture.text(TODAY_PATH);
    expect(file).toContain(`[[${NOTARY_DAY}]] War in zehn Minuten erledigt, alles unterschrieben.`);
    expect(file).toContain('## Tag');
  });

  it('lehnt einen veralteten Hash ab, statt eine fremde Änderung zu überschreiben', async () => {
    const fixture = await gardenerFixture({
      [journalPathOf(NOTARY_DAY)]: journalFile(NOTARY_DAY, NOTARY_TEXT),
    });
    const first = await answerLooseEnd(fixture.store, TODAY, NOTARY_DAY, 'Erste Antwort.');
    /* Jemand ändert die Datei von außen, während die Antwort noch offen ist. */
    const raw = await fixture.text(TODAY_PATH);
    await fixture.store.writeText(TODAY_PATH, `${raw}\nVon Hand ergänzt.\n`);

    await expect(
      answerLooseEnd(fixture.store, TODAY, NOTARY_DAY, 'Zweite Antwort.', {
        expectedHash: first.hash,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const file = await fixture.text(TODAY_PATH);
    expect(file).toContain('Von Hand ergänzt.');
    expect(file).not.toContain('Zweite Antwort.');
  });

  describe('Ausblendung über einen Lauf hinweg', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'sb-loose-end-state-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('bleibt nach dem Antworten und einem Neustart der Ablage ausgeblendet', async () => {
      const fixture = await gardenerFixture({
        [journalPathOf(NOTARY_DAY)]: journalFile(NOTARY_DAY, NOTARY_TEXT),
      });
      const before = onlyLooseEnds(looseEndCheck.run(fixture.ctx({ settings: SETTINGS })));
      const [target] = before;
      if (target === undefined) throw new Error('kein loses Ende im Fixture-Bestand');

      /* Die Antwort erwähnt "Notar" absichtlich nicht — die Heuristik aus
         `resolutionCheck` (`loose-ends.ts`) würde diesen Fund also NICHT von
         selbst wieder verlieren; nur die ausdrückliche Ablage darf ihn
         ausblenden. */
      const written = await answerLooseEnd(
        fixture.store,
        TODAY,
        NOTARY_DAY,
        'Erledigt, hat gepasst.',
      );

      const state = await LooseEndState.load(root);
      await state.recordAnswered({
        id: target.id,
        day: NOTARY_DAY,
        path: written.path,
        answeredAt: '2026-08-10T09:00:00.000Z',
      });

      /* "Neustart": eine frische Instanz liest dieselbe Datei erneut. */
      const reloaded = await LooseEndState.load(root);
      expect([...reloaded.answeredIds()]).toEqual([target.id]);

      await fixture.refresh();
      const stillFoundByHeuristic = onlyLooseEnds(
        looseEndCheck.run(fixture.ctx({ settings: SETTINGS })),
      );
      expect(stillFoundByHeuristic.map((finding) => finding.id)).toContain(target.id);

      /* Derselbe generische Ausschluss, den `runGardener` schon für 017s
         "passt so" anwendet (`report.ts`) — hier mit den beantworteten
         Kennungen aus der eigenen Ablage statt aus `gardener.json`. */
      const report = await runGardener(fixture.deps(), {
        settings: SETTINGS,
        dismissed: reloaded.answeredIds(),
      });
      expect(onlyLooseEnds(report.findings).map((finding) => finding.id)).not.toContain(target.id);
    });
  });
});
