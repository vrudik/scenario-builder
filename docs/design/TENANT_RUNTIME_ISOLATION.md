# Deeper Tenant Isolation in Runtime — Design Document

Status: **RFC / Design**

## Problem

Current tenant isolation is data-level only (tenantId filter on DB queries). For enterprise customers, deeper isolation is needed: execution resources, LLM credentials, network boundaries.

## Isolation Levels

### L0: Data Isolation (Current)

```
All tenants → Shared runtime → Shared DB (filtered by tenantId)
```

- DB queries filtered by `tenantId`
- Shared OPA policies
- Shared LLM credentials
- Shared execution queue

**Risk:** Noisy neighbor, credential sharing, no resource limits per tenant.

### L1: Execution Isolation

```
Tenant A → Execution queue A (concurrency: 10)
Tenant B → Execution queue B (concurrency: 5)
```

- Per-tenant execution concurrency limits
- Per-tenant cost budgets enforced at runtime
- Per-tenant rate limiting on tool calls
- Still shared process and LLM credentials

**Implementation:**

```typescript
class TenantExecutionManager {
  private queues = new Map<string, ExecutionQueue>();

  async execute(tenantId: string, scenario: Scenario, input: unknown) {
    const queue = this.getOrCreateQueue(tenantId);
    const config = await getTenantConfig(tenantId);

    if (queue.active >= config.maxConcurrency) {
      throw new QuotaExceededError('Max concurrent executions reached');
    }

    return queue.enqueue(() => this.orchestrator.execute(scenario, input));
  }
}
```

### L2: Credential Isolation

```
Tenant A → LLM key A, DB connection A
Tenant B → LLM key B, DB connection B
```

- Per-workspace LLM API keys (stored encrypted in workspace settings)
- Per-workspace database connection (schema or database isolation)
- Per-workspace OPA policy bundle
- Still shared process

**Workspace settings extension:**

```json
{
  "llm": {
    "provider": "openai",
    "apiKey": "encrypted:...",
    "model": "gpt-4"
  },
  "database": {
    "url": "postgresql://user:pass@db/tenant_acme"
  },
  "opa": {
    "bundleUrl": "s3://policies/org-acme/bundle.tar.gz"
  }
}
```

### L3: Process Isolation

```
Tenant A → Worker process A → DB A, OPA A, LLM A
Tenant B → Worker process B → DB B, OPA B, LLM B
```

- Dedicated worker process per tenant (or per workspace)
- Complete memory isolation
- Independent scaling
- Can run on separate infrastructure

**Implementation options:**
- Temporal: dedicated task queue per tenant, separate workers
- Kubernetes: namespace per tenant, separate pods
- Docker: container per tenant

## Migration Path

| Phase | Level | Trigger |
|-------|-------|---------|
| Current | L0 | Default for all |
| Phase 1 | L1 | Any paying customer |
| Phase 2 | L2 | Business tier and above |
| Phase 3 | L3 | Enterprise tier only |

## Configuration

```env
# Global default
TENANT_ISOLATION_LEVEL=L0

# Per-org override (in org settings)
# isolation_level: "L0" | "L1" | "L2" | "L3"
```

## Resource Limits by Level

| Resource | L0 | L1 | L2 | L3 |
|----------|----|----|----|----|
| Concurrent executions | Shared pool | Per-tenant limit | Per-tenant limit | Dedicated |
| LLM credentials | Shared | Shared | Per-tenant | Per-tenant |
| Database | Shared table | Shared table | Separate schema/DB | Separate DB |
| OPA policies | Shared | Shared | Per-tenant bundle | Dedicated instance |
| Memory | Shared | Shared | Shared | Dedicated |
| CPU | Shared | Shared | Shared | Dedicated |
| Network | Shared | Shared | Shared | Isolated (optional) |

## Cost Implications

| Level | Infrastructure Overhead | Ops Complexity |
|-------|------------------------|----------------|
| L0 | None | Low |
| L1 | Minimal (in-memory queues) | Low |
| L2 | Moderate (secret storage, connection pools) | Medium |
| L3 | High (dedicated workers/containers) | High |

## Temporal Integration

For L3 with Temporal:

```
Tenant A → Task Queue: "tenant-acme-prod" → Worker pool A
Tenant B → Task Queue: "tenant-beta-prod" → Worker pool B
```

Worker pools can be scaled independently per tenant workload.

## Dependencies

- N-11 (Org/Workspace) — tenant identity
- N-13 (Trusted tenant mapping) — tenant resolution
- N-22 (Metering/quota) — per-tenant resource tracking
- B-04 (OPA federation) — per-tenant policy bundles
