/**
 * Единая загрузка LLM-конфига из переменных окружения (worker, execute-orchestrator, тесты).
 */
import type { LLMConfig } from './agent-runtime';

function envString(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function envOptionalNumber(name: string): number | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * LLM_PROVIDER=ollama | openai (по умолчанию ollama).
 * OpenAI: OPENAI_API_KEY, опционально OPENAI_BASE_URL, OPENAI_MODEL.
 * Ollama: OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_TEMPERATURE, OLLAMA_MAX_TOKENS.
 */
export function loadLlmConfigFromEnv(): LLMConfig {
  const providerRaw = envString('LLM_PROVIDER', 'ollama').toLowerCase();
  const provider: LLMConfig['provider'] =
    providerRaw === 'openai' ? 'openai' : 'ollama';

  if (provider === 'openai') {
    return {
      provider: 'openai',
      model: envString('OPENAI_MODEL', 'gpt-4o-mini'),
      apiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
      baseUrl: process.env.OPENAI_BASE_URL?.trim() || undefined,
      temperature: envOptionalNumber('OPENAI_TEMPERATURE') ?? 0.7,
      maxTokens: envOptionalNumber('OPENAI_MAX_TOKENS') ?? 2000
    };
  }

  return {
    provider: 'ollama',
    model: envString('OLLAMA_MODEL', 'llama3.2:1b'),
    baseUrl: envString('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'),
    temperature: envOptionalNumber('OLLAMA_TEMPERATURE') ?? 0.7,
    maxTokens: envOptionalNumber('OLLAMA_MAX_TOKENS') ?? 2000
  };
}
