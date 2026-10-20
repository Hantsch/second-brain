/* Der eine Check ausserhalb von Modulen und Wiki: lose Enden aus dem Tagebuch
   (020, D2). Die ganze Erkennung steckt in `findLooseEnds` (D1, eigener Test in
   `tests/core/journal/loose-ends.test.ts`) — hier geht es nur um den Vertrag mit
   dem Pflegelauf: Schwere, Fix, Herkunft, Pfad, Kennung über zwei Läufe hinweg,
   die beiden Beschriftungen, und die `LLM_ONLY_KINDS`-Ausnahme beim Ausblenden. */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingId, looseEndCheck } from '@core/gardener';
import { GERMAN_GARDENER_LABELS } from '@core/gardener';
import { findLooseEnds } from '@core/journal';
import type { GardenerFinding } from '@shared/types';
import { GardenerState } from '../../../src/main/gardener-state';
import { ENGLISH_GARDENER_LABELS } from '../../../src/main/gardener-labels';
import { journalFile, journalPathOf } from '../journal/fixtures';
import { day } from '../../helpers/time';
import { SETTINGS, gardenerFixture } from './fixtures';

/* Zwei Tage, die je etwas für einen Tag ankündigen, der inzwischen vorbei ist
   (TODAY = 2026-08-10, `tests/helpers/time.ts`) — und niemand hat seither etwas
   dazu gesagt: kein späterer Tag verlinkt zurück, kein Todo trägt eine Frist. */
const NOTARY_DAY = day(-5);
const NOTARY_TEXT = 'Morgen bin ich beim Notar.';
const DENTIST_DAY = day(-8);
const DENTIST_TEXT = 'Morgen habe ich einen Zahnarzttermin.';

function twoAnnouncingDays(): Record<string, string> {
  return {
    [journalPathOf(NOTARY_DAY)]: journalFile(NOTARY_DAY, NOTARY_TEXT),
    [journalPathOf(DENTIST_DAY)]: journalFile(DENTIST_DAY, DENTIST_TEXT),
  };
}

function of(findings: readonly GardenerFinding[]): GardenerFinding[] {
  return findings.filter((finding) => finding.kind === 'loose-end');
}

describe('looseEndCheck', () => {
  it('meldet zwei Tage mit unbeantworteter Ankündigung: info, ohne Fix, heuristisch, mit Tagesdatei', async () => {
    const fixture = await gardenerFixture(twoAnnouncingDays());

    const findings = of(looseEndCheck.run(fixture.ctx({ settings: SETTINGS })));

    expect(findings).toHaveLength(2);
    for (const finding of findings) {
      expect(finding.severity).toBe('info');
      expect(finding.fix).toBeNull();
      expect(finding.origin).toBe('heuristic');
      expect(finding.paths).toHaveLength(1);
    }
    const paths = findings.map((finding) => finding.paths[0]).sort();
    expect(paths).toEqual([journalPathOf(DENTIST_DAY), journalPathOf(NOTARY_DAY)].sort());
  });

  it('nennt in beiden Sprachen das Zitat und den Tag', () => {
    const de = GERMAN_GARDENER_LABELS.looseEnd(NOTARY_TEXT, NOTARY_DAY);
    const en = ENGLISH_GARDENER_LABELS.looseEnd(NOTARY_TEXT, NOTARY_DAY);

    for (const text of [de, en]) {
      const combined = `${text.title} ${text.detail}`;
      expect(combined).toContain(NOTARY_TEXT);
      expect(combined).toContain(NOTARY_DAY);
    }
  });

  it('gibt über zwei Läufe — auch nach Neuaufbau des Index — dieselben Kennungen', async () => {
    const files = twoAnnouncingDays();
    const first = await gardenerFixture(files);
    const second = await gardenerFixture(files);

    const firstIds = of(looseEndCheck.run(first.ctx({ settings: SETTINGS })))
      .map((finding) => finding.id)
      .sort();
    const secondIds = of(looseEndCheck.run(second.ctx({ settings: SETTINGS })))
      .map((finding) => finding.id)
      .sort();

    expect(secondIds).toEqual(firstIds);
    expect(firstIds).toHaveLength(2);
    /* Die Kennung ist deterministisch aus der Ableitung selbst gebaut — derselbe
       Aufbau, den `buildFinding` mit `findingId('loose-end', looseEnd.id)` macht
       (`src/core/gardener/checks/loose-end.ts`). */
    const [notary] = findLooseEnds(
      [
        {
          day: { date: NOTARY_DAY, path: journalPathOf(NOTARY_DAY) },
          doc: { body: `## Tag\n\n${NOTARY_TEXT}\n`, bodyLine: 8 },
        },
      ],
      [],
      '2026-08-10',
    );
    expect(notary).toBeDefined();
    expect(firstIds).toContain(findingId('loose-end', notary?.id ?? ''));
  });

  describe('LLM_ONLY_KINDS: ein ausgeblendeter Fund über einen Lauf ohne Modell hinweg', () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'sb-gardener-loose-end-'));
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('bleibt ausgeblendet, statt vom nächsten Lauf wieder gezeigt zu werden', async () => {
      const fixture = await gardenerFixture(twoAnnouncingDays());
      const findings = of(looseEndCheck.run(fixture.ctx({ settings: SETTINGS })));
      const [target] = findings;
      if (target === undefined) throw new Error('kein loses Ende im Fixture-Bestand');

      const state = await GardenerState.load(root, '2026-08-10');
      await state.save({
        ranAt: '2026-08-10T09:00:00.000Z',
        usedLlm: true,
        findings,
        advice: [],
        size: 5,
      });
      await state.dismiss(target.id);

      /* Ein Lauf ohne Modell hat nach diesem Fund gar nicht gesucht — sein
         Schweigen sagt zu ihm nichts (`LLM_ONLY_KINDS`). Er bleibt ausgeblendet,
         statt beim nächsten Lauf wieder aufzutauchen. */
      await state.save({
        ranAt: '2026-08-10T09:05:00.000Z',
        usedLlm: false,
        findings: [],
        advice: [],
        size: 5,
      });

      expect([...state.dismissed()]).toEqual([target.id]);
    });
  });
});
