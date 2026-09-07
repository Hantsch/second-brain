/* `reopenIfClosed` (068, D1). Geprüft wird:
   - Ein geschlossener Tag verliert "closed" und bekommt den neuen Hash zurück.
   - Ein offener Tag wird nicht angefasst — kein Schreibvorgang, unveränderter Hash.
   - Ein Schreibvorgang auf veraltetem Hash schlägt fehl, statt zu überschreiben.
   - Ein fehlender Tag meldet sich als not-found. */

import { describe, expect, it } from 'vitest';
import { JournalError, reopenIfClosed, readDay, setClosed } from '@core/journal';
import { NOW_MS } from '../../helpers/time';
import { DAY, DAY_PATH, FRESH_DAY, journalFixture } from './fixtures';

describe('reopenIfClosed', () => {
  it('entfernt "closed" bei einem geschlossenen Tag und liefert den neuen Hash', async () => {
    const fixture = await journalFixture();
    await setClosed(fixture.store, DAY, true, { now: NOW_MS });

    const result = await reopenIfClosed(fixture.store, DAY);

    expect(result.reopened).toBe(true);
    const reread = await readDay(fixture.store, DAY);
    expect(reread?.day.closed).toBeNull();
    expect(reread?.doc.hash).toBe(result.hash);
    const content = await fixture.text(DAY_PATH);
    expect(content).toContain('closed: null');
  });

  it('lässt einen bereits offenen Tag unangetastet', async () => {
    const fixture = await journalFixture();
    const before = await fixture.text(DAY_PATH);
    const beforeDay = await readDay(fixture.store, DAY);

    const result = await reopenIfClosed(fixture.store, DAY);

    expect(result.reopened).toBe(false);
    expect(result.hash).toBe(beforeDay?.doc.hash);
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });

  it('schreibt nicht mit veraltetem Hash', async () => {
    const fixture = await journalFixture();
    await setClosed(fixture.store, DAY, true, { now: NOW_MS });
    const before = await fixture.text(DAY_PATH);

    await expect(
      reopenIfClosed(fixture.store, DAY, { expectedHash: 'von-vorgestern' }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await fixture.text(DAY_PATH)).toBe(before);
  });

  it('meldet einen fehlenden Tag als not-found', async () => {
    const fixture = await journalFixture();
    await expect(reopenIfClosed(fixture.store, FRESH_DAY)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(reopenIfClosed(fixture.store, FRESH_DAY)).rejects.toThrow(JournalError);
  });
});
