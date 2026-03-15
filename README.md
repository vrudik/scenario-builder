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

# Веб-интерфейс (лёгкий сервер, порт по умолчанию 3000)
npm run web

# Полный сервер с Agent Runtime, сценариями, очередями, админкой
node server.cjs

# Запуск примера
npm run example

# Запуск тестов
npm test
```

Порт для `npm run web` задаётся переменной окружения: `PORT=3001 npm run web` (Linux/macOS) или `$env:PORT=3001; npm run web` (PowerShell). Если порт 3000 занят, освободите его или задайте другой PORT.


## Режимы запуска (единая точка входа для Phase 0)

Для демонстраций и разработки используйте один из двух режимов:

1. **Demo/light mode** (быстрый старт UI + заглушки API):
   ```bash
   npm run web
   ```

2. **Full mode** (полный сервер с Agent Runtime/очередями/API):
   ```bash
   node server.cjs
   ```

Рекомендуемый baseline-check после `npm install`:

```bash
npm run typecheck
npm run build
npm test -- --run
```

Минимальные переменные окружения добавлены в `.env.example` (скопируйте в `.env` и при необходимости настройте значения).

Healthchecks:
- `GET /healthz` (`/api/health`) — liveness
- `GET /readyz` (`/api/ready`) — readiness

Контейнерный runbook: `docs/guides/CONTAINER_RUNBOOK.md`.

## Демо сквозного теста с предзаполненными данными

Этот проект включает отдельный интерфейс для быстрого smoke/e2e прогона с фиксированным тестовым payload.

```bash
npm install
npm run web
```

После запуска откройте:
- `http://localhost:3000` — главная страница (кнопки «Админский интерфейс» и «Демо сквозного теста»)
- `http://localhost:3000/demo-e2e.html` — экран демо сквозного теста
- `http://localhost:3000/test-agent.html` — тест Agent Runtime (для полного агента запускайте `node server.cjs`)

Порядок проверки:
1. Нажмите **«1. Проверить предзаполненные данные»**.
2. Убедитесь, что отобразился сценарий `demo-order-support` и входные поля `customerId/orderId/message`.
3. Нажмите **«2. Запустить сквозной тест»**.
4. Убедитесь, что итоговый статус — `PASSED`, а в результате есть шаги выполнения.

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
