# Декомпозиция investor deploy roadmap в задачи

Источник: `docs/guides/INVESTOR_DEPLOY_ROADMAP.md`.

## Чеклист «что дальше» (порядок выполнения)

1. [x] **OPA policies:** `npm run test:opa` — все тесты в `policies/` зелёные. Скрипт `scripts/run-opa-test.mjs` использует бинарь из `PATH`, иначе кэширует OPA v0.69.0 в `%TEMP%/scenario-builder-opa-cache` (как версия в CI). Альтернатива без Node: `docker run --rm -v "%CD%:/work" -w /work openpolicyagent/opa:0.69.0 test policies/` (нужен запущенный Docker). В GitHub Actions: шаг в `.github/workflows/ci.yml`.
2. [x] **Смоук веб-агента:** `npm run smoke:agent` (`scripts/smoke-agent-execute.mjs`) — `POST /api/scenarios` с `X-Tenant-ID` и spec с `nonFunctional.tokenBudget`, затем `POST /api/agent/execute` с `scenarioId` (= UUID из БД) и `tenantId` / `_tenantId`. Нужны запущенные `server.cjs` и БД. При заданном `OPA_URL` на сервере в цепочку включён OPA.
3. [x] **`executionSpendUsd`:** накопление в `WorkflowExecutionState` / Temporal `spendAcc` → `ToolRequestContext` и OPA; оценка: `RegisteredTool.estimatedCostUsdPerCall` или `EXECUTION_TOOL_COST_USD_DEFAULT` (`src/utils/tool-call-cost.ts`). Agent-runtime обновляет `executionSpendUsd` после успешных tool calls; Temporal dedup хранит `__sbExecutionSpendUsdAfter` для agent-кэша.
4. [x] **`admin-runs` live:** при «Авто-обновление» + running/pending — опционально доп. опрос только узлов/событий каждые 1,5 с (чекбокс на `admin-runs.html`); базовый цикл unified-status 2 с / 5 с без изменений.
5. [x] **`X-Tenant-ID` для `/api/agent/execute`:** в `server.cjs` валидный заголовок имеет приоритет над `tenantId` / `_tenantId` в JSON; смоук шлёт оба.
6. [x] **Тесты:** `tests/execute-agent-request.test.ts` — мок `ScenarioRepository` + мок `AgentRuntime` (без LLM): проверка загрузки spec из «БД», `findById(scenarioId, tenant)` и контекста `execute`.
7. [x] **Multi-tenant (Queue/Template):** `server.cjs` пробрасывает `_tenantId` из `X-Tenant-ID` в `templates-api` / `queues-api`; репозитории фильтруют по `tenantId`. Опционально дальше: отдельные политики OPA/кластеры Temporal на тенанта — в бэклоге.

*Пункты 1–7 чеклиста «что дальше» закрыты; новые задачи — из сводки ниже / бэклога.*

### Чеклист vNext (приоритет сверху вниз)

*Все пункты 1–6 закрыты; новые задачи — из бэклога продукта / инвесторского roadmap.*

