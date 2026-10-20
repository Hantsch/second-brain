import { describe, expect, it } from 'vitest';
import {
  cheapSizeBand,
  classifyModelTier,
  MIN_LOCAL_PARAMS_B_BY_TIER,
  parameterBillions,
} from '@core/llm';
import type { ModelTier } from '@shared/types';

/* Die Heuristik steuert Vorschläge — sie muss bei echten Modellnamen plausibel
   liegen, nicht perfekt sein. Diese Liste ist der Vertrag. */
const CASES: [string, ModelTier][] = [
  ['claude-opus-4-6', 'strong'],
  ['claude-fable-1', 'strong'],
  ['claude-sonnet-4-5', 'balanced'],
  ['claude-3-5-haiku-latest', 'cheap'],
  ['gpt-4o', 'balanced'],
  ['gpt-4o-mini', 'cheap'],
  ['gpt-4.1-nano', 'cheap'],
  ['gpt-4-turbo', 'balanced'],
  ['o3-mini', 'cheap'],
  ['gpt-oss:120b', 'strong'],
  ['llama3.1:8b', 'cheap'],
  ['llama3.3:70b-instruct-q4_K_M', 'strong'],
  ['meta-llama/llama-3.1-405b-instruct', 'strong'],
  ['qwen2.5:14b', 'balanced'],
  ['qwen2.5-coder:32b', 'balanced'],
  ['qwen3-30b-a3b', 'balanced'],
  ['gemma2:2b', 'cheap'],
  ['mistral-small-latest', 'cheap'],
  ['mistral-large-latest', 'strong'],
  ['mixtral:8x7b', 'balanced'],
  ['deepseek-r1:1.5b', 'cheap'],
  ['gemini-2.5-flash', 'cheap'],
  ['nous-hermes2:10.7b', 'balanced'],
  ['phi4-mini', 'cheap'],
  ['command-r7b', 'cheap'],
  ['ein-unbekanntes-modell', 'balanced'],
];

describe('classifyModelTier', () => {
  for (const [name, expected] of CASES) {
    it(`ordnet ${name} als ${expected} ein`, () => {
      expect(classifyModelTier(name)).toBe(expected);
    });
  }

  it('ist unabhängig von Groß- und Kleinschreibung', () => {
    expect(classifyModelTier('Claude-Opus-4-6')).toBe('strong');
    expect(classifyModelTier('LLaMA3.1:8B')).toBe('cheap');
  });

  it('verwechselt gemini nicht mit mini', () => {
    // Teilzeichenketten würden hier falsch greifen — deshalb wird nach Wörtern getrennt.
    expect(classifyModelTier('gemini-2.5-pro')).toBe('balanced');
    expect(classifyModelTier('minimax-m2')).toBe('balanced');
  });
});

describe('cheapSizeBand', () => {
  it('liegt an den Grenzen 2 / 2.1 / 4 / 4.1 / 8 in der richtigen Bande', () => {
    expect(cheapSizeBand(2)).toBe('tiny');
    expect(cheapSizeBand(2.1)).toBe('small');
    expect(cheapSizeBand(4)).toBe('small');
    expect(cheapSizeBand(4.1)).toBe('mid');
    expect(cheapSizeBand(8)).toBe('mid');
  });

  it('ordnet 1.2B und 8B unterschiedlichen Banden zu', () => {
    expect(cheapSizeBand(1.2)).not.toBe(cheapSizeBand(8));
  });
});

describe('MIN_LOCAL_PARAMS_B_BY_TIER', () => {
  it('hat genau drei Leistungsklassen mit den erwarteten Werten', () => {
    expect(MIN_LOCAL_PARAMS_B_BY_TIER).toEqual({ cheap: 3, balanced: 7, strong: 13 });
  });
});

describe('parameterBillions', () => {
  it('liest die größte Angabe im Namen', () => {
    expect(parameterBillions('qwen3-30b-a3b')).toBe(30);
  });

  it('rechnet Mixture-of-Experts mit der doppelten Expertengröße', () => {
    expect(parameterBillions('mixtral:8x7b')).toBe(14);
  });

  it('gibt null zurück, wenn keine Größe im Namen steht', () => {
    expect(parameterBillions('claude-sonnet-4-5')).toBeNull();
  });
});
