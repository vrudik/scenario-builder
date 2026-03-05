# Конструктор автономных сценариев и агентных процессов

Платформа для создания и запуска автономных сценариев на основе декларативной спецификации с автоматическими гейтами качества, стоимости и безопасности.

## Архитектура

Система построена на принципах:
- **Spec-as-Source-of-Truth**: Декларативная спецификация как единственный источник правды
- **Orchestration-first**: Durable execution с восстановлением по истории событий
- **Event-driven**: Event streaming как транспорт и дисциплина
- **Contract-driven**: Контракты между компонентами

## Компоненты

1. **Scenario Spec** - декларативная спецификация сценариев (JSON Schema)
2. **Scenario Builder/Compiler** - компиляция Spec → workflow graph → артефакты
3. **Tool Registry + Tool Gateway** - регистрация инструментов и контроль доступа
4. **Runtime** - event-driven исполнение с durable orchestration
5. **Agent Runtime** - tool calling + память (short-term + RAG)
6. **Observability** - трассировка и мониторинг (OpenTelemetry)

## Технологический стек

- **Orchestration**: Temporal (durable execution)
- **Event Streaming**: Apache Kafka
- **Tool Calling**: OpenAI Function Calling API
- **Memory**: RAG (Retrieval-Augmented Generation)
- **Observability**: OpenTelemetry
- **Policy Engine**: OPA (Open Policy Agent)

## Структура проекта

```
.
├── src/
│   ├── spec/              # Scenario Spec схемы и валидаторы
│   ├── builder/           # Scenario Builder/Compiler
│   ├── agent/             # Agent Runtime (router, tool calling, memory, guardrails)
│   ├── registry/          # Tool Registry
│   ├── gateway/           # Tool Gateway
│   ├── runtime/           # Runtime исполнение (в разработке)
│   ├── agent/            # Agent Runtime (в разработке)
│   ├── observability/     # Observability компоненты (в разработке)
│   └── policies/         # Политики безопасности (в разработке)
├── examples/              # Примеры использования
└── tests/                # Тесты и eval-кейсы
```

## Реализованные компоненты

### ✅ Scenario Spec
- Декларативная спецификация сценариев на основе Zod схем
- Валидация спецификаций
- Поддержка триггеров, инструментов, риск-классов, SLA

### ✅ Scenario Builder/Compiler
- Компиляция Spec → Workflow Graph
- Генерация политик исполнения (guardrails)
- Генерация deployment descriptors

### ✅ Tool Registry
- Регистрация и управление инструментами
- Хранение метаданных (SLA, авторизация, идемпотентность)
- Поиск и фильтрация инструментов

### ✅ Tool Gateway
- Контроль доступа на основе политик
- Rate limiting и circuit breaking
- Sandbox режим для тестирования
- Логирование и трассировка

### ✅ Runtime Orchestrator
- Event-driven исполнение сценариев
- Durable execution с восстановлением после сбоев
- Retry механизмы с экспоненциальным backoff
- Saga pattern для компенсации транзакций
- Интеграция с Temporal (базовая структура)

## В разработке

- Agent Runtime (tool calling + память)
- Observability (OpenTelemetry интеграция)
- CI/CD pipeline

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск локальной разработки
npm run dev

# Запуск примера
npm run example

# Запуск тестов
npm test
```

## Пример использования

```typescript
import { ScenarioSpecValidator, ScenarioBuilder } from './src';
import { ToolRegistry } from './src/registry';
import { ToolGateway } from './src/gateway';

// Загрузка и валидация спецификации
const validator = new ScenarioSpecValidator();
const spec = validator.parse(specJson);

// Компиляция в workflow graph
const builder = new ScenarioBuilder();
const workflowGraph = builder.compile(spec);
const policy = builder.generateExecutionPolicy(spec);

// Регистрация инструментов
const registry = new ToolRegistry();
registry.register(tool);

// Настройка gateway
const gateway = new ToolGateway();
gateway.setPolicy(policy);
```

См. `examples/usage.ts` для полного примера.

## Лицензия

MIT
