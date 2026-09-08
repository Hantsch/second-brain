/* Die Quellen-Verdichtung sagt selbst, wenn sie etwas kuerzen musste (Story 050,
 * D6): der Zusammenfuehrungs-Clamp (`mergeSummariesClampedChars`,
 * `llm/prompts/summarize-source.ts`) schneidet die Teilverdichtungen einer langen
 * Quelle auf das Eingabe-Budget des Modells zu, bevor sie zusammengefuehrt werden.
 * Blieb das unbemerkt, behauptete die Source-Seite Vollstaendigkeit, die sie nicht
 * hatte — genau die Luecke, die die Notiz (`condense/notice.ts`,
 * `<!-- condense:truncation -->`) fuer die Kondensations-Artefakte schon schliesst.
 *
 * Kein Test geht ins Netz: alles laeuft ueber den `FakeProvider`.
 */

import { describe, expect, it } from 'vitest';
import { TRUNCATION_MARKER } from '@core/condense';
import { ingestSource } from '@core/wiki';
import { gatewayWithReplies } from '../../helpers/llm';
import { MODULE, RAW_PATH, wikiFixture } from './fixtures';

/** Absatzweise langer Text ohne Ueberschriften — teilt `splitForSummary` in
 * mehrere Stuecke (mirror des gleichnamigen Textes in `ingest.test.ts`). */
function longSourceText(): string {
  return Array.from({ length: 40 }, (_unused, index) =>
    `Absatz ${index + 1}. ${'wort '.repeat(80)}`.trim(),
  ).join('\n\n');
}

describe('condenseSource: Kuerzungs-Notiz auf der Source-Seite', () => {
  it('sagt auf der Source-Seite, dass die Zusammenfuehrung gekuerzt wurde', async () => {
    const fixture = await wikiFixture();
    // Jede Teilverdichtung ist fuer sich lang genug, dass mehrere davon
    // zusammen den 12.000-Zeichen-Clamp von `mergeSummariesPrompt` sprengen.
    const { gateway } = gatewayWithReplies({ 'summarize-source': 'S'.repeat(5000) });

    const result = await ingestSource(fixture.deps(gateway), {
      rawPath: RAW_PATH,
      module: MODULE,
      title: 'Lange Quelle mit vielen Teilstuecken',
      text: longSourceText(),
    });

    const doc = await fixture.store.read(result.sourcePage);
    expect(doc?.body).toContain(TRUNCATION_MARKER);
    expect(doc?.body).toContain(
      'Zeichen beim Einreichen ans Modell gekürzt, um dessen Eingabe-Budget einzuhalten',
    );
  });

  it('sagt nichts, wenn die Zusammenfuehrung nicht gekuerzt werden musste', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({ 'summarize-source': 'Eine kurze Verdichtung.' });

    const result = await ingestSource(fixture.deps(gateway), {
      rawPath: RAW_PATH,
      module: MODULE,
      title: 'Kurze Quelle',
      text: 'Ein einzelner, kurzer Absatz — passt in ein Stueck.',
    });

    const doc = await fixture.store.read(result.sourcePage);
    expect(doc?.body).not.toContain(TRUNCATION_MARKER);
  });
});

/* Story 050, D7: der Fortschrittsbalken bewegt sich waehrend der Verdichtung,
 * statt vom ersten Modellaufruf bis zum Ende stillzustehen. */
describe('condenseSource/ingestSource: der Fortschritt bewegt sich', () => {
  /** Fuenf Absaetze, gross genug, dass `splitForSummary` sie in fuenf Stuecke teilt. */
  function fiveChunkSourceText(): string {
    return Array.from({ length: 15 }, () => 'x'.repeat(1800)).join('\n\n');
  }

  it('meldet bei jedem Modellaufruf einer mehrteiligen Verdichtung einen steigenden Fortschritt', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({ 'summarize-source': 'Eine Teilverdichtung.' });
    const progress: number[] = [];

    const result = await ingestSource(
      { ...fixture.deps(gateway), onProgress: (value) => progress.push(value) },
      {
        rawPath: RAW_PATH,
        module: MODULE,
        title: 'Quelle mit fuenf Teilstuecken',
        text: fiveChunkSourceText(),
      },
    );

    expect(result.usedLlm).toBe(true);
    // Fuenf Ticks aus dem Verdichtungs-Zyklus, ein sechster fuer den
    // Zusammenfuehrungs-Aufruf, dann ein siebter fuer die Schreibphase — der
    // Balken wandert durchgehend steigend, auch waehrend des (oft groessten)
    // Zusammenfuehrungs-Aufrufs, statt dort stillzustehen (Story 050, D7/AC5).
    expect(progress.length).toBe(7);
    for (let index = 1; index < progress.length; index += 1) {
      expect(progress[index]).toBeGreaterThan(progress[index - 1] ?? -Infinity);
    }
    // Der Merge-Tick liegt strikt zwischen dem letzten Stueck-Tick (0.9) und
    // dem Endwert `1` — ein eigener, sichtbarer Schritt fuer die Zusammenfuehrung.
    const mergeTick = progress.at(-2);
    expect(mergeTick).toBeGreaterThan(0.9);
    expect(mergeTick).toBeLessThan(1);
    expect(progress.at(-1)).toBe(1);
  });

  it('regressiert bei einer einteiligen Quelle nicht', async () => {
    const fixture = await wikiFixture();
    const { gateway } = gatewayWithReplies({ 'summarize-source': 'Eine kurze Verdichtung.' });
    const progress: number[] = [];

    const result = await ingestSource(
      { ...fixture.deps(gateway), onProgress: (value) => progress.push(value) },
      {
        rawPath: RAW_PATH,
        module: MODULE,
        title: 'Kurze Quelle',
        text: 'Ein einzelner, kurzer Absatz — passt in ein Stueck.',
      },
    );

    expect(result.usedLlm).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    for (let index = 1; index < progress.length; index += 1) {
      expect(progress[index]).toBeGreaterThanOrEqual(progress[index - 1] ?? -Infinity);
    }
    expect(progress.at(-1)).toBe(1);
  });
});
