import { describe, expect, it } from 'vitest';
import { parseParamsB } from '@core/llm/hf/params';

/* 034, D2: the parameter count feeds `LlamaModelFile.paramsB` when 033 has
   persisted no metadata catalog to read it from — the filename is what is
   left, mirroring `quant.test.ts`'s fixtures for the same GGUF uploads. */

describe('parseParamsB', () => {
  it.each([
    ['llama-2-7b-chat.Q4_K_M.gguf', 7],
    ['qwen2.5-1.5b-instruct-q4_k_m.gguf', 1.5],
    ['Meta-Llama-3.1-13B-Instruct-Q4_K_S.gguf', 13],
  ])('parses %s → %s billion params', (filename, expected) => {
    expect(parseParamsB(filename)).toBe(expected);
  });

  it('returns null for a filename with no recognisable parameter token', () => {
    expect(parseParamsB('model-full-precision-weights.gguf')).toBeNull();
  });
});
