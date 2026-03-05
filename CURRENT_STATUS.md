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

4. **Template Library** ❌
   - ТЗ требует: "Template Library: библиотека шаблонов сценариев (saga, approval, async callbacks, CRM-сценарий, antifraud и т. д.)"
   - Приоритет: **СРЕДНИЙ**

5. **Eval-кейсы** ❌
   - ТЗ требует: "LLM eval (в т. ч. на prompt injection/безопасность)"
   - Приоритет: **СРЕДНИЙ**

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

## 📝 Текущие проблемы

1. ✅ Исправлено: "Action node missing toolId" при выборе action-agent workflow
2. ⚠️ Нужно: Event Bus для event-driven архитектуры
3. ⚠️ Нужно: Temporal для durable execution
