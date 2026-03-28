# Investor demo package (краткий конспект)

Документ фиксирует «упаковку» продукта для презентаций: смысл, архитектура, метрики и риски. Детальный сценарий демо — в админке (one-click presentation mode).

## Бизнес-кейс

Автономные сценарии (support, order status и др.): спецификация → компиляция в граф → исполнение через gateway с политиками, аудитом и наблюдаемостью; опционально durable-исполнение (Temporal) и внешняя политика (OPA).

## Архитектура (одним абзацем)

**Spec** (Zod/JSON Schema) → **Builder** (граф, execution policy, deployment descriptor) → **Orchestrator** (in-memory или Temporal) → **Tool Gateway** (rate limit, circuit breaker, sandbox, OPA) → **Agent Runtime** (router, guardrails, cost, LLM: Ollama / OpenAI). События — Kafka (опционально), метрики — OpenTelemetry / Prometheus.

## KPI на демо-экране

- Success rate прогонов.
- Задержка (TTFR / duration).
- Оценка стоимости за run (токены / эвристика).

## Guardrails и доверие

- Локальная политика инструментов из spec + опционально OPA (`OPA_URL`).
- Маскирование PII во входе OPA при medium/high классификации.
- Аудит вызовов инструментов с учётом `deploymentLane` (canary / stable).

## Риски (честно)

- LLM-галлюцинации и обход guardrails — снижаются политиками, eval-кейсами и human-in-the-loop для high-risk действий.
- Стоимость API — лимиты в `CostManager`, проброс `cost_guard_exceeded` в OPA input.
- Multi-tenant и marketplace шаблонов — запланированы на следующие фазы (см. `PROGRESS.md`).

## Экспорт для встречи

Из UI демо: экспорт отчёта (JSON / PDF-lite). Технический quick-start: `docs/guides/QUICK_START.md`, веб: `docs/guides/WEB_INSTRUCTIONS.md`.

## Долгий горизонт (enterprise)

Федерация политик, изоляция данных по арендаторам, сертификации — вне текущего MVP; закладываются модульностью policy/gateway и отдельным слоем хранения выполнений.
