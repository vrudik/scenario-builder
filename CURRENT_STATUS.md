# Текущий статус проекта

_Обновлено: + multi-tenant (Scenario/Execution + админка), список executions из БД, dev-infra compose, метрики OPA/lane на gateway._

Декомпозиция задач и фазы: [`docs/guides/IMPLEMENTATION_TASKS_FROM_ROADMAP.md`](docs/guides/IMPLEMENTATION_TASKS_FROM_ROADMAP.md). Подробный прогресс по модулям: [`PROGRESS.md`](PROGRESS.md). Temporal vs in-memory: [`docs/guides/TEMPORAL_VS_IN_MEMORY.md`](docs/guides/TEMPORAL_VS_IN_MEMORY.md). Инвесторский конспект: [`docs/investor/DEMO_PACKAGE.md`](docs/investor/DEMO_PACKAGE.md).

## ✅ Что уже реализовано (MVP и близко к MVP)

### 1. Scenario Spec ✅
- [x] JSON Schema/Zod схемы для валидации
- [x] Все основные блоки: Goal/Outcome, Triggers, Allowed Actions, Data Contract, Non-functional, Risk Class, Observability Spec

### 2. Scenario Builder/Compiler ✅
- [x] Компиляция Spec → Workflow Graph
- [x] Генерация политик исполнения (ExecutionPolicy / guardrails)
- [x] Генерация deployment descriptors (canary/shadow / all-at-once)

### 3. Tool Registry ✅
- [x] Регистрация инструментов (web-search, database-query, api-call)
- [x] Метаданные: SLA, авторизация, идемпотентность, rate limits

### 4. Tool Gateway ✅
- [x] Контроль доступа: **локальная ExecutionPolicy** + опционально **OPA Data API** (`scenario/allow`)
- [x] Rate limiting и circuit breaking
- [x] Sandbox режим
- [x] Трассировка и аудит (в т.ч. `deploymentLane` при canary)

### 5. Policy Engine (OPA) ✅ (базовый контур + lane)
- [x] Модуль `src/policy/`: `evaluateLocalToolAccess`, `OpaHttpClient`
- [x] Rego: `policies/scenario/tool.rego` + пакет `scenario_lane` (`lane.rego`, `canaryBlockedToolIds`)
- [x] Веб-оркестратор: `OPA_URL`, `OPA_FAIL_OPEN`, `OPA_TIMEOUT_MS`; **`gateway.setPolicy(generateExecutionPolicy(spec))`**
- [x] PII: маскирование userId/executionId во входе OPA при medium/high (`redactOpaScenarioInput`)
- [ ] Расширенный cost-guard в рантайме (поля для OPA — заготовка в Rego)

### 6. Runtime Orchestrator ✅
- [x] Event-driven исполнение workflow (in-memory)
- [x] Управление состоянием, retry, saga / компенсация
- [x] Интеграция с Agent Runtime
- [x] Проброс **inputs** в action-узлы из предшественников (в т.ч. fan-in merge)
- [x] Общий модуль **`workflow-traversal`** (условия на рёбрах, routing для decision/parallel)
- [x] **Canary:** `assignExecutionLane` из DeploymentDescriptor → `ExecutionContext` / state / события / Temporal / tool context

### 7. Durable Execution (Temporal) ✅ (MVP-контур)
- [x] Workflow `scenarioWorkflow`: обход графа от `start`, action через activities, компенсации
- [x] Activities вызывают **ToolGateway** + registry (worker)
- [x] `npm run temporal:worker` → `tsc` + **`node dist/runtime/temporal-worker.js`** (workflow + activities из `dist/`)
- [x] Клиент `TemporalClient`, опциональный запуск из Orchestrator при подключённом client
- [x] Узлы **agent** в Temporal: `executeAgentNodeActivity` + `TEMPORAL_ENABLE_AGENT`
- [x] Vitest + `@temporalio/testing`; паритет `ScenarioWorkflowOutcome` → `executionStates` после `runScenarioWorkflow`
- [x] Идемпотентность tool/agent activity: таблица `temporal_tool_activity_result`, ключ `workflowId|runId|activityId`, env `TEMPORAL_ACTIVITY_DEDUP`; в tool — `idempotencyKey` в `ToolRequestContext`

### 8. Canary deployment ✅ (первая итерация)
- [x] Детерминированный выбор **stable / canary** по `executionId` и `canaryConfig.percentage`
- [x] Поля в state, событиях, аудите инструментов, Temporal initial context
- [x] Shadow-дублирование: `__shadow_canary`, `shadowToolStub`, `SHADOW_CANARY_ENABLED`
- [x] Политики по полосе: `canaryAllowedTools`, `canaryBlockedToolIds`, **`stableBlockedToolIds`** (инструмент только на canary); OPA `lane.rego`

### 9. Agent Runtime ✅
- [x] Router, tool calling, memory, guardrails, cost/token, fallback
- [x] Провайдер OpenAI (`LLM_PROVIDER=openai`, `OPENAI_API_KEY`); Ollama без изменений; конфиг из env для worker и `execute-orchestrator`

### 10. Observability ✅
- [x] OpenTelemetry, метрики Prometheus, логирование, dashboard
- [x] Счётчики решений OPA / отказов политики с лейблами `deployment_lane` (`gateway_opa_decisions_total`, `gateway_policy_denials_total`)

### 11. CI / качество ✅ (часть)
- [x] GitHub Actions: Ubuntu + Windows, OPA под каждую OS; опциональный workflow с Temporal dev server + smoke-подключение
- [x] `npm run test:opa`
- [x] Сборка Docker-образа на Ubuntu (`docker-image` в `ci.yml`); публикация в **GHCR** при push в `main` и при тегах `v*` (`docker-publish.yml`); проверка **`docker-compose.staging.yml`** (`staging-compose` в `ci.yml`)

