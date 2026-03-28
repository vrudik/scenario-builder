# Прогресс реализации

## ✅ Завершено

### 1. Базовая структура проекта
- [x] TypeScript, ESLint, Prettier, структура каталогов, документация

### 2. Scenario Spec
- [x] Zod, все основные блоки сценария, валидатор

### 3. Scenario Builder/Compiler
- [x] Spec → Workflow Graph, ExecutionPolicy, deployment descriptors, retry/timeout

### 4. Tool Registry
- [x] Регистрация, метаданные, поиск

### 5. Tool Gateway
- [x] Политики, rate limit, circuit breaker, sandbox, trace/span
- [x] **OPA** (опционально): `setOpaClient`, Data API `scenario/allow`
- [x] Аудит с учётом **deploymentLane** (canary)

### 6. Policy (`src/policy/`)
- [x] `evaluateLocalToolAccess` (логика бывшего чистого gateway-check)
- [x] `OpaHttpClient`, пример `policies/scenario/tool.rego`
- [x] Экспорт из корневого `src/index.ts`

### 7. Runtime Orchestrator
- [x] In-memory workflow, state, retry, saga, recoverExecution
- [x] **workflow-traversal** (общий с Temporal): next edges, условия, merge входов
- [x] Action-узлы: inputs из предшественников + `node.config.inputs`
- [x] **Canary:** обогащение контекста, state, события, Temporal payload
- [x] **Canary v2 (часть):** `spec.canaryAllowedTools` → `ExecutionPolicy` + локальная проверка на полосе `canary` + OPA `input.canaryAllowedTools` и правила в `tool.rego`
- [x] **Deployment:** `riskClass: medium` → descriptor `strategy: shadow` + `shadowConfig` (10% дублей по умолчанию)
- [x] Интеграция **TemporalClient** (при наличии — durable старт)
- [x] **Единый статус execution:** `getUnifiedExecutionStatus()`, поля `runtimeKind` / Temporal в `WorkflowExecutionState` и Prisma `Execution`; `startScenarioWorkflow` → `runId`; `unifiedStatus` в JSON `execute-orchestrator`
- [x] **Холодный статус:** `ExecutionRepository.findStatusPayloadByExecutionId`, `toUnifiedExecutionStatusFromDb`, `Orchestrator.getUnifiedExecutionStatusFromDb` / `getUnifiedExecutionStatusResolved`; REST `GET /api/executions/:id/unified-status`; в ответе `execute-orchestrator` — `unifiedStatusResolved`

### 8. Temporal (базовый контур)
- [x] `scenarioWorkflow` + `executeNodeActivity` / `compensateNodeActivity`
- [x] `executeAgentNodeActivity` + `TEMPORAL_ENABLE_AGENT` в worker (Ollama)
- [x] Vitest + `TestWorkflowEnvironment` (`tests/temporal-scenario-workflow.test.ts`); импорт workflow → `./workflow-traversal.js` для webpack-бандла
- [x] `temporal-worker.ts`, скрипт `npm run temporal:worker`
- [x] Проброс canary в workflow и activities
- [x] `@temporalio/client` / `worker` / `workflow` / `testing` **1.15.0** (одна линия SDK)
- [x] Паритет с in-memory: `runScenarioWorkflow` ждёт результат → `ScenarioWorkflowOutcome` (`errorCode`, `nodeOutcomes`, `terminalNodeId`) → `executionStates` + события узлов
- [x] `npm run temporal:worker` → `tsc` + **`scripts/fix-dist-esm-imports.mjs`** + `node dist/runtime/temporal-worker.js` (без `tsx`; в `dist` дописываются `.js` / `index.js` для Node ESM)
- [x] Статус workflow: `describeScenarioWorkflow` / `getTemporalWorkflowStatus` (`handle.describe()`, без `result()`)
- [x] History JSON: `fetchScenarioWorkflowHistoryJson` (`handle.fetchHistory` + `historyToJSON`)

### 9. Agent Runtime
- [x] Router, tools, memory, guardrails, cost/token, fallback
- [x] Проброс `deploymentLane` в tool context
- [x] OpenAI Chat Completions + tools (`openai-provider.ts`); `loadLlmConfigFromEnv()` для worker и `execute-orchestrator`
- [x] Проброс `costGuardExceeded` в `ToolRequestContext` при исчерпании бюджета токенов (OPA input)

### 10. Observability
- [x] OpenTelemetry, Prometheus, логи, dashboard
- [x] Метрики gateway: `gateway_opa_decisions_total`, `gateway_policy_denials_total` (лейблы lane / result)

### 11. Event Bus (Kafka)
- [x] Абстракция, Kafka, orchestrator, UI тест, degradation без Kafka

### 12. Шаблоны и Eval
- [x] Template library, eval runner, админ-UI

### 13. Тесты (частично)
- [x] Vitest: orchestrator, gateway, policy, workflow-traversal, canary-router, builder, eval, и др.
- [x] demo-api-smoke: кроссплатформенный spawn (`node` + `node_modules/tsx/dist/cli.mjs`)

---

## 📋 В работе / следующие шаги

