# Текущий статус проекта

## ✅ Что уже реализовано (MVP - частично)

### 1. Scenario Spec ✅
- [x] JSON Schema/Zod схемы для валидации
- [x] Все основные блоки: Goal/Outcome, Triggers, Allowed Actions, Data Contract, Non-functional, Risk Class, Observability Spec

### 2. Scenario Builder/Compiler ✅
- [x] Компиляция Spec → Workflow Graph
- [x] Генерация политик исполнения (guardrails)
- [x] Генерация deployment descriptors (canary/shadow)

### 3. Tool Registry ✅
- [x] Регистрация инструментов (3+ инструмента: web-search, database-query, api-call)
- [x] Метаданные: SLA, авторизация, идемпотентность, rate limits

### 4. Tool Gateway ✅
- [x] Контроль доступа на основе политик
- [x] Rate limiting и circuit breaking
- [x] Sandbox режим
- [x] Трассировка

### 5. Runtime Orchestrator ✅
- [x] Event-driven исполнение workflow
- [x] Управление состоянием
- [x] Retry механизмы
- [x] Saga pattern для компенсации
- [x] Интеграция с Agent Runtime

### 6. Agent Runtime ✅
- [x] Router для выбора роли
- [x] Tool calling цикл
- [x] Memory (short-term + RAG)
- [x] Guardrails (prompt injection, insecure output, excessive agency)
- [x] Cost/token management
- [x] Fallback механизм

### 7. Observability ✅
- [x] OpenTelemetry интеграция
- [x] Трассировка (traces)
- [x] Метрики (Prometheus)
- [x] Структурированное логирование
- [x] Dashboard для визуализации

## ❌ Что отсутствует для полного MVP (по ТЗ)

### Критично для MVP:

1. **Event Bus (Kafka)** ✅
   - ТЗ требует: "Event bus: базовая очередь/топик; для event streaming нужна гарантированная доставка, идемпотентность, fault-tolerance"
   - Текущее состояние: ✅ Реализовано
     - Event Bus абстракция и Kafka реализация
     - Публикация событий из Orchestrator
     - Подписка на события
     - Идемпотентность через idempotency keys
     - Graceful degradation (работа без Kafka)
     - Веб-интерфейс для тестирования

2. **Durable Execution (Temporal)** ❌
   - ТЗ требует: "Orchestrator: базовая логика и интеграция durable workflow. Нужно реализовать durable execution/восстановление по истории событий"
   - Текущее состояние: Orchestrator есть, но нет интеграции с Temporal для durable execution
   - Приоритет: **ВЫСОКИЙ** (основа orchestration-first подхода)

3. **Canary Deployment (реальное выполнение)** ⚠️
   - ТЗ требует: "canary" в MVP
   - Текущее состояние: Есть deployment descriptors, но нет реального canary deployment механизма
   - Приоритет: **СРЕДНИЙ**

### Важно для следующего этапа (Should have):

4. **Template Library** ✅
   - ТЗ требует: "Template Library: библиотека шаблонов сценариев (saga, approval, async callbacks, CRM-сценарий, antifraud и т. д.)"
   - Текущее состояние: ✅ Реализовано
     - Библиотека шаблонов с 5 встроенными шаблонами (saga, approval, async-callbacks, crm, antifraud)
     - API для работы с шаблонами (list, get, search, apply)
     - Поддержка параметризации шаблонов
     - Категоризация и тегирование шаблонов
     - Веб-интерфейс для просмотра и применения шаблонов (admin-templates.html)

5. **Eval-кейсы** ✅
   - ТЗ требует: "LLM eval (в т. ч. на prompt injection/безопасность)"
   - Текущее состояние: ✅ Реализовано
     - Библиотека eval-кейсов с 22+ тестовыми кейсами
     - Категории: Prompt Injection, System Prompt Leakage, Jailbreak, Insecure Output, Excessive Agency, Data Leakage, Role Playing
     - Eval Runner для запуска кейсов и проверки результатов
     - API для работы с eval-кейсами (list, get, search, run-case, run-suite)
     - Веб-интерфейс для просмотра и запуска eval-кейсов (admin-testing.html)
     - Интеграция с GuardrailsManager и AgentRuntime
     - Тесты для проверки функциональности

6. **Policy Engine (OPA)** ❌
   - ТЗ требует: "Policy Engine: централизованные политики (allow/deny, approvals, PII-маскирование, cost-guard)"
   - Приоритет: **СРЕДНИЙ**

## 📊 Соответствие MVP требованиям ТЗ

**MVP по ТЗ (строка 188):**
> Must have (MVP): Spec > compile > execute > observe; tool gateway; базовые guardrails; логи; canary.

| Требование | Статус | Комментарий |
|-----------|--------|-------------|
| Spec > compile > execute > observe | ✅ | Полностью реализовано |
| Tool gateway | ✅ | Полностью реализовано |
| Базовые guardrails | ✅ | Реализовано в Agent Runtime |
| Логи | ✅ | Через OpenTelemetry |
| Canary | ⚠️ | Есть descriptors, нет реального выполнения |

**Дополнительные требования MVP (строки 64-71):**
- ✅ Scenario Spec v0.1
- ✅ Tool Registry v0.1 (3+ инструмента)
- ⚠️ Orchestrator (есть, но без Temporal)
- ✅ Event bus (Kafka) - реализовано с graceful degradation
- ✅ Observability
- ✅ Guardrails v0.1

## 🎯 Рекомендации по приоритетам

### Сейчас нужно сделать:

1. **Durable Execution (Temporal)** 🔴
   - Критично для "orchestration-first" подхода
   - Нужно: интеграция Orchestrator с Temporal, восстановление по истории событий

3. **Улучшение веб-интерфейса** 🟡
   - Создание/редактирование сценариев через UI
   - Мониторинг выполнения в реальном времени
   - Управление canary deployments

### После MVP:

4. Template Library
5. Eval-кейсы
6. Policy Engine (OPA)
7. Multi-tenant поддержка

## 🌐 Веб-интерфейс и точка входа

- **Главная страница** (`/`): кнопки «Админский интерфейс» и «Демо сквозного теста» (и в `server.cjs`, и в `src/web/server.ts`).
- **Два способа запуска:**
  - `npm run web` — лёгкий сервер (`src/web/server.ts`), порт через `PORT` (по умолчанию 3000).
  - `node server.cjs` — полный сервер с Agent Runtime, сценариями, очередями, eval, админкой.
- **demo-e2e.html** и **test-agent.html** работают при обоих вариантах; для полного агента нужен `node server.cjs`.
- Исправлена синтаксическая ошибка в `server.cjs` (блок `/api/queues` и закрытие callback `req.on('end')`).

## 📝 Чеклист недавних изменений

- [x] Исправление синтаксиса server.cjs (закрытие req.on, блок queues/scenarios)
- [x] Главная страница: две кнопки (Админка + Демо) в server.cjs и server.ts
- [x] PORT из переменной окружения в server.ts (`process.env.PORT || 3000`)
- [x] API-заглушки для test-agent в server.ts с подсказкой «запустите node server.cjs»
- [x] demo-e2e: поддержка в server.cjs и обработка ошибок в demo-e2e.html

## 📝 Текущие проблемы

1. ✅ Исправлено: "Action node missing toolId" при выборе action-agent workflow
2. ✅ Реализовано: Event Bus (Kafka) с graceful degradation
3. ⚠️ Нужно: Temporal для durable execution
