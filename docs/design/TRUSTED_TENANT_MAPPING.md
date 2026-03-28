# Trusted Tenant Mapping — Design Document

Status: **RFC / Design**
Depends on: N-10 (API Auth), N-11 (Org/Workspace), N-12 (RBAC)
Priority: P0

## Problem

Current tenancy model is **trust-on-header**: any API caller can set `X-Tenant-ID` to any value. There is no verification that the caller has access to the requested tenant.

This means:
- Any client can access any tenant's data by setting the header
- No boundary enforcement between organizations
- Audit trail shows tenantId but cannot prove authorization

## Design: Identity-Bound Tenant Resolution

### Core Principle

**Tenant is resolved from identity, not from headers.**

```
API Key → Org → Workspace(s) → tenantId
```

The caller cannot freely choose a tenantId outside their org's workspaces.

### Resolution Chain

```
1. Auth middleware extracts identity (API key / session / service token)
2. Identity carries orgId
3. System looks up Workspace records where orgId = identity.orgId
4. Allowed tenantIds = set of Workspace.tenantId for this org
5. If X-Tenant-ID header present:
   a. Validate it's in the allowed set → use it
   b. Not in set → 403 Forbidden
6. If no header → use org's default workspace tenantId
```

### Resolution Table

| AUTH_MODE | X-Tenant-ID header | Behavior |
|-----------|-------------------|----------|
| `off` | any value | Accepted as-is (current behavior) |
| `off` | absent | `'default'` |
| `optional` | any value, no auth | Accepted as-is |
| `optional` | any value, with auth | Validated against org's workspaces |
| `required` | any value | Validated against org's workspaces |
| `required` | absent | Org's default workspace |

### Implementation

```typescript
interface TenantResolution {
  tenantId: string;
  orgId: string;
  workspaceId: string;
  environment: string; // production, staging, development
}

async function resolveTenant(
  identity: AuthIdentity | null,
  headerTenantId: string | undefined
): Promise<TenantResolution> {
  // No auth → legacy behavior
  if (!identity) {
    return {
      tenantId: headerTenantId || 'default',
      orgId: 'default-org',
      workspaceId: 'default-workspace',
      environment: 'development',
    };
  }

  // Load org's workspaces (cached)
  const workspaces = await getOrgWorkspaces(identity.orgId);
  const allowedTenantIds = new Set(workspaces.map(w => w.tenantId));

  if (headerTenantId) {
    if (!allowedTenantIds.has(headerTenantId)) {
      throw new ForbiddenError(
        `Tenant '${headerTenantId}' not accessible for org '${identity.orgId}'`
      );
    }
    const ws = workspaces.find(w => w.tenantId === headerTenantId)!;
    return {
      tenantId: ws.tenantId,
      orgId: identity.orgId,
      workspaceId: ws.id,
      environment: ws.environment,
    };
  }

  // No header → org's default workspace
  const defaultWs = workspaces.find(w => w.slug === 'default')
    || workspaces[0];
  return {
    tenantId: defaultWs.tenantId,
    orgId: identity.orgId,
    workspaceId: defaultWs.id,
    environment: defaultWs.environment,
  };
}
```

### Caching

Workspace lookups cached per orgId with 60s TTL to avoid DB hit per request:

```typescript
const workspaceCache = new Map<string, { workspaces: Workspace[]; expiry: number }>();
```

Cache invalidated on workspace create/update/delete.

## OPA Input Enhancement

Current OPA input includes `tenantId`. With trusted mapping, add `orgId` and `environment`:

```json
{
  "input": {
    "tenantId": "acme-prod",
    "orgId": "org-acme",
    "environment": "production",
    "userId": "user-123",
    "userRoles": ["builder"],
    "tool": "database-query",
    "riskClass": "moderate"
  }
}
```

This enables OPA policies like:
- Block high-risk tools in production environment
- Different cost limits per environment
- Org-specific policy bundles

## Cross-Tenant Protection

### Data Query Filter

All DB queries must include tenant filter:

```typescript
// Before (vulnerable to cross-tenant access)
prisma.scenario.findMany({ where: { status: 'active' } })

// After (tenant-scoped)
prisma.scenario.findMany({
  where: { status: 'active', tenantId: resolution.tenantId }
})
```

### Audit Enrichment

Every audit log entry includes the full resolution:

```json
{
  "action": "scenario_executed",
  "actor": "user-123",
  "orgId": "org-acme",
  "workspaceId": "ws-prod",
  "tenantId": "acme-prod",
  "environment": "production"
}
```

## Migration from Header-Only Model

1. **Phase 0 (current):** `AUTH_MODE=off`, X-Tenant-ID accepted freely
2. **Phase 1:** Add workspace model, seed default org/workspace
3. **Phase 2:** `AUTH_MODE=optional`, validate tenant for authenticated calls
4. **Phase 3:** `AUTH_MODE=required`, all tenantIds must resolve through org

### Backward Compatibility

- `X-Tenant-ID: default` always works (maps to default workspace)
- Custom tenantIds created before auth model → assigned to default org initially
- Admin can reassign workspaces to correct orgs during migration

## Security Properties

| Property | Before | After |
|----------|--------|-------|
| Cross-tenant data access | Possible via header | Blocked (org-bound) |
| Tenant spoofing | Trivial | Impossible (identity-resolved) |
| Audit attribution | tenantId only | orgId + workspaceId + userId |
| Environment isolation | None | Workspace environment field |

## Dependencies

- N-10 (API Auth) — identity provides orgId
- N-11 (Org/Workspace) — Workspace model with tenantId
- N-12 (RBAC) — role determines access level within workspace
