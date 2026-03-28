# 🌐 Инструкция по запуску веб-интерфейса

## Два варианта сервера

| Команда | Файл | Назначение |
|--------|------|------------|
| `npm run web` | `src/web/server.ts` | Лёгкий сервер: главная, админка, demo-e2e, статика, API-заглушки |
| `node server.cjs` | `server.cjs` | Полный сервер: Agent Runtime, сценарии, очереди, eval, БД, все API |

Для теста агента на `/test-agent.html` нужен **node server.cjs**. При `npm run web` страница покажет подсказку «Запустите node server.cjs».

## Быстрый запуск

### Вариант 1: Лёгкий сервер (рекомендуется для разработки UI)

```bash
npm run web
```

Порт по умолчанию **3000**. Задать другой порт:

- **PowerShell:** `$env:PORT=3001; npm run web`
- **Linux/macOS:** `PORT=3001 npm run web`

### Вариант 2: Полный сервер (агент, сценарии, очереди)

```bash
node server.cjs
```

Сервер слушает порт 3000 и выводит в консоль список URL.

### Вариант 3: Через PowerShell скрипт (Windows)

```powershell
.\start-web.ps1
```

## Главная страница

После запуска откройте **http://localhost:3000** (или http://localhost:PORT).

На главной две кнопки:

- **Админский интерфейс** → `/admin-dashboard.html`
- **Демо сквозного теста** → `/demo-e2e.html`

## Основные страницы

- `/` — главная (точка входа)
- `/admin-dashboard.html` — админ-дашборд
- `/admin-testing.html` — eval-кейсы
- `/admin-templates.html` — шаблоны сценариев
- `/admin-scenarios.html` — сценарии
- `/admin-monitoring.html` — мониторинг
- `/admin-runs.html` — трекер выполнений: единый статус, снимок из БД, события; опционально live по **WebSocket** `ws://…/ws/admin-runs` (чекбокс на странице; зависимость `ws` в `package.json`). Нужен `node server.cjs`.
- `/admin-spec-studio.html` — конструктор Scenario Spec (форма → JSON, черновик в localStorage); кнопки «Создать сценарий…» / «Запомнить для формы» передают JSON в модалку создания на `/admin-scenarios.html`
- `/demo-e2e.html` — демо сквозного теста
- `/test-agent.html` — тест Agent Runtime (полный функционал при `node server.cjs`)
- `/observability-dashboard.html` — observability

## Если порт 3000 занят

1. Освободить порт (PowerShell):
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
   ```

2. Либо запустить на другом порту:
   ```powershell
   $env:PORT=3001; npm run web
   ```
   Затем открыть http://localhost:3001

## Зависимости

```bash
npm install
```

Для полного сервера (`node server.cjs`) могут понадобиться БД (Prisma), Ollama или OpenAI (для агента) и т.д. — см. `.env.example`.

### Prisma: миграции и типичная ошибка

- Обычно: `npx prisma migrate deploy` (или `npm run db:deploy`).
- Если база когда-то поднималась через `prisma db push`, а затем `migrate deploy` пишет **P3009** (failed migration) или **«table already exists»**: локальный SQLite можно пересоздать цепочкой миграций:
  ```bash
  npm run db:migrate:fresh
  ```
  Скрипт удаляет `dev.db` / `dev.db-journal` в корне проекта (и при наличии — в `prisma/`) и выполняет `prisma migrate deploy`. **Данные в этой БД пропадут.**
- Если нужно сохранить данные, вместо удаления БД пометьте проблемную миграцию вручную: `npx prisma migrate resolve --applied <имя_папки_миграции>` (только если схема в БД уже соответствует этой миграции), затем снова `migrate deploy`.

## Temporal + OPA (durable execution и внешняя политика)

| Компонент | Команда / переменные |
|-----------|----------------------|
| Temporal Server (dev) | `temporal server start-dev` → `localhost:7233` |
| Worker | `npm run temporal:worker` (нужен предварительный `npm run build`) |
| Подключение оркестратора к Temporal | `USE_TEMPORAL=true`, `TEMPORAL_ADDRESS` (см. `.env.example`) |
| Агент внутри worker | `TEMPORAL_ENABLE_AGENT=1`, `LLM_PROVIDER=ollama` или `openai` + ключи |
| OPA | `opa run --server --addr :8181 policies/scenario/tool.rego policies/scenario/lane.rego` → `OPA_URL=http://localhost:8181` |
| OPA (bundle) | `npm run bundle:opa` → `build/opa-policy-bundle.tar.gz`; запуск: `opa run --server --addr :8181 build/opa-policy-bundle.tar.gz` (удобно для staging/образа `openpolicyagent/opa`) |

