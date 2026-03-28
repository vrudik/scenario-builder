# Quick Start

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Verify Setup

```bash
npm run typecheck
npm run build
npm test -- --run
```

## Step 3: Start the Server

**Light mode** (UI + demo APIs):

```bash
npm run web
```

**Full mode** (Agent Runtime + DB + admin APIs):

```bash
node server.cjs
```

## Step 4: Open the Browser

Navigate to **http://localhost:3000**

| Page | URL |
|------|-----|
| Admin Dashboard | `/admin-dashboard.html` |
| Demo | `/demo-e2e.html` |
| Trust & Guardrails | `/about-trust.html` |
| Agent Test | `/test-agent.html` |

Port override: `PORT=3001 npm run web` (Linux/macOS) or `$env:PORT=3001; npm run web` (PowerShell).

## Step 5 (Optional): Temporal for Durable Execution

Three processes needed: **Temporal Server**, **Worker**, and optionally **OPA**.

1. **Temporal** (dev mode):
   ```bash
   temporal server start-dev
   ```
   Default address: `localhost:7233` (`TEMPORAL_ADDRESS`).

2. **Worker** (after build):
   ```bash
   npm run temporal:worker
   ```
   For agent nodes: set `TEMPORAL_ENABLE_AGENT=1` and configure LLM (see `.env.example`).

3. **OPA** (optional policy engine):
   ```bash
   opa run --server --addr :8181 policies/scenario/tool.rego policies/scenario/lane.rego
   ```
   Set `OPA_URL=http://localhost:8181` in `.env`.

4. **Enable Temporal in API**: set `USE_TEMPORAL=true` when running `node server.cjs`.

See also: [Temporal vs In-Memory](TEMPORAL_VS_IN_MEMORY.md), [Web Instructions](WEB_INSTRUCTIONS.md).

## What You'll See

- **Admin Dashboard** — system overview, component status, health checks
- **Scenarios** — manage declarative scenario specs
- **Runs** — execution history with audit trail, live WebSocket updates
- **Spec Studio** — visual scenario spec editor
- **Templates** — reusable scenario templates
- **Demo** — one-click demo run with KPI snapshot and guardrails report

## Next Steps

- Explore [API Documentation](../api/API_DOCUMENTATION.md)
- Set up [Kafka](../setup/KAFKA_SETUP.md) for event streaming
- Configure [Observability](../setup/OBSERVABILITY_TESTING.md) for tracing
- Review [Container Runbook](CONTAINER_RUNBOOK.md) for Docker deployment
