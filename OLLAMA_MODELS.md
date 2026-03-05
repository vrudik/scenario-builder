# Доступные модели Ollama для тестирования

## Популярные модели для Agent Runtime

### Маленькие модели (быстрые, для тестирования)

```bash
# Llama 3.2 1B (рекомендуется для начала)
ollama pull llama3.2:1b

# Phi-3 Mini (Microsoft)
ollama pull phi3:mini

# Gemma 2B
ollama pull gemma2:2b
```

### Средние модели (лучшее качество)

```bash
# Llama 3.2 3B
ollama pull llama3.2:3b

# Mistral 7B
ollama pull mistral:7b

# Qwen 7B (если доступна)
ollama pull qwen:7b
```

## Использование в проекте

После загрузки модели обновите конфигурацию в `examples/agent-ollama-example.ts`:

```typescript
const llmConfig: LLMConfig = {
  provider: 'ollama',
  model: 'llama3.2:1b', // или другая загруженная модель
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  maxTokens: 2000
};
```

## Проверка доступных моделей

```bash
# Список загруженных моделей
ollama list

# Тест модели
ollama run llama3.2:1b "Hello, how are you?"
```

## Поиск моделей Qwen

Если нужна именно модель Qwen, проверьте:
1. https://ollama.com/library - список всех доступных моделей
2. Модели могут называться по-другому (qwen2, qwen2.5, qwen:2b и т.д.)
3. Возможно, модель еще не добавлена в библиотеку Ollama

## Рекомендация

Для начала используйте **llama3.2:1b** - это надежная маленькая модель, которая хорошо работает для тестирования Agent Runtime.
