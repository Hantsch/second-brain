import { describe, expect, it } from 'vitest';
import { parseQuantisation } from '@core/llm';

/* Real GGUF filename shapes as uploaded by the community (033, D3) — the
   quantisation token is the whole point of this runtime (Decisions:
   "Quantisation"), so each of these must come back exactly, and a filename
   with no recognisable token must return `undefined`, not throw. */

describe('parseQuantisation', () => {
  it.each([
    ['qwen2.5-1.5b-instruct-q4_k_m.gguf', 'Q4_K_M'],
    ['Meta-Llama-3.1-8B-Instruct-Q4_K_S.gguf', 'Q4_K_S'],
    ['mistral-7b-instruct-v0.2.Q5_K_M.gguf', 'Q5_K_M'],
    ['phi-3-mini-4k-instruct.Q6_K.gguf', 'Q6_K'],
    ['tinyllama-1.1b-chat-v1.0.Q8_0.gguf', 'Q8_0'],
    ['gemma-2-2b-it.Q2_K.gguf', 'Q2_K'],
    ['qwen2.5-1.5b-instruct-iq4_xs.gguf', 'IQ4_XS'],
    ['qwen2.5-1.5b-instruct-f16.gguf', 'F16'],
  ])('parses %s → %s', (filename, expected) => {
    expect(parseQuantisation(filename)).toBe(expected);
  });

  it('returns undefined for a filename with no recognisable quantisation token', () => {
    expect(parseQuantisation('model-full-precision-weights.gguf')).toBeUndefined();
  });
});
