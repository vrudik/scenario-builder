# Scenario Builder — Security Overview

Buyer-facing document describing the security model, data handling, and trust guarantees.

## Security Architecture

Scenario Builder implements defense-in-depth across multiple layers:

```
Client → Auth (API Key / Session) → RBAC → Tenant Isolation → Policy Gates (OPA) → Execution
                                                                                       ↓
                                                                              Audit Trail → Export
```

## Authentication

| Method | Use Case | Details |
|--------|---------|---------|
| **API Keys** | Machine-to-machine | SHA-256 hashed, org-scoped, rotatable, revocable |
| **Session Auth** | Admin UI | Signed JWT cookie, HttpOnly, Secure, SameSite=Strict |
| **Service Tokens** | Internal services | Derived from server secret, not stored in DB |

API keys follow the format `sb_<env>_<random>` and are displayed only once at creation. The system stores only the hash — full keys are never retrievable after creation.

See: `docs/design/API_AUTH_MODEL.md`

## Authorization (RBAC)

Five predefined roles with clear permission boundaries:

| Role | Access Level |
|------|-------------|
| **Owner** | Full org control, billing, ownership transfer |
| **Admin** | Org management, all workspace access, member management |
| **Builder** | Create/edit scenarios, templates, tools |
| **Operator** | Execute scenarios, manage queues, view runs |
| **Viewer** | Read-only access to all resources |

Permissions enforced at middleware level and optionally delegated to OPA for complex policies.

See: `docs/design/RBAC_MATRIX.md`

## Multi-Tenant Isolation

### Data Isolation

- Every data entity scoped by `tenantId` (maps to a Workspace within an Org)
- Tenant resolved from authenticated identity, not client headers
- Cross-tenant data access is architecturally prevented — all queries filtered by resolved tenant
- Each org can have multiple workspaces (production, staging, development)

### Execution Isolation

- Scenario executions run within their tenant context
- Tool calls carry tenant context to policy engine
- OPA policies can enforce tenant-specific rules

See: `docs/design/TRUSTED_TENANT_MAPPING.md`

## Policy Engine (OPA)

Scenario Builder integrates Open Policy Agent for fine-grained access control:

- **Tool-level policies** — which tools can be called, under what conditions
- **Rate limiting** — per-tool call rate enforcement
- **PII masking** — sensitive data redacted in OPA input for medium/high risk tools
- **Cost guards** — execution cost limits enforced via policy
- **Environment-aware** — different policies for production vs development

Policies are written in Rego, version-controlled, and tested in CI (`npm run test:opa`).

## Audit Trail

Every significant action is logged with full context:

| Field | Description |
|-------|-----------|
| `action` | What happened (scenario_started, tool_call, guardrail_violation, etc.) |
| `actor` | Who did it (userId or service name) |
| `resource` | What was affected (scenarioId, executionId, toolId) |
| `outcome` | Result (success, failure, blocked, modified) |
| `severity` | Impact level (info, warning, error, critical) |
| `orgId` | Organization context |
| `tenantId` | Workspace context |
| `traceId` | OpenTelemetry correlation |

Audit logs are:
- **Immutable** — append-only, no modification or deletion
- **Exportable** — via API for compliance reporting
- **Correlated** — linked to OpenTelemetry traces for full observability

## Data Handling

### Data at Rest

| Data Type | Storage | Protection |
|-----------|---------|-----------|
| Scenario specs | Database (SQLite/PostgreSQL) | Tenant-scoped, access-controlled |
| Execution data | Database | Tenant-scoped, audit-logged |
| API keys | Database | SHA-256 hashed, never stored in plaintext |
| Audit logs | Database | Append-only, immutable |
| LLM API keys | Environment variables | Not stored in database |

### Data in Transit

- HTTPS recommended for all production deployments
- Internal service communication over localhost or private network
- LLM API calls over HTTPS (OpenAI, Ollama local)

### PII Handling

- OPA input redacts sensitive fields for medium/high risk tool calls
- Audit logs can be filtered for PII before export
- No LLM training on customer data (OpenAI API terms)

## Agent Guardrails

LLM-powered agents operate within strict boundaries:

| Guardrail | Description |
|-----------|-----------|
| **Tool whitelist** | Agents can only call tools defined in scenario spec |
| **Risk classification** | Tools classified as safe/moderate/high/requires_approval |
| **Cost budget** | Per-execution token and cost limits |
| **Circuit breaking** | Failed tools trigger circuit breaker, preventing cascading failures |
| **Rate limiting** | Per-tool call rate caps |
| **Approval gates** | High-risk actions require human approval (configurable) |

## Deployment Security

### Self-Hosted

- Full control over data, network, and infrastructure
- No data leaves customer perimeter
- LLM calls can use local models (Ollama) for air-gapped deployments

### Container Security

- Minimal base image (Node.js 20 on Debian slim)
- Non-root container execution
- No unnecessary packages or tools
- Health check endpoints for orchestrator integration

### CI/CD

- GitHub Actions with environment protection rules
- Docker images published to GHCR (private registry)
- SSH-based deployment with key rotation

## Compliance Considerations

| Area | Status |
|------|--------|
| Audit trail | Implemented — immutable, exportable |
| RBAC | Designed — 5 roles, scope-based |
| Data isolation | Implemented — tenant-scoped queries |
| API authentication | Designed — API keys, session auth |
| Encryption at rest | Database-level (filesystem encryption recommended) |
| Encryption in transit | HTTPS (deployment configuration) |
| Data retention | Configurable (planned) |
| SOC 2 / ISO 27001 | Not yet certified — architecture supports it |

## Responsible AI

- All agent decisions traceable via audit trail
- Cost and token budgets prevent runaway LLM usage
- Tool whitelist prevents unauthorized external calls
- Human-in-the-loop option for high-risk decisions
- No customer data used for model training

## Contact

For security inquiries, vulnerability reports, or compliance questions, contact the security team via the repository issue tracker.
