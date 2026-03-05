# Observability Module

Модуль для трассировки, метрик и логирования на основе OpenTelemetry.

## Компоненты

### 1. Tracer (`tracer.ts`)
- Трассировка выполнения операций
- Создание и управление spans
- Корреляция трассировок между компонентами
- Экспорт в Jaeger

### 2. Metrics (`metrics.ts`)
- Счетчики (counters)
- Гистограммы (histograms)
- Up-down счетчики
- Экспорт в Prometheus

### 3. Logger (`logger.ts`)
- Структурированное логирование в JSON
- Корреляция с трассировкой (traceId/spanId)
- Уровни логирования
- Контекстные метаданные

## Использование

### Инициализация

```typescript
import { initializeObservability } from './observability';

initializeObservability({
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  jaegerEndpoint: 'http://localhost:14268/api/traces',
  prometheusPort: 9464,
  enabled: true,
  logLevel: 'info',
});
```

### Трассировка

```typescript
import { traceAsync, addSpanAttributes } from './observability';

await traceAsync('operation.name', async (span) => {
  addSpanAttributes({
    'operation.id': '123',
    'operation.type': 'process',
  });
  
  // Ваш код
  await doSomething();
});
```

### Метрики

```typescript
import { systemMetrics } from './observability';

systemMetrics.scenarioExecutions.add(1);
systemMetrics.scenarioDuration.record(0.5);
systemMetrics.agentToolCalls.add(3);
```

### Логирование

```typescript
import { getLogger } from './observability/logger';

const logger = getLogger({ serviceName: 'my-service' });

logger.info('Operation started', { operationId: '123' });
logger.error('Operation failed', error, { operationId: '123' });
```

## Предопределенные метрики

- `scenario_executions_total` - Общее количество выполнений сценариев
- `scenario_duration_seconds` - Длительность выполнения сценариев
- `scenario_success_total` - Успешные выполнения
- `scenario_failures_total` - Неудачные выполнения
- `agent_tool_calls_total` - Количество tool calls
- `agent_tokens_used_total` - Использованные токены
- `agent_llm_calls_total` - Вызовы LLM
- `agent_llm_duration_seconds` - Длительность вызовов LLM
- `tool_executions_total` - Выполнения инструментов
- `tool_duration_seconds` - Длительность выполнения инструментов
- `workflow_executions_total` - Выполнения workflows
- `workflow_duration_seconds` - Длительность выполнения workflows

## Конфигурация

### Переменные окружения

- `OTEL_ENABLED` - Включить/выключить observability (по умолчанию: true)
- `JAEGER_ENDPOINT` - Endpoint для Jaeger (по умолчанию: http://localhost:14268/api/traces)
- `PROMETHEUS_PORT` - Порт для Prometheus метрик (по умолчанию: 9464)
- `LOG_LEVEL` - Уровень логирования: debug, info, warn, error (по умолчанию: info)

## Graceful Shutdown

```typescript
import { shutdownObservability } from './observability';

await shutdownObservability();
```
