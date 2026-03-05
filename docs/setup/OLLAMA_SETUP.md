# Настройка Ollama для локального тестирования

## Установка Ollama

1. **Скачайте и установите Ollama:**
   - Windows: https://ollama.ai/download/windows
   - macOS: https://ollama.ai/download/mac
   - Linux: https://ollama.ai/download/linux

2. **Проверьте установку:**
   ```bash
   ollama --version
   ```

## Загрузка модели Qwen 2B

### Рекомендуемая модель: Qwen2.5-2B-Instruct

```bash
# Загрузка модели (размер ~1.5 GB)
ollama pull qwen2.5:2b-instruct
```

### Альтернативные модели Qwen 2B:

```bash
# Базовая версия (без инструкций)
ollama pull qwen2.5:2b

# Квантизованная версия (меньше размер, быстрее)
ollama pull qwen2.5:2b-instruct-q4_K_M
```

## Проверка работы

```bash
# Проверка доступных моделей
ollama list

# Тестовый запрос
ollama run qwen2.5:2b-instruct "Hello, how are you?"
```

## Использование в проекте

После установки Ollama и загрузки модели запустите пример:

```bash
npm run example:ollama
```

Или в коде:

```typescript
import { AgentRuntime, LLMConfig } from './src/agent';

const llmConfig: LLMConfig = {
  provider: 'ollama',
  model: 'qwen2.5:2b-instruct',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  maxTokens: 2000
};

const agentRuntime = new AgentRuntime(gateway, llmConfig);
```

## API Ollama

Ollama предоставляет REST API на `http://localhost:11434`:

- `GET /api/tags` - список моделей
- `POST /api/chat` - чат с моделью
- `POST /api/generate` - генерация текста

## Troubleshooting

### Ollama не запускается

1. Проверьте, что Ollama запущен:
   ```bash
   # Windows
   Get-Process ollama
   
   # Linux/Mac
   ps aux | grep ollama
   ```

2. Перезапустите Ollama сервис

### Модель не найдена

```bash
# Проверьте список моделей
ollama list

# Если модели нет, загрузите её
ollama pull qwen2.5:2b-instruct
```

### Порт 11434 занят

Измените порт в конфигурации Ollama или используйте другой порт в `baseUrl`.

## Производительность

Qwen 2B работает на:
- CPU: медленно, но работает
- GPU (NVIDIA): значительно быстрее
- Apple Silicon (M1/M2/M3): хорошо оптимизировано

Для лучшей производительности рекомендуется использовать GPU.

## Дополнительные модели

Если нужны другие модели для тестирования:

```bash
# Более мощные модели (требуют больше памяти)
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:14b-instruct

# Меньшие модели (быстрее, но менее способные)
ollama pull qwen2.5:1.5b-instruct
```
