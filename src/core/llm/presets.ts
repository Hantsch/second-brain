/* Presets that get a provider set up in two clicks. `hint` is an i18n key;
   the German text sits next to it as a comment, so `src/renderer/i18n/de.ts`
   can adopt it verbatim without the core knowing any UI text. */

import type { ProviderPreset } from '@shared/types';

/** ID of the "any OpenAI-compatible URL" preset. */
export const CUSTOM_PRESET_ID = 'custom-openai';

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    // "Runs on this machine. No key needed, first choice for journal and dumps."
    hint: 'llm.preset.ollama.hint',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8080/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    // "Runs on this machine. Control over GPU offload and context — the
    //  choice for weak hardware where Ollama decides them for you."
    hint: 'llm.preset.llamacpp.hint',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    // "Local server from LM Studio. The loaded model must be active there."
    hint: 'llm.preset.lmstudio.hint',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    local: false,
    canListModels: true,
    // "Cloud. The key stays encrypted on this machine, the content leaves it."
    hint: 'llm.preset.openai.hint',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    local: false,
    canListModels: true,
    // "One key for many models. Good for comparing models."
    hint: 'llm.preset.openrouter.hint',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    local: false,
    canListModels: true,
    // "Claude models via the Messages API. Strong at condensing and linking."
    hint: 'llm.preset.anthropic.hint',
  },
  {
    id: CUSTOM_PRESET_ID,
    label: 'Eigene OpenAI-kompatible URL',
    kind: 'openai-compatible',
    baseUrl: '',
    needsKey: false,
    local: false,
    canListModels: true,
    // "For vLLM, llama.cpp, Azure, or any other service with /chat/completions."
    hint: 'llm.preset.custom-openai.hint',
  },
];

/** Preset for an ID, or null. */
export function findPreset(id: string): ProviderPreset | null {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Does this connection need a key? Local runtimes never, cloud always.
 * Needed in two places (registry and gateway) and must not drift apart.
 */
export function needsApiKey(provider: { kind: ProviderPreset['kind']; local: boolean }): boolean {
  if (provider.kind === 'fake') return false;
  return !provider.local;
}
