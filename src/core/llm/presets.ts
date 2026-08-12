/* Vorlagen, mit denen ein Provider in zwei Klicks steht. `hint` ist ein
   i18n-Key; der deutsche Text steht als Kommentar daneben, damit
   `src/renderer/i18n/de.ts` ihn übernehmen kann, ohne dass der Kern Texte kennt. */

import type { ProviderPreset } from '@shared/types';

/** Kennung der Vorlage „beliebige OpenAI-kompatible URL". */
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
    // „Läuft auf dieser Maschine. Kein Schlüssel nötig, erste Wahl für Tagebuch und Dumps."
    hint: 'llm.preset.ollama.hint',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    // „Lokaler Server von LM Studio. Das geladene Modell muss dort aktiv sein."
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
    // „Cloud. Schlüssel bleibt verschlüsselt auf dieser Maschine, Inhalte verlassen sie."
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
    // „Ein Schlüssel für viele Modelle. Gut, um Modelle zu vergleichen."
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
    // „Claude-Modelle über die Messages-API. Stark beim Verdichten und Verknüpfen."
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
    // „Für vLLM, llama.cpp, Azure oder jeden anderen Dienst mit /chat/completions."
    hint: 'llm.preset.custom-openai.hint',
  },
];

/** Vorlage zu einer Kennung, oder null. */
export function findPreset(id: string): ProviderPreset | null {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Braucht dieser Zugang einen Schlüssel? Lokale Runtimes nicht, Cloud immer.
 * Wird an zwei Stellen gebraucht (Registry und Gateway) und darf nicht auseinanderlaufen.
 */
export function needsApiKey(provider: { kind: ProviderPreset['kind']; local: boolean }): boolean {
  if (provider.kind === 'fake') return false;
  return !provider.local;
}
