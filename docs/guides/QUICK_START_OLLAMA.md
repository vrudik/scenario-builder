# Быстрый старт с Ollama

## ✅ Установка завершена!

Ollama установлен и модель `llama3.2:1b` загружена.

## Проверка

```powershell
# Проверка версии Ollama
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" --version

# Список загруженных моделей
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" list

# Тест модели
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" run llama3.2:1b "Hello!"
```

## Запуск примера Agent Runtime

```bash
npm run example:ollama
```

Или напрямую:

```bash
npx tsx examples/agent-ollama-example.ts
```

## Использование в коде

```typescript
import { AgentRuntime, LLMConfig } from './src/agent';

const llmConfig: LLMConfig = {
  provider: 'ollama',
  model: 'llama3.2:1b',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  maxTokens: 2000
};

const agentRuntime = new AgentRuntime(gateway, llmConfig);
```

## Другие модели

Если хотите попробовать другие модели:

```bash
# Llama 3.2 3B (больше, лучше качество)
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull llama3.2:3b

# Phi-3 Mini (Microsoft)
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull phi3:mini

# Mistral 7B (еще больше)
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull mistral:7b
```

## Готово к тестированию!

Теперь можно запускать Agent Runtime с локальной моделью.
