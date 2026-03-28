# Scenario Builder — Public Documentation

Skeleton внешней документации. Каждый раздел — отдельная страница на docs-сайте.

## Structure

```
docs/
├── index                    ← Вы здесь
├── overview/
│   ├── what-is              # What is Scenario Builder
│   ├── how-it-works         # Architecture overview
│   ├── use-cases            # Top use cases
│   └── comparison           # vs alternatives
├── getting-started/
│   ├── quick-start          # Install → run → first scenario
│   ├── first-scenario       # Create your first spec
│   ├── admin-ui             # Admin dashboard walkthrough
│   └── demo                 # One-click demo
├── guides/
│   ├── scenario-spec        # Spec format reference
│   ├── tools                # Registering and using tools
│   ├── agents               # Agent runtime configuration
│   ├── policies             # OPA policies and guardrails
│   ├── temporal             # Durable execution setup
│   ├── events               # Kafka event streaming
│   └── observability        # OpenTelemetry setup
├── deployment/
│   ├── modes                # SaaS / self-hosted / single-tenant
│   ├── docker               # Container deployment
│   ├── ci-cd                # GitHub Actions CI/CD
│   └── staging              # Staging environment
├── api/
│   ├── rest                 # REST API reference
│   ├── scenarios            # Scenarios API
│   ├── executions           # Executions API
│   ├── audit                # Audit API
│   └── webhooks             # Webhook contracts (planned)
├── security/
│   ├── overview             # Security model
│   ├── auth                 # Authentication (planned)
│   ├── rbac                 # Roles and permissions (planned)
│   ├── tenancy              # Multi-tenant model
│   └── compliance           # Audit, data retention, PII
└── reference/
    ├── config               # Environment variables
    ├── cli                  # CLI reference
    └── changelog            # Release notes
```

## Existing Content Mapping

Документы, которые уже существуют и могут быть опубликованы (с редактурой):

| Public Page | Source File | Status |
|-------------|------------|--------|
| What is Scenario Builder | `docs/product/PRODUCT_IDENTITY.md` | ready |
| Architecture / How it works | `README.md` (Architecture section) | ready |
| Use Cases | `docs/product/PRODUCT_IDENTITY.md` (UC-1/2/3) | ready |
| vs Alternatives | `docs/product/PRODUCT_IDENTITY.md` (Competitive) | ready |
| Quick Start | `docs/guides/QUICK_START.md` | ready |
| Admin UI Walkthrough | `docs/guides/WEB_INSTRUCTIONS.md` | needs editing |
| Demo | `demo-e2e.html` (self-contained) | ready |
| Scenario Spec Reference | `docs/api/API_DOCUMENTATION.md` + source schemas | needs writing |
| OPA Policies | `policies/` + inline docs | needs writing |
| Temporal Setup | `docs/guides/TEMPORAL_VS_IN_MEMORY.md` | ready |
| Kafka Setup | `docs/setup/KAFKA_SETUP.md` | ready |
| Observability | `docs/setup/OBSERVABILITY_TESTING.md` | needs editing |
| Docker Deployment | `docs/guides/CONTAINER_RUNBOOK.md` | ready |
| CI/CD | `docs/guides/DEPLOY_CI_GITHUB.md` | ready |
| Staging | `docs/guides/STAGING.md` | ready |
| REST API | `docs/api/API_DOCUMENTATION.md` | ready |
| Security Overview | — | **planned (N-14)** |
| Auth Model | — | **planned (N-10)** |
| RBAC | — | **planned (N-12)** |
| Multi-tenant | partial in code + docs | needs writing |
| Config Reference | `.env.example` | needs writing |
| Changelog | — | needs creating |

## Gaps (what needs to be written)

| Priority | Page | Depends On |
|----------|------|-----------|
| P0 | Security Overview | N-14 |
| P0 | Auth Model | N-10 |
| P0 | RBAC | N-12 |
| P0 | Deployment Modes | N-19 |
| P1 | Scenario Spec Reference | existing schemas |
| P1 | Tools Guide | existing code |
| P1 | Agent Configuration | existing code |
| P1 | OPA Policies Guide | existing policies |
| P1 | Config Reference | `.env.example` |
| P1 | Multi-tenant Guide | existing code |
| P2 | Webhooks | N: L-07 |
| P2 | CLI Reference | existing CLI |
| P2 | Changelog | release process |

## Publishing Notes

- Target: static site generator (Docusaurus, MkDocs, or Nextra)
- Primary language: English (Russian descriptions where helpful)
- Every page should link back to source code where relevant
- API reference can be auto-generated from OpenAPI spec (when available)
