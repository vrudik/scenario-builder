# Container runbook + healthchecks

Этот runbook описывает минимальный контейнерный контур для demo/prod-like запуска: инфраструктура в Docker Compose и приложение отдельно (или в своем контейнере).

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

В текущей конфигурации приложение запускается из исходников:

```bash
npm install
npm run build
node server.cjs
```

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
