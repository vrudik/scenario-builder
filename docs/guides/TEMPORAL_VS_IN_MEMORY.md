# Когда использовать Temporal и когда in-memory оркестратор

## In-memory (`Orchestrator` без `TemporalClient`)

Подходит для:

- Локальной разработки UI и API без инфраструктуры.
- Юнит- и интеграционных тестов с детерминированным временем выполнения.
- Демо и отладки графа сценария, canary-роутинга и gateway без очереди задач.

Ограничения:

- Процесс остановился — состояние выполнения в памяти потеряно (если не дублировать в БД отдельно).
- Нет встроенного распределённого retry/replay на уровне workflow SDK.

## Temporal (`USE_TEMPORAL=true` + worker)

Подходит для:

- Долгоживущих сценариев, переживающих рестарты процесса API.
- Явных гарантий доставки activity и компенсаций при сбоях воркера (повтор по политике Temporal).
- Наблюдаемости через историю workflow (`fetchScenarioWorkflowHistoryJson`).

Требования:

- Запущенный Temporal Server (`temporal server start-dev` или кластер).
- Отдельный процесс воркера: `npm run temporal:worker`.
- Для agent-узлов в worker: `TEMPORAL_ENABLE_AGENT=1` и настроенный LLM (`LLM_PROVIDER`, см. `.env.example`).

## Практическое правило

| Среда | Рекомендация |
|--------|----------------|
| Разработка сценария / веб-демо | In-memory или Temporal — по необходимости проверить durable-путь |
| Staging / production для критичных процессов | Temporal + worker + healthchecks |

## Асинхронный старт

При `TEMPORAL_AWAIT_RESULT=false` workflow стартует без блокировки на результат; итог подтягивается через `Orchestrator.syncTemporalExecutionResult(executionId)` или опрос статуса/history.

## Идемпотентность activity

Activities должны быть безопасны к повторному вызову (retry Temporal). Используйте `idempotencyKey` в `ToolRequestContext` и идемпотентные инструменты в реестре; для внешних side-effect — ключи в хранилище или dedup на стороне API.

### Кэш успешных результатов в БД (worker / retry)

При включённом **`TEMPORAL_ACTIVITY_DEDUP`** (по умолчанию включено, выключение: `0` / `false` / `off`) воркер перед вызовом tool-activity проверяет таблицу `temporal_tool_activity_result` по ключу `workflowId|runId|activityId` (из контекста `@temporalio/activity`). Если запись есть — возвращается сохранённый **успешный** вывод без повторного `gateway.execute`. После успеха результат записывается в БД до ответа Temporal.

Ограничения: окно между успешным вызовом инструмента и записью в БД теоретически остаётся; неуспешные попытки **не** кэшируются, чтобы Temporal мог ретраить. Нужны миграции Prisma и доступ к той же `DATABASE_URL`, что и у API.
