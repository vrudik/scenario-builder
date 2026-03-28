# Scenario Builder

> Конструктор автономных сценариев и агентных процессов

Scenario Builder lets you define autonomous agent workflows as declarative specs and run them with built-in orchestration, policy gates, and observability — so every action is traceable, safe, and cost-controlled.

## Key Capabilities

- **Spec-as-code** — declarative scenario specs (Zod/JSON Schema) with risk classes, SLA, cost budgets, allowed actions
- **Orchestration** — durable execution via Temporal or lightweight in-memory runtime
- **Agent Runtime** — LLM tool calling with memory, guardrails, and cost management
- **Policy Gates** — OPA integration, rate limiting, circuit breaking, PII masking
- **Audit Trail** — every agent action logged with full context, exportable for compliance
- **Observability** — OpenTelemetry tracing and metrics (Jaeger, Prometheus)
- **Multi-tenant** — tenant-aware API, policy isolation, execution isolation
- **Event-driven** — Kafka event streaming between components

## Architecture

```
Scenario Spec (Zod/JSON) → Builder (graph + policy) → Orchestrator (Temporal / in-memory)
                                                          ↓
                                                    Tool Gateway (OPA, rate limit, circuit break)
                                                          ↓
                                                    Agent Runtime (LLM, tools, memory, guardrails)
                                                          ↓
                                                    Audit + Observability (OpenTelemetry)
```

## Quick Start

```bash
npm install
npm run typecheck
npm test -- --run
```

### Light mode (UI + demo APIs)

```bash
npm run web
# Open http://localhost:3000
```

### Full mode (Agent Runtime + DB + admin APIs)

```bash
node server.cjs
# Open http://localhost:3000/admin-dashboard.html
```

### Optional: Temporal + OPA

See [Quick Start Guide](docs/guides/QUICK_START.md) for Temporal, OPA, and Kafka setup.

## Project Structure

```
src/
├── spec/              # Scenario Spec (Zod schemas, validation)
├── builder/           # Spec → workflow graph → execution policy
├── registry/          # Tool Registry
├── gateway/           # Tool Gateway (OPA, rate limit, circuit break)
├── runtime/           # Orchestrator, Temporal workflow/worker/activities
├── agent/             # Agent Runtime (LLM, tool calling, memory, guardrails)
├── web/               # HTTP server, REST APIs
├── observability/     # OpenTelemetry metrics + tracing
├── policy/            # Local policy + OPA client
├── eval/              # Eval runner / test cases
├── audit/             # Audit types + repository
├── events/            # Event bus (Kafka)
├── tools/             # Built-in tools
├── db/                # Prisma repositories
└── index.ts           # Library barrel exports
```

Admin UI: `admin-*.html` pages at project root. Demo: `demo-e2e.html`. Trust: `about-trust.html`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript, Node.js 20+ |
| Orchestration | Temporal / in-memory |
| Event Streaming | Apache Kafka |
| Policy Engine | OPA (Open Policy Agent) |
| Database | SQLite (Prisma ORM), PostgreSQL-ready |
| LLM | OpenAI Function Calling, Ollama |
| Observability | OpenTelemetry → Jaeger, Prometheus |
| CI/CD | GitHub Actions, Docker, GHCR |

## Usage Example

```typescript
import { ScenarioSpecValidator, ScenarioBuilder } from 'scenario-builder';
import { ToolRegistry } from 'scenario-builder/registry';
import { ToolGateway } from 'scenario-builder/gateway';

const validator = new ScenarioSpecValidator();
const spec = validator.parse(specJson);

const builder = new ScenarioBuilder();
const graph = builder.compile(spec);
const policy = builder.generateExecutionPolicy(spec);

const registry = new ToolRegistry();
registry.register(tool);

const gateway = new ToolGateway();
gateway.setPolicy(policy);
```

See `examples/` for full working examples.

## Documentation

| Document | Description |
|----------|------------|
| [Quick Start](docs/guides/QUICK_START.md) | Setup guide with Temporal, OPA, Kafka |
| [Web Instructions](docs/guides/WEB_INSTRUCTIONS.md) | Admin UI and API reference |
| [API Documentation](docs/api/API_DOCUMENTATION.md) | REST API endpoints |
| [Container Runbook](docs/guides/CONTAINER_RUNBOOK.md) | Docker deployment |
| [Staging Guide](docs/guides/STAGING.md) | Staging environment setup |
| [Product Identity](docs/product/PRODUCT_IDENTITY.md) | Product positioning and ICP |

## License

MIT