1. [x] **E2E-скрипт «поднять и проверить»:** `npm run e2e:smoke` → `scripts/e2e-smoke.mjs` (`prisma migrate deploy`, `node server.cjs`, ожидание `/api/status`, `smoke:agent`, остановка). Описание: `WEB_INSTRUCTIONS.md`.
2. [x] **Смоук с OPA в цепочке:** `npm run e2e:smoke:opa` → `scripts/e2e-smoke-opa.mjs` (OPA server + `OPA_URL` на `server.cjs` + `smoke:agent`). Ручной вариант: отдельный терминал с `opa run …`, затем `OPA_URL=… npm run e2e:smoke`. CI: `.github/workflows/ci-optional.yml`, чекбокс **`run_web_e2e_opa`**. Опционально дальше: сценарий с `nonFunctional.cost.maxPerExecution` и `EXECUTION_TOOL_COST_USD_DEFAULT` для явного отказа политики.
3. [x] **CI/CD deploy:** `docs/guides/DEPLOY_CI_GITHUB.md` (GHCR vs выкат, секреты Environment `staging`); `docker-compose.staging.ghcr.yml`; workflow `.github/workflows/deploy-staging.yml` (`workflow_dispatch`, по умолчанию `dry_run=true`; SSH + compose при `dry_run=false`). K8s — шаблон в доке, без жёсткого кластера в репо.
4. [x] **UI (опционально):** WebSocket <code>/ws/admin-runs</code> + чекбокс на `admin-runs.html` (пакет `ws`, сервер опрашивает те же REST API); панель canary/deploy на `admin-monitoring.html` — ссылки на трекер, DEPLOY_CI, метрики gateway.
5. [x] **Multi-tenant (углубление):** в OPA input пробрасывается **`tenantId`** (оркестратор, Temporal activities, веб-агент); комментарий в `policies/scenario/tool.rego` + тест `tool_test.rego`. Отдельный bundle/namespace на тенанта — по требованию (док: `WEB_INSTRUCTIONS.md`).
6. [x] **Инкремент B (Windows CI):** `scenarios-api.test.ts` — `execFile(node, [prisma/build/index.js|tsx/dist/cli.mjs, …])` без `npx`/`tsx.cmd`/shell; `demo-api-smoke` — `windowsHide`, больший таймаут старта на win32, `taskkill /T` после suite. Комментарий в `ci.yml`.

**Рекомендуемый следующий шаг:** бэклог продукта / новые фичи; при регрессиях на Windows — смотреть `tests/scenarios-api.test.ts` и `tests/demo-api-smoke.test.ts`.

### Недавно закрыто (не дублировать в «осталось»)

- [x] Политика из spec на entrypoint веб-агента (`agent-handler`: загрузка сценария из БД, `setPolicy`, OPA по `OPA_URL`).
- [x] OPA: числовые лимиты `tokensUsedSoFar` / `executionSpendUsd` в `policies/scenario/tool.rego` + `tool_test.rego`.
- [x] Spec `deployment` override + поля в `admin-spec-studio.html` (стратегия деплоя, cost/token budget).
- [x] One-pager Temporal для инвесторов: `docs/investor/TEMPORAL_ONE_PAGER.md`.

## Принципы приоритизации

## Горячий трек — исправление ошибок (стартуем с этого)

- [x] Добавить отдельный трек исправления compile/test ошибок в roadmap-план.
- [x] Уменьшать количество TypeScript ошибок до green `typecheck/build` (батчами).
  - [x] Батч 1: cleanup неиспользуемых импортов/переменных в `src/web/*`.
  - [x] Батч 2: исправление типовых контрактов в `src/tools/*`.
  - [x] Батч 3: исправление строгих типов в `src/agent/*` и `src/runtime/*`.
- [x] Починить нестабильный тест `tests/scenarios-api.test.ts` (hook timeout).

1. Сначала снимаем блокеры сборки/демо (time-to-demo).
2. Затем закрываем reliability и recoverability.
3. После этого — CI/CD и release discipline.
4. Параллельно готовим investor packaging и narrative.

## Фаза 0 — Stabilization baseline (1–2 дня)

- [x] Починить compile/typecheck/build (регулярная проверка в CI).
  - [x] `npm run typecheck` / `npm run build` — целевое состояние green.
  - [x] `npm test` — demo-api-smoke без `npx` (spawn `node` + `tsx/dist/cli.mjs`).
- [x] Синхронизировать quick-start для demo + **Temporal + OPA** (секция в `WEB_INSTRUCTIONS`, шаг 5 в `QUICK_START`, см. `TEMPORAL_VS_IN_MEMORY.md`).
- [x] Актуализировать **`.env.example`**: DB, Kafka, Temporal, OPA, `USE_TEMPORAL`, LLM (`LLM_PROVIDER`, OpenAI/Ollama), тестовые флаги.

## Фаза 1 — Investor-demo contour (1 неделя)