**Docker (OPA + PostgreSQL + Temporal):** `docker compose -f docker-compose.dev-infra.yml up -d` — OPA `:8181`, Temporal gRPC `:7233`, Postgres на хосте `:5433`. Только OPA: `docker compose -f docker-compose.dev-infra.yml up -d opa`. Вместо контейнерного Temporal можно оставить `temporal server start-dev` и поднять лишь `opa` (и при необходимости Postgres) из compose.

**Multi-tenant (API):** заголовок `X-Tenant-ID` (1–64 символа, `[a-zA-Z0-9._-]`); без заголовка используется тенант `default`. Сценарии и выполнения в БД изолированы по полю `tenantId`; `POST /api/orchestrator/execute` пробрасывает тенант из того же заголовка в запись `Execution`. При вызове OPA gateway добавляет в `input` поле **`tenantId`** (тот же тенант), чтобы в Rego можно было писать правила по организации или грузить отдельный data/bundle на окружение.

Тесты политик: `npm run test:opa` — запускает `opa test policies/` через `scripts/run-opa-test.mjs` (если `opa` не в `PATH`, один раз качается бинарь v0.69.0 в системный temp). CI дополнительно собирает bundle (`opa build -b policies/`) на Linux и Windows. Интеграционный smoke: GitHub Actions **CI optional (Temporal, OPA, Web E2E)** — `workflow_dispatch`, чекбоксы: Temporal dev + `opa test`/bundle + полный `npm test`; опционально **`run_web_e2e_opa`** → `npm run e2e:smoke:opa` (SQLite `DATABASE_URL=file:./e2e-ci-opa.db` на runner). Локально: `TEMPORAL_E2E=1` для temporal vitest.

Смоук веб-агента (сценарий в БД + token budget + `POST /api/agent/execute`): поднять `node server.cjs` с рабочим `DATABASE_URL`, затем `npm run smoke:agent`. Опционально `SMOKE_BASE_URL`, `SMOKE_TENANT`. Для проверки OPA задайте на сервере `OPA_URL` перед запуском. Тенант для агента: **`X-Tenant-ID`** (приоритет) или поля `tenantId` / `_tenantId` в теле.

**Одна команда (E2E локально):** из корня репозитория, порт **3000** свободен, зависимости установлены:

```bash
npm run e2e:smoke
```

Скрипт `scripts/e2e-smoke.mjs` выполняет `prisma migrate deploy`, проверяет что порт **3000** свободен (иначе **FAIL** — не используется «чужой» сервер), поднимает `node server.cjs`, ждёт `GET /api/status` (при падении процесса до ответа — **FAIL**), затем `npm run smoke:agent` и останавливает сервер. Пропуск миграций: `E2E_SKIP_MIGRATE=1`. Таймаут ожидания API: `E2E_SMOKE_STARTUP_MS` (мс).

**E2E с OPA в той же команде** (порты **8181** и **3000** свободны; при отсутствии `opa` в `PATH` бинарь качается в temp, как для `test:opa`):

```bash
npm run e2e:smoke:opa
```

Скрипт `scripts/e2e-smoke-opa.mjs`: `opa run --server` с `policies/scenario/tool.rego` и `lane.rego`, ожидание `GET /health`, затем `server.cjs` с `OPA_URL`, смоук агента. Переменные: `E2E_OPA_PORT`, `E2E_OPA_STARTUP_MS`, те же `E2E_SKIP_MIGRATE` / `E2E_SMOKE_STARTUP_MS`, что у `e2e:smoke`.

Оценка **USD за вызов инструмента** (накопление в `executionSpendUsd` → OPA): переменная `EXECUTION_TOOL_COST_USD_DEFAULT` и/или поле `estimatedCostUsdPerCall` на `RegisteredTool` (см. `src/utils/tool-call-cost.ts`).

Когда оставаться на in-memory оркестраторе, а когда включать Temporal: [`TEMPORAL_VS_IN_MEMORY.md`](TEMPORAL_VS_IN_MEMORY.md).

### Пример PowerShell (веб + OPA + Temporal в отдельных окнах)

```powershell
# Окно 1
temporal server start-dev

# Окно 2
opa run --server --addr :8181 policies/scenario/tool.rego policies/scenario/lane.rego

# Окно 3
$env:USE_TEMPORAL="true"; $env:OPA_URL="http://127.0.0.1:8181"; node server.cjs

# Окно 4
$env:TEMPORAL_ENABLE_AGENT="1"; npm run temporal:worker
```
