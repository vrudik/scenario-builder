# Container runbook + healthchecks

Этот runbook описывает минимальный контейнерный контур для demo/prod-like запуска: инфраструктура в Docker Compose и приложение отдельно (или в своем контейнере).

В **GitHub Actions** на каждом push/PR job **`docker-image`** выполняет `docker build` (проверка, что Dockerfile собирается).

Workflow **`Docker publish`** (`.github/workflows/docker-publish.yml`) пушит в **GHCR** `ghcr.io/<owner>/<repo>` (нижний регистр):

| Событие | Теги образа |
|--------|-------------|
| Push в **`main`** | `latest`, `sha-<short>` |
| Git-тег **`v*`** (semver, напр. `v0.2.0`) | `0.2.0`, `0.2`, `0` (короткие алиасы от `docker/metadata-action`) |

Релиз по тегу:

```bash
git tag -a v0.2.0 -m "release 0.2.0"
git push origin v0.2.0
```

Пример pull:

```bash
docker pull ghcr.io/myorg/scenario-builder:latest
docker pull ghcr.io/myorg/scenario-builder:0.2.0
```

Для приватного репозитория: `docker login ghcr.io` (PAT с `read:packages` или через `GITHUB_TOKEN` в CI).

## Staging

Отдельный порт, том БД и сеть: **[`STAGING.md`](STAGING.md)** (`docker-compose.staging.yml`, `docker-compose.staging.ghcr.yml`, `.env.staging.example`, `npm run staging:up`).

Выкат после публикации в GHCR (секреты, SSH, K8s-шаблон): **[`DEPLOY_CI_GITHUB.md`](DEPLOY_CI_GITHUB.md)**.

## 1) Поднять инфраструктуру

```bash
docker compose up -d zookeeper kafka
```

Проверка статуса контейнеров:

```bash
docker compose ps
```

Ожидаем, что у `zookeeper` и `kafka` статус `healthy` (healthcheck'и уже описаны в `docker-compose.yml`).

## 2) Запустить приложение

### Вариант A — из исходников (разработка)

```bash
npm install
npm run build
node server.cjs
```

### Вариант B — Docker-образ

Сборка:

```bash
docker build -t scenario-builder .
```

Запуск (SQLite в именованном томе, порт 3000, Event Bus по умолчанию выключен в примере):

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=file:/app/data/dev.db \
  -e ENABLE_EVENT_BUS=false \
  -v scenario_builder_run:/app/data \
  scenario-builder
```

При первом старте выполняется `prisma migrate deploy` (см. `CMD` в `Dockerfile`).

### Вариант C — Compose с профилем `app`

Только приложение (без Kafka в этом профиле):

```bash
docker compose --profile app up -d --build scenario-builder
```

Инфраструктура Kafka по-прежнему: `docker compose up -d zookeeper kafka` (без профиля).

## 3) Проверить liveness/readiness

После старта приложения доступны стандартные health endpoints:

- `GET /healthz` (alias: `GET /api/health`) — liveness.
- `GET /readyz` (alias: `GET /api/ready`) — readiness + detail checks.

Проверка через curl:

```bash
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/readyz
```

Пример ожидаемого ответа `/readyz`:

```json
{
  "status": "ok",
  "service": "scenario-builder-server",
  "uptimeSec": 12.34,
  "timestamp": "2026-01-01T12:00:00.000Z",
  "checks": {
    "staticAssetsAccessible": true,
    "apiStatusEndpointAvailable": true
  }
}
```

## 4) Operational quick checks

- API статус: `curl -fsS http://127.0.0.1:3000/api/status`
- Demo API: `curl -fsS http://127.0.0.1:3000/api/demo-e2e`

## 5) Остановка

```bash
docker compose down
```

Для удаления томов/сетей (если нужно чистое окружение):

```bash
docker compose down -v
```