- [x] Выделить единый бизнес-кейс demo (customer support/order status).
- [x] Добавить one-click run (presentation mode) с seed-данными.
- [x] Добавить reset demo state.
- [x] Вывести KPI на одном экране:
  - [x] success rate,
  - [x] latency (TTFR/duration),
  - [x] estimated cost per run.
- [x] Добавить explainable guardrail-блок в результат запуска.
- [x] Добавить экспорт отчёта demo run (JSON/PDF-lite) для встречи с инвесторами.

## Фаза 2 — Production reliability (1–2 недели)

- [x] **Temporal (MVP):** workflow по графу, activities → ToolGateway, worker (`npm run temporal:worker`), canary в контексте.
- [x] **Temporal:** agent-узлы в worker (`TEMPORAL_ENABLE_AGENT` + `loadLlmConfigFromEnv`: Ollama/OpenAI); `@temporalio/testing` e2e — есть; гибрид subgraph — по желанию.
- [x] Выровнять **статусы execution** между in-memory и Temporal; единая модель в API/БД (`getUnifiedExecutionStatus`, поля `runtimeKind` / Temporal в Prisma, `unifiedStatus` в `execute-orchestrator`).
- [x] **Recovery / идемпотентность activity:** кэш успешных tool/agent activities в `temporal_tool_activity_result` + `idempotencyKey` в `ToolRequestContext` для tool; выключатель `TEMPORAL_ACTIVITY_DEDUP`. Полное восстановление in-memory оркестратора из истории — по-прежнему `recoverExecution`.
- [x] Readiness/health endpoints.
- [x] **Canary (v1):** маршрутизация stable/canary, метаданные в событиях и аудите.
- [x] **Canary (v2) — часть:** `stableBlockedToolIds` в spec / ExecutionPolicy / локальная политика / OPA `scenario_lane` + поля в конструкторе spec; shadow и canary allow/block уже были.
- [x] **OPA (v1):** HTTP Data API + локальная ExecutionPolicy на gateway; пример Rego; `execute-orchestrator` + `OPA_URL`.
- [x] **OPA (v2):** `opa test` в CI (Linux + Windows), PII/cost/лимиты в `input` gateway (`tool-gateway` + `redactOpaScenarioInput`), сборка bundle в CI + `npm run bundle:opa`.
- [x] **Метрики gateway:** `gateway_opa_decisions_total`, `gateway_policy_denials_total` с лейблами `deployment_lane` / `result` (`src/observability/metrics.ts`, `tool-gateway.ts`).
- [x] **API мониторинга run:** `GET /api/executions?limit=&scenarioId=`; UI таблица + автообновление + фильтр на `admin-runs.html`.
- [x] **Multi-tenant (база):** `tenantId` в `Scenario` / `Execution`, миграция; `X-Tenant-ID` в `server.cjs` → scenarios / executions / `execute-orchestrator`; админка (`admin-common.js`) + `test-orchestrator.html` + `?tenant=`.

## Фаза 3 — CI/CD & release discipline (1 неделя)

- [x] Добавить `.github/workflows/ci.yml` (lint/typecheck/test/build).
- [x] Добавить smoke e2e для demo API.
- [x] Ввести semver + changelog/release notes.
- [x] Добавить container runbook + healthchecks.
- [x] **Dockerfile** приложения + `.dockerignore` + сервис `scenario-builder` (профиль `app`) в `docker-compose.yml`.
- [x] **CI:** сборка образа (`docker-image` job в `ci.yml`, без push).
- [x] **GHCR:** публикация при push в `main` и при тегах `v*` (`docker-publish.yml`).
- [x] **Staging:** compose + env example + runbook + проверка compose в CI.
- [x] **Dev-infra compose:** `docker-compose.dev-infra.yml` (OPA + Postgres + Temporal), валидация в CI (`dev-infra-compose`).

## Фаза 4 — Investor packaging (параллельно)

