/* `loadExistingOutcome` rehydrates the small outcome a manual re-condense needs.
   Kernfrage: bleibt eine url-Quelle, die der erste Durchlauf schon als `no-content`
   verworfen hat, auch beim manuellen Verdichten leer — statt aus der rohen Datei
   (Frontmatter + Ueberschrift) wieder als „echter" Fund aufzutauchen? */

import { describe, expect, it } from 'vitest';
import { loadExistingOutcome, writeIngestLog } from '@core/ingest';
import { memoryStore } from './fakes';

const RAW_PATH = 'raw/web/2026-08-10-leere-seite.md';

// Frontmatter + Ueberschrift allein liegen weit ueber 0 Zeichen — genau das Problem,
// das die no-content-Sperre in `loadExistingOutcome` beheben muss.
const RAW_FILE = [
  '---',
  'doc_type: web',
  'title: Leere Seite',
  'origin: https://example.org/leer',
  'fetched_at: 2026-08-10T14:32:00+02:00',
  '---',
  '',
  '# Leere Seite',
  '',
].join('\n');

describe('loadExistingOutcome', () => {
  it('haelt eine als no-content markierte url-Quelle beim erneuten Verdichten leer', async () => {
    const store = memoryStore({ [RAW_PATH]: RAW_FILE });
    await writeIngestLog(store, RAW_PATH, {
      kind: 'url',
      origin: 'https://example.org/leer',
      ingestedAt: '2026-08-10T14:32:00+02:00',
      title: 'Leere Seite',
      sourcePage: null,
      modules: [],
      provenance: { content: 'fetch', metadata: 'fetch' },
      notes: [{ code: 'no-content' }],
    });

    const outcome = await loadExistingOutcome(store, RAW_PATH);

    expect(outcome.text).toBe('');
    expect(outcome.notes).toEqual([{ code: 'no-content' }]);
  });

  it('liest den echten Dateitext, wenn keine no-content-Notiz vorliegt', async () => {
    const store = memoryStore({ [RAW_PATH]: RAW_FILE });
    await writeIngestLog(store, RAW_PATH, {
      kind: 'url',
      origin: 'https://example.org/leer',
      ingestedAt: '2026-08-10T14:32:00+02:00',
      title: 'Leere Seite',
      sourcePage: null,
      modules: [],
      provenance: { content: 'fetch', metadata: 'fetch' },
      notes: [{ code: 'awaiting-llm' }],
    });

    const outcome = await loadExistingOutcome(store, RAW_PATH);

    expect(outcome.text).toBe(RAW_FILE);
  });
});
