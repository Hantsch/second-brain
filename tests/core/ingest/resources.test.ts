/* YouTube resource reports: transcript mentions plus only links that actually exist. */

import { describe, expect, it, vi } from 'vitest';
import type { LlmGateway } from '@core/llm';
import { analyzeYoutubeResources, sourceFingerprint, youtubeResourceFallback } from '@core/ingest';
import { memoryStore } from './fakes';

const DIR = 'raw/youtube/xOFkpf9KgKg';
const WORKFLOW = 'https://example.org/workflow.json';

function store() {
  return memoryStore({
    [`${DIR}/metadata.json`]: JSON.stringify({
      description: `Download the workflow: ${WORKFLOW}`,
      links: [{ url: WORKFLOW, context: 'Download the workflow' }],
    }),
    [`${DIR}/transcript.timestamped.md`]:
      '- [`00:12:34`](https://youtu.be/xOFkpf9KgKg?t=754) The complete ComfyUI workflow is linked below.\n',
  });
}

function gateway(): LlmGateway {
  return {
    isAvailable: () => true,
    routeFor: () => ({ providerId: 'local', model: 'qwen' }),
    complete: vi.fn(async () => ({
      text: JSON.stringify({
        resources: [
          {
            name: 'ComfyUI workflow',
            mention: 'The complete ComfyUI workflow is linked below.',
            location: 'video',
            timestamp: '00:12:34',
            linkUrls: [WORKFLOW, 'https://invented.example/file.zip'],
          },
        ],
      }),
      model: { providerId: 'local', model: 'qwen' },
      latencyMs: 2,
    })),
    stream: vi.fn(async () => ({
      text: '',
      model: { providerId: 'local', model: 'qwen' },
      latencyMs: 2,
    })),
  };
}

describe('YouTube resource report', () => {
  it('keeps transcript evidence and rejects invented links', async () => {
    const report = await analyzeYoutubeResources({
      store: store(),
      gateway: gateway(),
      rawPath: DIR,
      now: () => new Date('2026-08-12T08:00:00.000Z'),
    });

    expect(report.analyzedWithModel).toBe(true);
    expect(report.model).toBe('local/qwen');
    expect(report.resources).toEqual([
      {
        name: 'ComfyUI workflow',
        mention: 'The complete ComfyUI workflow is linked below.',
        location: 'video',
        timestamp: '00:12:34',
        links: [{ url: WORKFLOW, label: 'Download the workflow' }],
      },
    ]);
    expect(report.descriptionLinks).toHaveLength(1);
  });

  it('shows description links honestly without a model', async () => {
    const report = await youtubeResourceFallback(store(), DIR, '2026-08-12T08:00:00.000Z');

    expect(report.analyzedWithModel).toBe(false);
    expect(report.resources).toEqual([]);
    expect(report.descriptionLinks[0]?.url).toBe(WORKFLOW);
  });
});

describe('source fingerprints', () => {
  it('normalizes YouTube forms, tracking parameters, files, and pasted text', () => {
    expect(sourceFingerprint('youtube', 'https://youtu.be/xOFkpf9KgKg?si=abc')).toBe(
      sourceFingerprint('youtube', 'https://www.youtube.com/watch?v=xOFkpf9KgKg'),
    );
    expect(sourceFingerprint('url', 'https://Example.org/article/?utm_source=newsletter')).toBe(
      sourceFingerprint('url', 'https://example.org/article'),
    );
    expect(sourceFingerprint('file', 'C:\\Users\\Demo\\Source.md')).toBe(
      sourceFingerprint('file', 'c:/users/demo/source.md'),
    );
    expect(sourceFingerprint('text', 'A line\r\n')).toBe(sourceFingerprint('text', 'A line'));
  });
});
