/* Der Lauf muss auf einem echten Bestand bezahlbar bleiben: gemessen wurden 290
   Verlaufsdateien in 23 Projektordnern und ~247 MB
   (`../claude-control/docs/RESEARCH.md` §2). Hier stehen 29 Ordner mit je drei
   Dateien von 5 MB — zusammen 435 MB, die niemand laden darf.

   Der Beweis sind die gelesenen Bytes — sie hängen nur am Code, nicht an der
   Maschine. Die Zeit dazu misst `scale.perf.test.ts` in der Perf-Spur. */

import { describe, expect, it } from 'vitest';
import { ClaudeSessionReader } from '@core/claude';
import { FAKE_ROOT, fakeClaudeFs, scaleFiles } from './fixtures';

describe('ClaudeSessionReader über 29 Projekte', () => {
  it('liest nur die Kanten', async () => {
    const { text, files } = scaleFiles();
    expect(text.length).toBeGreaterThan(5_000_000);

    const fs = fakeClaudeFs({ files });
    const reader = new ClaudeSessionReader({ fs, projectsDir: FAKE_ROOT });
    const sessions = await reader.list({ limit: 87 });

    expect(sessions).toHaveLength(87);
    // 87 Dateien, je Kopf- und Endfenster — nicht 435 MB.
    expect(fs.bytesRequested()).toBeLessThan(87 * (64 + 40) * 1024 + 1);
    expect(fs.bytesRequested() / (87 * text.length)).toBeLessThan(0.03);
    // Die Zahl ist geschätzt, nicht gezählt — und sie sagt es (`messageCountExact`).
    expect(sessions[0]?.messageCount).toBeGreaterThan(1000);
  });
});
