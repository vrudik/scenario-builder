# CI/CD: от GHCR до выката на хост / K8s

**GitHub Actions «Docker publish»** (`.github/workflows/docker-publish.yml`) только **собирает и пушит образ** в `ghcr.io/<owner>/<repo>`. Это не выкат на сервер: теги `latest` / `sha-*` / semver появляются в реестре, дальше окружение тянет образ само или через отдельный workflow.

## Чем deploy отличается от «только GHCR»

| Этап | Что делает | Где |
|------|------------|-----|
| **GHCR** | `docker build` + `docker push` | `docker-publish.yml`, права `packages: write` |
| **Deploy** | `docker pull` (или `kubectl set image`) на целевом окружении, рестарт сервиса, smoke | Отдельный workflow и/или ручной runbook; секреты **не** в образе |

Секреты приложения (`DATABASE_URL`, ключи LLM, `OPA_URL` и т.д.) задаются на хосте через `.env`, compose env или Kubernetes Secrets — **не** пекутся в Dockerfile.

## Локальный / VM выкат через Compose (рекомендуемый шаблон)

Файл **`docker-compose.staging.ghcr.yml`** — тот же staging-контур, что `docker-compose.staging.yml`, но **без `build`**: используется только образ из `STAGING_GHCR_IMAGE`.

```bash
export STAGING_GHCR_IMAGE=ghcr.io/myorg/scenario-builder:latest
docker compose -f docker-compose.staging.ghcr.yml pull
docker compose -f docker-compose.staging.ghcr.yml up -d
```

Дополнительно можно вынести переменные в `.env.staging` (см. [STAGING.md](STAGING.md)).

### Приватный GHCR на сервере

На машине, где выполняется `docker pull`:

```bash
echo "$CR_PAT" | docker login ghcr.io -u USERNAME --password-stdin
```

PAT с правом `read:packages` (или deploy key под вашу политику).

## GitHub Environment `staging`

1. **Settings → Environments → New environment** → имя `staging`.
2. Секреты для workflow **Deploy staging** (`.github/workflows/deploy-staging.yml`), режим `dry_run=false`:

   | Secret | Назначение |
   |--------|------------|
   | `STAGING_SSH_PRIVATE_KEY` | Ключ для `ssh` (весь PEM, включая заголовки) |
   | `STAGING_SSH_HOST` | Хост (IP или DNS) |
   | `STAGING_SSH_USER` | Пользователь SSH |
   | `STAGING_DEPLOY_PATH` | Каталог на сервере с **клоном репозитория** (там есть `docker-compose.staging.ghcr.yml`) |

3. По желанию: protection rules (required reviewers) перед выкатом.

Скрипт на runner выполняет по сути:

```bash
cd "$STAGING_DEPLOY_PATH"
git pull origin main   # или нужная ветка — см. примечание в workflow
export STAGING_GHCR_IMAGE="ghcr.io/<owner>/<repo>:<тег>"
docker compose -f docker-compose.staging.ghcr.yml pull
docker compose -f docker-compose.staging.ghcr.yml up -d
```

Убедитесь, что на сервере установлены Docker и Compose v2, а у пользователя SSH есть права на `docker` (или используйте `sudo` — тогда адаптируйте команды локально).

## Workflow в репозитории

- **Actions → Deploy staging → Run workflow**
- **`image_tag`**: например `latest`, `sha-abc1234`, `0.2.0` (как в GHCR после publish).
- **`dry_run`**: по умолчанию **true** — job только выводит целевой образ и напоминание про секреты; **секреты staging не нужны**.
- **`dry_run=false`** — выполняется SSH-выкат (нужен Environment `staging` и секреты выше).

## Kubernetes (шаблон, без привязки к кластеру)

Отдельный job в репозитории не зашит: у всех разные namespace, Deployment-имена и способы аутентификации. Типовая последовательность:

1. `kubectl` с kubeconfig из секрета (или OIDC от cloud-провайдера).
2. Обновить образ:

   ```bash
   kubectl set image deployment/scenario-builder \
     app=ghcr.io/myorg/scenario-builder:NEW_TAG -n staging
   kubectl rollout status deployment/scenario-builder -n staging
   ```

3. Секреты монтировать из `Secret`; `DATABASE_URL` и прочее — не в image.

Имеет смысл хранить манифесты или Helm values в отдельном репозитории/папке и вызывать их из своего workflow.

## Связанные документы

- [STAGING.md](STAGING.md) — порты, том БД, Kafka/OPA/Temporal.
- [CONTAINER_RUNBOOK.md](CONTAINER_RUNBOOK.md) — GHCR, теги, healthchecks.
