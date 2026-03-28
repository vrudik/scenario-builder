# Staging-окружение

Цель: отдельный контур для проверки перед продом — **другой порт**, **своя БД** (том Docker), **изолированная сеть**, без затрагивания локального `dev.db` и порта `3000`.

## Вариант 1: Docker Compose (локальная сборка)

1. (Опционально) Скопируйте переменные:

   ```bash
   cp .env.staging.example .env.staging
   ```

2. Поднимите staging:

   ```bash
   docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
   ```

   Без файла env:

   ```bash
   docker compose -f docker-compose.staging.yml up -d --build
   ```

3. Проверка:

   - Приложение: **http://localhost:3080** (или `STAGING_PORT` из `.env.staging`).
   - Liveness: `curl -fsS http://127.0.0.1:3080/healthz`
   - Readiness: `curl -fsS http://127.0.0.1:3080/readyz`

4. Остановка:

   ```bash
   docker compose -f docker-compose.staging.yml down
   ```

   С удалением тома с БД:

   ```bash
   docker compose -f docker-compose.staging.yml down -v
   ```

## Вариант 2: Образ из GHCR (без сборки на хосте)

После успешного **Docker publish** (ветка `main` или тег `v*`):

```bash
docker pull ghcr.io/<owner>/<repo>:latest
docker run --rm -d --name scenario-builder-staging \
  -p 3080:3000 \
  -e DATABASE_URL=file:/app/data/staging.db \
  -e ENABLE_EVENT_BUS=false \
  -e SCENARIO_BUILDER_ENV=staging \
  -v sb_staging_data:/app/data \
  ghcr.io/<owner>/<repo>:latest
```

`<owner>/<repo>` — в нижнем регистре, как в URL репозитория GitHub.

## Вариант 3: Compose только с образом GHCR (без `build` на хосте)

Файл **`docker-compose.staging.ghcr.yml`** совпадает по сервисам/томам с `docker-compose.staging.yml`, но тянет готовый образ из реестра:

```bash
export STAGING_GHCR_IMAGE=ghcr.io/<owner>/<repo>:latest
docker compose -f docker-compose.staging.ghcr.yml pull
docker compose -f docker-compose.staging.ghcr.yml up -d
```

Сценарий **GitHub Actions → Deploy staging** (`.github/workflows/deploy-staging.yml`) использует этот compose на удалённой машине по SSH; подробности и секреты: **[`DEPLOY_CI_GITHUB.md`](DEPLOY_CI_GITHUB.md)**.

## Kafka / OPA / Temporal

- **Kafka:** поднимите `zookeeper` + `kafka` из корневого `docker-compose.yml`, выставьте `STAGING_ENABLE_EVENT_BUS=true` и `STAGING_KAFKA_BROKERS` так, чтобы контейнер приложения достучался до брокера (на одном хосте с Docker часто нужен `host.docker.internal:9092` или общая user-defined network — настройте под свою сеть).
- **OPA:** отдельный контейнер `openpolicyagent/opa` или хост; укажите `STAGING_OPA_URL`. Для выката политик как артефакта: локально `npm run bundle:opa`, затем образ OPA с `run`/`exec` на `build/opa-policy-bundle.tar.gz` (см. [`WEB_INSTRUCTIONS.md`](WEB_INSTRUCTIONS.md)).
- **Temporal:** `STAGING_USE_TEMPORAL=true` и `STAGING_TEMPORAL_ADDRESS`; отдельно нужен worker (`npm run temporal:worker`) или свой сервис.

## GitHub Environments (CI/CD)

Для выката на реальный staging-хост:

1. В репозитории: **Settings → Environments → New environment** → имя `staging`.
2. Добавьте **secrets** (SSH, kubeconfig, registry token и т.д.) и при необходимости **protection rules** (required reviewers).
3. В workflow деплоя укажите `environment: staging` — job получит эти секреты только для этого окружения.

Отдельный deploy-workflow в репозитории не зашит (хосты и оркестраторы у всех разные); этот раздел задаёт контракт имени окружения и секретов.

## Связанные файлы

| Файл | Назначение |
|------|------------|
| `docker-compose.staging.yml` | Сервис `scenario-builder-staging` |
| `.env.staging.example` | Шаблон переменных для compose |
| `Dockerfile` | Тот же образ, что в prod-like CI |
| `docs/guides/CONTAINER_RUNBOOK.md` | Общий runbook и GHCR |
| `docker-compose.staging.ghcr.yml` | Staging из образа GHCR (pull, без локальной сборки) |
| `docs/guides/DEPLOY_CI_GITHUB.md` | GHCR vs deploy, секреты, workflow Deploy staging |