### 12. Прочее из роадмапа ✅
- [x] Event Bus (Kafka) с graceful degradation
- [x] Template Library, Eval-кейсы и UI админки
- [x] **Multi-tenant (часть):** `tenantId` на сценариях и executions, заголовок `X-Tenant-ID`, изоляция в API; панель тенанта в админке и `test-orchestrator.html`
- [x] **Мониторинг run (часть):** `GET /api/executions` с лимитом и `scenarioId`, UI на `admin-runs.html`
- [x] **Dev-infra:** `docker-compose.dev-infra.yml` (OPA, Postgres, Temporal), проверка в CI
- [x] **Metering / quotas (интеграция):** `UsageMeter` пишет `orgId`+`tenantId` (разрешение org через `Workspace`); `checkQuota(tenantId, metric)` согласован с сервером; лимиты **block** дают **429** на `/api/orchestrator/execute` и `/api/agent/execute`
- [x] **Webhooks:** доставка по событиям сценария из orchestrator (`scenario.started` / `completed` / `failed`, `tool.completed`)
- [x] **Admin:** `admin-onboarding.html`, Bearer в localStorage через `admin-common.js`, кнопка **Run** на сценариях с `userIntent` для orchestrator

---

## 📊 Соответствие MVP требованиям ТЗ

**MVP по ТЗ:** Spec > compile > execute > observe; tool gateway; базовые guardrails; логи; canary.

| Требование | Статус | Комментарий |
|-----------|--------|-------------|
| Spec > compile > execute > observe | ✅ | |
| Tool gateway | ✅ | + локальная политика из spec в execute-orchestrator, + OPA опционально |
| Базовые guardrails | ✅ | Agent Runtime |
| Логи | ✅ | OTel + аудит |
| Canary | ✅ | Маршрутизация и наблюдаемость; нет отдельного «второго» набора кода |

**Доп. блоки ТЗ:**
- ✅ Event bus (Kafka)
- ✅ Observability
- ✅ Orchestrator + Temporal: agent-activity, parity статусов, worker на `node dist`
- ✅ Policy: локально + OPA; PII/cost-guard глубже — в бэклоге

---

## 🎯 Приоритеты: что делать дальше

### Ближайшие (1–2 спринта)

1. **Temporal / DX**
   - Уже есть: `TEMPORAL_AWAIT_RESULT`, describe/history, activity dedup. Проверить **`docker-compose.dev-infra.yml`** в вашей среде (env образа Temporal).
   - Короткий one-pager «когда Temporal» для инвесторов (опираться на `TEMPORAL_VS_IN_MEMORY.md`).

2. **Canary v2** (дальше)
   - Сделано: allow/block по полосе, shadow, OPA lane, spec-studio.
   - Остаётся: отдельные rate limits по полосе, **UI деплоя** на админке.

3. **OPA v2** (базовый контур закрыт)
   - Bundle в CI, метрики lane/result на gateway.
   - Бэклог: числовой cost-guard в Rego; меньше дублирования локальная политика ↔ OPA.

4. **Надёжность**
   - **demo-api-smoke:** основной путь через `node` + `tsx` — при сбоях на Windows смотреть PATH/edge cases.

### Средний горизонт

5. **Веб-UI:** spec-редактор и трекер runs есть; **live execution** (шаги/узлы), панель canary/деплоя  
6. **Multi-tenant:** сценарии и executions изолированы; при необходимости — очереди, шаблоны, кэш activity, политики по тенанту  
7. **CI/CD:** GHCR + staging compose; шаблон выката — `deploy-staging.yml`, `DEPLOY_CI_GITHUB.md`, `docker-compose.staging.ghcr.yml`  
8. **Marketplace** шаблонов и инструментов  

**Сделано по контейнерам:** `Dockerfile`, `docker compose --profile app`, `CONTAINER_RUNBOOK.md`, **staging** — `docker-compose.staging.yml`, `docs/guides/STAGING.md`.  

### Долгий горизонт

9. Enterprise security, сертификации, федерация политик  
10. Полная OpenAI / мульти-провайдер LLM в прод-контуре  

---

## 🌐 Веб-интерфейс и точка входа

- **Главная** (`/`): админка + демо (в `server.cjs` и `src/web/server.ts`).
- **`npm run web`** — лёгкий сервер; **`node server.cjs`** — полный (агент, очереди, eval).
- **Temporal worker:** `temporal server start-dev`, затем `npm run temporal:worker`.
- **OPA:** `opa run --server --addr :8181 policies/scenario/tool.rego`, переменная **`OPA_URL`**.

---

## 📝 Недавние изменения (сводка)

- [x] `workflow-traversal`, inputs action-узлов из графа, routing для decision/parallel  
- [x] Temporal: workflow + activities + worker + обогащение контекста canary  
- [x] Canary router, поля в state / событиях / gateway  
- [x] OPA HTTP client, локальная policy, пример Rego, интеграция в gateway  
- [x] `execute-orchestrator`: `setPolicy` из spec + `OPA_URL`  

## 📝 Известные ограничения

1. ~~Temporal + agent~~: при `TEMPORAL_ENABLE_AGENT=1` worker поднимает Agent Runtime (Ollama); иначе agent-узлы в Temporal без LLM.  
2. Worker в проде: `npm run temporal:worker` — сборка в `dist` + `fix-dist-esm-imports` (без tsx).  
3. ~~demo-api-smoke~~: `node` + `tsx` CLI; на Windows учтены stdio/kill.  
