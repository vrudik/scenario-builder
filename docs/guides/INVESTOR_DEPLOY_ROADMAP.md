# Roadmap: от текущего состояния к deploy-ready бизнес-приложению

## Что проверено сейчас

- Репозиторий локально на ветке `work`, commit `f6a125b`.
- У ветки нет upstream/remote tracking, поэтому автоматически подтянуть «последнюю версию из репо» не удалось.
- Тесты проходят (`vitest --run`).
- Сборка и typecheck падают из-за синтаксической ошибки в `src/web/simple-server.ts`.

## Диагноз готовности к демо для инвесторов

### Сильные стороны

1. **Функциональное ядро уже есть**: spec → builder → orchestrator → observability.
2. **Есть тестовая база** и стабильный green по основным unit/integration сценариям.
3. **Есть админские и демо-страницы**, плюс API-слой для сценариев/очередей/agent.
4. **Есть инфраструктурные заделы**: Prisma, Kafka, Temporal, OpenTelemetry, docker-compose.

### Основные блокеры до investor-demo

1. **CI-блокер №1: проект не компилируется (`npm run build`)**.
2. **Durable execution формально заявлен, но Temporal workflow пока заглушка**.
3. **Нет production CI/CD контура (нет `.github/workflows`)**.
4. **Много «статусных» markdown-документов расходятся между собой и создают риск неверного narrative для инвесторов**.
5. **Отсутствует единая demo-story в терминах бизнес-метрик (latency/cost/success-rate) на одном экране**.

## Приоритизированный план (4–6 недель)

## Фаза 0 (1–2 дня): стабилизация baseline

- Починить синтаксис в `src/web/simple-server.ts` и вернуть green для:
  - `npm run typecheck`
  - `npm run build`
  - `npm test -- --run`
- Зафиксировать единый `README`-путь запуска для demo-режима и production-режима.
- Добавить `env.example` с минимальными переменными (DB, Kafka, Temporal, Ollama/OpenAI).

**Definition of Done:** проект собирается «с нуля» на чистой машине по одной инструкции.

## Фаза 1 (1 неделя): investor-demo контур

- Сделать единый demo-сценарий «бизнес-кейс» (например, обработка заявки/лида) с:
  - запуском сценария,
  - трассой шагов,
  - результатом,
  - стоимостью/временем выполнения,
  - объяснимым guardrail-блоком.
- Вывести это в отдельную страницу `demo` с минималистичным UX (без технического шума).
- Добавить «режим презентации»: seed-данные + кнопка one-click run + reset.

**Definition of Done:** за 3–5 минут можно показать ценность продукта без CLI.

## Фаза 2 (1–2 недели): production reliability

- Довести Temporal до реального durable path (workflow state + retries + compensation по узлам).
- Закрыть разрыв между in-memory и durable исполнением:
  - единые статусы execution,
  - корректное восстановление после перезапуска,
  - идемпотентность повторных запросов.
- Формализовать health endpoints и readiness checks.

**Definition of Done:** перезапуск сервиса не ломает активные выполнения; есть доказуемый recovery.

## Фаза 3 (1 неделя): CI/CD и release discipline

- Добавить GitHub Actions pipeline:
  - lint/typecheck/test/build,
  - опционально smoke e2e.
- Ввести versioning и release notes (хотя бы semver + changelog).
- Подготовить контейнерный runbook: `docker-compose up` с healthcheck’ами.

**Definition of Done:** каждый merge в main автоматически валидируется и воспроизводимо разворачивается.

## Фаза 4 (параллельно): investor packaging

- Сформировать «пакет демонстрации»:
  - архитектурная схема (1 слайд),
  - бизнес-кейс (1 слайд),
  - KPI до/после (1 слайд),
  - технические риски и mitigation (1 слайд).
- В приложении: «About / Trust» экран с guardrails, audit trail, наблюдаемостью.
- Добавить сохранение и выгрузку отчёта выполнения (PDF/JSON) для демонстрации enterprise-ready подхода.

## Технический backlog (точечные задачи)

1. Исправить `src/web/simple-server.ts` (broken template literal/escaping).
2. Провести ревизию дублирующихся документов статуса и оставить 1 источник правды (`CURRENT_STATUS.md`).
3. Добавить `.github/workflows/ci.yml`.
4. Добавить smoke test для demo API: запуск сценария + проверка статуса + проверка метрик.
5. Вынести feature flags: `USE_TEMPORAL`, `USE_KAFKA`, `USE_AGENT_RUNTIME`.
6. Сделать таблицу SLA/SLO: p95 latency, success rate, cost per run.

## Рекомендуемые KPI для демонстрации инвесторам

- **Время запуска сценария до результата** (TTFR, p50/p95).
- **Успешность выполнения сценариев** (% successful runs).
- **Средняя стоимость на выполнение** (tokens/API cost).
- **Доля инцидентов, пойманных guardrails**.
- **Время восстановления после сбоя** (RTO для оркестрации).

## Куда двигаться дальше после demo-ready

- Multi-tenant + RBAC + audit export (enterprise продажа).
- Template marketplace (ускорение внедрения у клиентов).
- Policy engine (OPA) для отраслевых compliance кейсов.
- Agent evaluation harness с регулярным regression scoring.
