# Deployment Modes Guide

Scenario Builder supports multiple deployment topologies to match different organizational requirements.

## Deployment Options

| Mode | Best For | Data Location | Operations |
|------|---------|--------------|-----------|
| **Single-Instance Docker** | Small teams, PoC, pilots | Customer infrastructure | Customer-managed |
| **Docker Compose Stack** | Mid-market, staging/production | Customer infrastructure | Customer-managed |
| **Kubernetes** | Enterprise, multi-team | Customer infrastructure | Customer/vendor-managed |
| **Managed Cloud** (future) | Teams without DevOps capacity | Vendor cloud | Vendor-managed |

## Single-Instance Docker

Simplest deployment. One container, SQLite database, no external dependencies.

```bash
docker run -d \
  --name scenario-builder \
  -p 3000:3000 \
  -v sb-data:/app/prisma \
  -e AUTH_MODE=required \
  -e SESSION_SECRET=$(openssl rand -hex 32) \
  ghcr.io/org/scenario-builder:latest
```

**Included:** App server, SQLite DB, in-memory orchestration, admin UI.
**Not included:** Temporal, Kafka, OPA (optional add-ons).

**Sizing:** 1 vCPU, 1GB RAM, 10GB disk. Handles ~50 concurrent scenarios.

## Docker Compose Stack

Production-ready deployment with all components.

```yaml
services:
  app:
    image: ghcr.io/org/scenario-builder:latest
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://user:pass@db:5432/scenario_builder
      OPA_URL: http://opa:8181
      KAFKA_BROKERS: kafka:9092
      TEMPORAL_ADDRESS: temporal:7233
      AUTH_MODE: required
    depends_on: [db, opa, kafka, temporal]

  db:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]

  opa:
    image: openpolicyagent/opa:latest
    command: run --server --addr :8181 /policies
    volumes: ["./policies:/policies:ro"]

  temporal:
    image: temporalio/auto-setup:latest

  kafka:
    image: confluentinc/cp-kafka:latest
```

**Sizing:** 4 vCPU, 8GB RAM total across all services. Handles ~500 concurrent scenarios.

## Kubernetes

For enterprise multi-team deployments with HA requirements.

**Recommended setup:**
- App: 2+ replicas behind Ingress, HPA on CPU/memory
- Database: Managed PostgreSQL (RDS, Cloud SQL, Azure DB)
- Temporal: Temporal Cloud or self-hosted cluster
- OPA: Sidecar per app pod or dedicated service
- Kafka: Managed Kafka (Confluent Cloud, MSK, Event Hubs)

**Helm chart** (planned): will include all components with sensible defaults.

## Feature Availability by Mode

| Feature | Single-Instance | Docker Compose | Kubernetes |
|---------|----------------|---------------|-----------|
| Scenario execution | In-memory | In-memory + Temporal | Temporal (recommended) |
| Database | SQLite | PostgreSQL | Managed PostgreSQL |
| Policy engine | Local only | OPA sidecar | OPA service/sidecar |
| Event streaming | Disabled | Kafka | Managed Kafka |
| Observability | Stdout logs | Jaeger + Prometheus | Full OpenTelemetry stack |
| Multi-tenant | Single tenant | Multi-workspace | Multi-workspace + isolation |
| HA / failover | No | Manual | Automatic |
| Auto-scaling | No | No | HPA |

## Environment Configuration

### Required for All Modes

```env
AUTH_MODE=required          # or 'off' for development
SESSION_SECRET=<random>     # 64+ bytes
DATABASE_URL=<connection>   # SQLite or PostgreSQL
```

### Production Additions

```env
OPA_URL=http://opa:8181
OPA_FAIL_OPEN=false
TEMPORAL_ADDRESS=temporal:7233
USE_TEMPORAL=true
KAFKA_BROKERS=kafka:9092
ENABLE_EVENT_BUS=true
OTEL_ENABLED=true
NODE_ENV=production
```

## Migration Between Modes

| From → To | Steps |
|-----------|-------|
| Single → Compose | Migrate SQLite to PostgreSQL, add services |
| Compose → Kubernetes | Externalize state (managed DB, Temporal Cloud), create manifests |
| Any → Managed Cloud | Export data via API, import into managed instance |

### SQLite → PostgreSQL Migration

```bash
# Export data
npm run db:export -- --format=json --output=export.json

# Update DATABASE_URL to PostgreSQL
# Run migrations
npm run db:deploy

# Import data
npm run db:import -- --input=export.json
```

## Networking Requirements

| Port | Service | Protocol |
|------|---------|---------|
| 3000 | App (HTTP/WS) | TCP |
| 5432 | PostgreSQL | TCP |
| 8181 | OPA | TCP |
| 7233 | Temporal | gRPC |
| 9092 | Kafka | TCP |
| 14268 | Jaeger | TCP |
| 9464 | Prometheus metrics | TCP |

## Backup Strategy

| Component | Backup Method | Frequency |
|-----------|-------------|-----------|
| Database | pg_dump / SQLite file copy | Daily |
| OPA policies | Git (version-controlled) | On change |
| Scenario specs | Database backup + API export | Daily |
| Audit logs | Database backup + export API | Daily |
| Configuration | Database backup | Daily |

## Support Matrix

| Mode | Community Support | Commercial Support |
|------|------------------|-------------------|
| Single-Instance | GitHub Issues | — |
| Docker Compose | GitHub Issues | Available |
| Kubernetes | GitHub Issues | Available |
| Managed Cloud | — | Included |