### Критичные улучшения
- [x] **Temporal:** `TEMPORAL_AWAIT_RESULT=false` — fire-and-forget старт + `syncTemporalExecutionResult(executionId)` (опрос `getWorkflowResult`)
- [x] **Temporal:** статус без `result()` — `TemporalClient.describeScenarioWorkflow`, `Orchestrator.getTemporalWorkflowStatus`
- [x] **Temporal:** выгрузка history — `fetchScenarioWorkflowHistoryJson` / `getTemporalWorkflowHistoryJson` (`historyToJSON`)

### Продукт и политики
- [x] **Canary v2 (часть):** shadow-run — `strategy: shadow` + `shouldRunShadowCanaryDuplicate`, параллельный запуск `__shadow_canary` на lane `canary`, `shadowToolStub` (in-memory + Temporal `startScenarioWorkflow`); выключатель `SHADOW_CANARY_ENABLED=false`
- [x] **Canary v2 (часть):** `stableBlockedToolIds` в ScenarioSpec / `ExecutionPolicy` / `evaluateLocalToolAccess` / OPA `scenario_lane` + `admin-spec-studio`
- [x] **OPA v2 (часть):** маскирование идентификаторов во входе OPA при `scenarioPiiClassification` medium/high — `redactOpaScenarioInput` (`opa-input-pii.ts`)
- [x] **OPA v2 (часть):** `input` с PII/risk/лимитами из `ExecutionPolicy`, `cost_guard_exceeded` из `ToolRequestContext.costGuardExceeded`; пример Rego + `opa test`
- [x] **OPA v2 (часть):** пакет `scenario_lane` (`lane.rego`) — `canaryBlockedToolIds` на полосе canary; связка с `scenario.allow`; spec `canaryBlockedToolIds` → ExecutionPolicy → gateway + `evaluateLocalToolAccess`
- [ ] **OPA v2:** доп. пакеты Rego; политики по полосе без дублирования с локальной проверкой

### Платформа
- [x] **Temporal activity recovery (часть):** таблица `temporal_tool_activity_result`, дедуп по `workflowId|runId|activityId`, env `TEMPORAL_ACTIVITY_DEDUP`; не кэшируются ошибки (retry сохраняется)
- [x] **UI (часть):** `admin-spec-studio`, трекер runs (`admin-runs.html`, опционально live WebSocket), `admin-monitoring` (canary + deploy doc), панель **Tenant** + `X-Tenant-ID`
- [ ] **UI:** live execution (узлы/шаги), canary/deploy панель
- [x] **Multi-tenant (часть):** `tenantId` в Prisma `Scenario` / `Execution`, API + `server.cjs`, репозитории, оркестратор
- [ ] **Multi-tenant:** очереди/шаблоны и др. модели; tenant в durable кэше при необходимости
- [ ] **Marketplace** инструментов/шаблонов

### Качество и релизы
- [x] **CI:** матрица `ubuntu-latest` + `windows-latest`; OPA бинарь под OS; demo e2e — stdio/`windowsHide`/`taskkill`; scenarios-api — `execFile` + `prisma`/`tsx` entrypoints без shell
- [x] **CI optional:** workflow_dispatch `ci-optional.yml` — Temporal CLI dev server, `wait-on`, `TEMPORAL_E2E=1` + `tests/temporal-server-smoke.test.ts`, `opa test`, полный vitest
- [x] **npm run test:opa** — `opa test policies/` (локально при установленном OPA)
- [x] **.env.example** — Temporal, `USE_TEMPORAL`, OPA, LLM_PROVIDER / OpenAI / Ollama, тестовые флаги
- [x] **Docker образ приложения:** корневой `Dockerfile` (Node 20, `prisma migrate deploy` + `server.cjs`), `.dockerignore`, профиль `app` в `docker-compose.yml` (`scenario-builder`), runbook
- [x] **CI:** job `docker-image` в `.github/workflows/ci.yml` — `docker build` на каждом push/PR (Ubuntu)
- [x] **GHCR:** workflow `docker-publish.yml` — push в `ghcr.io/<owner>/<repo>`: ветка `main` (`latest`, `sha-*`), теги `v*` (semver + major/minor алиасы)
- [x] **Staging-окружение:** `docker-compose.staging.yml`, `.env.staging.example`, `docs/guides/STAGING.md`, CI job `staging-compose` (`docker compose config`), npm `staging:up` / `staging:down`
- [x] **Dev-infra compose:** `docker-compose.dev-infra.yml`, CI `dev-infra-compose` (`docker compose ... config`)
- [x] **API списка executions:** `GET /api/executions?limit=&scenarioId=`, tenant-scoped
- [x] **Deployment pipeline:** шаблон `deploy-staging.yml` + `DEPLOY_CI_GITHUB.md` + `docker-compose.staging.ghcr.yml` (секреты в Environment `staging`, не в образе)

---

## 📝 Заметки

- Локальная **ExecutionPolicy** на gateway задаётся в **`execute-orchestrator`** из spec — соответствие инструментов и сценария.
- **OPA** включается через `OPA_URL`; при недоступности по умолчанию **fail-open** (настраивается).
- Документ **`CURRENT_STATUS.md`** — краткий срез по ТЗ и бэклогу; этот файл — детализация по модулям.
