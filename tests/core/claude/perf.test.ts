/* Der Lauf muss auf einem echten Bestand bezahlbar bleiben: gemessen wurden 290
   Verlaufsdateien in 23 Projektordnern und ~247 MB
   (`../claude-control/docs/RESEARCH.md` §2). Hier stehen 29 Ordner mit je drei
   Dateien von 5 MB — zusammen 435 MB, die niemand laden darf.

   Der Beweis besteht aus zwei Teilen: die Zeit **und** die gelesenen Bytes. Ohne
   die Bytes wäre der Test nur eine Wette auf die Maschine, auf der er läuft. */

import { describe, expect, it } from 'vitest';
import { ClaudeSessionReader } from '@core/claude';
import { FAKE_ROOT, assistant, fakeClaudeFs, jsonl, line, prompt } from './fixtures';
import type { FakeFile } from './fixtures';

/** Eine Verlaufsdatei von ~5 MB. Einmal gebaut, von allen Dateien geteilt. */
function hugeTranscript(): string {
  const head = jsonl([
    prompt('Grosse Sitzung mit viel Werkzeugverkehr', { at: '2026-08-01T08:00:00.000Z' }),
  ]);
  const filler = line(
    assistant('Zwischenschritt mit reichlich Text, damit die Zeile realistisch lang wird.', {
      at: '2026-08-01T08:30:00.000Z',
      file: 'c:\\development\\Hantsch\\second-brain\\src\\core\\index\\build.ts',
    }),
  );
  const parts: string[] = [head];
  let bytes = head.length;
  while (bytes < 5_000_000) {
    parts.push(filler);
    bytes += filler.length + 1;
  }
  parts.push(line(assistant('Ende', { at: '2026-08-01T09:00:00.000Z' })));
  return `${parts.join('\n')}\n`;
}

describe('ClaudeSessionReader über 29 Projekte', () => {
  it('bleibt unter zwei Sekunden und liest nur die Kanten', async () => {
    const text = hugeTranscript();
    expect(text.length).toBeGreaterThan(5_000_000);

    const files: FakeFile[] = [];
    for (let project = 0; project < 29; project += 1) {
      for (let session = 0; session < 3; session += 1) {
        files.push({
          dir: `c--development-projekt-${String(project).padStart(2, '0')}`,
          name: `s-${session}.jsonl`,
          text,
          modified: `2026-08-${String((project % 28) + 1).padStart(2, '0')}T0${session}:00:00.000Z`,
        });
      }
    }
    const fs = fakeClaudeFs({ files });
    const reader = new ClaudeSessionReader({ fs, projectsDir: FAKE_ROOT });

    const started = Date.now();
    const sessions = await reader.list({ limit: 87 });
    const elapsed = Date.now() - started;

    expect(sessions).toHaveLength(87);
    expect(elapsed).toBeLessThan(2000);
    // 87 Dateien, je Kopf- und Endfenster — nicht 435 MB.
    expect(fs.bytesRequested()).toBeLessThan(87 * (64 + 40) * 1024 + 1);
    expect(fs.bytesRequested() / (87 * text.length)).toBeLessThan(0.03);
    // Die Zahl ist geschätzt, nicht gezählt — und sie sagt es (`messageCountExact`).
    expect(sessions[0]?.messageCount).toBeGreaterThan(1000);
  });
});