- [x] Сформировать demo-пакет (architecture/business-case/KPI/risks): `docs/investor/DEMO_PACKAGE.md`.
- [x] Добавить экран About/Trust (guardrails, audit trail, observability).
- [x] Подготовить демонстрационный отчёт выполнения (download/export) — в UI демо (фаза 1); расширения — по запросу.

## Пошаговый execution plan (следующие инкременты)

1. ~~**A:** demo one-click + KPI + guardrails + reset~~
2. **B:** smoke demo API в CI ✅; стабилизация **Windows** (`execFile` в scenarios-api, `windowsHide`/`taskkill` в demo-api-smoke) ✅.
3. ~~**C:** CI baseline (lint/typecheck/test/build)~~
4. ~~**D:** Temporal MVP (workflow + activities + worker + canary в контексте)~~
5. ~~**Инкремент E (основное закрыто):** agent-узлы в worker, `@temporalio/testing` e2e, паритет статусов in-memory ↔ Temporal, history/describe.~~ **Опционально:** гибрид subgraph / упрощённый worker без tsx.
6. ~~**Инкремент F:** OPA тесты + bundle + cost/PII input + Canary v2 в Rego~~
7. **Инкремент G (частично):** ~~список executions из БД, фильтры, автообновление, `docker-compose.dev-infra.yml`~~; ~~polling узлов/событий на `admin-runs` (1,5 с при running)~~. **Осталось:** WebSocket (по желанию), панель canary/деплоя в UI, e2e «одной командой» app+infra (опционально).
8. **Инкремент H (частично):** ~~Scenario/Execution + API + админка + test-orchestrator~~; ~~`tenantId` в очередях/шаблонах + заголовок в API~~. **Осталось (опционально):** изоляция OPA/Temporal по тенанту; политики на уровне тенанта вне HTTP-заголовка.

## Сводка: что осталось (приоритет сверху вниз)

| Область | Статус / следующий шаг |
|--------|-------------------------|
| **OPA** | Лимиты + `executionSpendUsd` / `tokensUsedSoFar`; **`input.tenantId`** для Rego; смоук с `OPA_URL` по желанию |
| **Temporal** | Fire-and-forget + опрос (частично есть через `TEMPORAL_AWAIT_RESULT`); прод-надёжность compose `dev-infra` под вашу среду |
| **UI** | `admin-runs`: HTTP-авто + опционально WebSocket `/ws/admin-runs`; canary/deploy — `admin-monitoring.html` + DEPLOY_CI |
| **Multi-tenant** | `X-Tenant-ID` в API + **`tenantId` в OPA input**; опционально — отдельный bundle/namespace Temporal на тенанта |
| **CI/CD** | Deploy staging (SSH + `docker-compose.staging.ghcr.yml`), дока `DEPLOY_CI_GITHUB.md`; GHCR как раньше |
| **DX** | One-pager для инвесторов ✅ `docs/investor/TEMPORAL_ONE_PAGER.md`; полный гайд — `TEMPORAL_VS_IN_MEMORY.md` |
| **Marketplace** | Отдельный эпик |

## Бэклог идей (без жёсткого порядка)

- Worker Temporal: **ещё проще** без промежуточных скриптов (single bundle или только `dist` без правок импортов) — сейчас уже `node dist/runtime/temporal-worker.js`.
- [x] Политика **по умолчанию** из spec на entrypoint веб-агента (`execute-agent` / `agent-handler`); оркестратор — как раньше.
- [x] Метрики Prometheus по **deploymentLane** и решению OPA (`gateway_opa_decisions_total`, `gateway_policy_denials_total`).
- [x] Документ «**Когда включать Temporal**» — one-pager для инвесторов: `docs/investor/TEMPORAL_ONE_PAGER.md` (поверх `TEMPORAL_VS_IN_MEMORY.md`).

## Критерии готовности investor demo

- Demo показывается за 3–5 минут без CLI.
- На одном экране есть narrative + KPI + guardrails.
- Есть reset между прогонами и стабильный повторяемый сценарий.
