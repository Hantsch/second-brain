/* 034, D7: the argv/path redaction helper — the sibling of `core/llm/
 * redact.ts` for a filesystem path instead of an API key. Mirrors that
 * module's own test style: feed it something that looks like the thing it
 * has to catch, and check the shape survives while the substance doesn't.
 */

import { describe, expect, it } from 'vitest';
import {
  redactCommandLine,
  redactPathLikeStrings,
  safeLlamaLogLine,
} from '../../../../src/main/ipc/runtime/llamacpp-log-safety';

describe('redactPathLikeStrings', () => {
  it('removes a Windows drive-letter path', () => {
    const text = 'engine failed reading C:\\Users\\alice\\AppData\\models\\model-7b.gguf';
    const result = redactPathLikeStrings(text);
    expect(result).not.toContain('alice');
    expect(result).not.toContain('\\');
    expect(result).toBe('engine failed reading <redacted>');
  });

  it('removes a POSIX-style path', () => {
    const text =
      'binary not found at /home/alice/.local/share/gaston/runtimes/llamacpp/llama-server';
    const result = redactPathLikeStrings(text);
    expect(result).not.toContain('alice');
    expect(result).not.toContain('/');
  });

  it('removes a bare .gguf file name with no separator', () => {
    expect(redactPathLikeStrings('missing model-7b.Q4_K_M.gguf')).toBe('missing <redacted>');
  });

  it('leaves ordinary text without a path shape untouched', () => {
    expect(redactPathLikeStrings('the engine did not answer in time')).toBe(
      'the engine did not answer in time',
    );
  });
});

describe('redactCommandLine', () => {
  it('redacts the model path that follows -m, and every other path-shaped token', () => {
    const argv = [
      '-ngl',
      '28',
      '-c',
      '4096',
      '-t',
      '6',
      '--port',
      '11435',
      '-m',
      'C:\\Users\\alice\\AppData\\Roaming\\gaston\\models\\gguf\\secret-model.gguf',
    ];
    const result = redactCommandLine(argv);
    expect(result).not.toContain('alice');
    expect(result).not.toContain('secret-model');
    expect(result).not.toContain('\\');
    // The flags D1 actually derives survive untouched — only the path is gone.
    expect(result).toBe('-ngl 28 -c 4096 -t 6 --port 11435 -m <redacted>');
  });

  it('redacts a path passed via --model even without a leading separator', () => {
    const result = redactCommandLine(['--model', 'model.gguf']);
    expect(result).toBe('--model <redacted>');
  });

  it('leaves an argv with no path in it completely unchanged', () => {
    expect(redactCommandLine(['-ngl', '0', '-c', '2048', '-t', '4'])).toBe('-ngl 0 -c 2048 -t 4');
  });
});

describe('safeLlamaLogLine', () => {
  it('passes a bare, static message through unchanged', () => {
    expect(safeLlamaLogLine('[llamacpp] provider baseUrl konnte nicht aktualisiert werden')).toBe(
      '[llamacpp] provider baseUrl konnte nicht aktualisiert werden',
    );
  });

  it('still catches a path if a future edit interpolated one into the message', () => {
    const hypothetical = safeLlamaLogLine(
      '[llamacpp] start failed for D:\\vault\\models\\gguf\\private-notes-model.gguf',
    );
    expect(hypothetical).not.toContain('private-notes-model');
    expect(hypothetical).not.toContain('\\');
  });
});
