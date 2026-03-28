# Org / Workspace Model — Design Document

Status: **RFC / Design**
Depends on: N-10 (API Auth Model)
Required by: N-12 (RBAC), N-13 (Trusted Tenant Mapping)
Priority: P0

## Current State

- Multi-tenancy via `tenantId` string on entities (`Scenario`, `Execution`, `ScenarioQueue`, `Template`)
- `tenantId` comes from `X-Tenant-ID` header — unauthenticated, any string accepted
- No `Org`, `Workspace`, or `User` models in Prisma schema
- No identity → tenant mapping

## Design Goals

1. **Org as billing/trust boundary** — one customer = one org
2. **Workspace as isolation boundary** — environments (production, staging, dev) within an org
3. **Backward compatible** — `tenantId: 'default'` maps to a default org/workspace
4. **Simple first** — minimal models now, extensible later

## Entity Model

```
Org (1) ──→ (N) Workspace
Org (1) ──→ (N) OrgMember (user + role)
Org (1) ──→ (N) ApiKey
Workspace (1) ──→ (N) Scenario, Execution, Template, Queue, ...
```

### Org

The top-level entity. One org = one customer account.

```prisma
model Org {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique   // URL-safe identifier
  plan        String   @default("free")  // free, pro, enterprise
  status      String   @default("active") // active, suspended, deleted
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspaces  Workspace[]
  members     OrgMember[]
  apiKeys     ApiKey[]

  @@index([slug])
  @@index([status])
}
```

### Workspace

An isolation boundary within an org. Maps 1:1 to the current `tenantId`.

```prisma
model Workspace {
  id          String   @id @default(uuid())
  orgId       String
  name        String   // "Production", "Staging", "Development"
  slug        String   // URL-safe identifier, unique within org
  tenantId    String   @unique  // maps to existing tenantId field on entities
  environment String   @default("development") // production, staging, development
  settings    String?  // JSON workspace-level settings
  status      String   @default("active") // active, archived
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  org         Org      @relation(fields: [orgId], references: [id])

  @@unique([orgId, slug])
  @@index([orgId])
  @@index([tenantId])
  @@index([status])
}
```

### OrgMember

User membership in an org with a role.

```prisma
model OrgMember {
  id        String   @id @default(uuid())
  orgId     String
  userId    String   // external user ID (from auth provider or local)
  email     String
  role      String   // owner, admin, builder, operator, viewer
  status    String   @default("active") // active, invited, deactivated
  invitedBy String?
  joinedAt  DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  org       Org      @relation(fields: [orgId], references: [id])

  @@unique([orgId, userId])
  @@unique([orgId, email])
  @@index([orgId])
  @@index([userId])
  @@index([email])
}
```

## TenantId Mapping

Current `tenantId` field on entities becomes a **foreign key to Workspace.tenantId**.

| Before | After |
|--------|-------|
| `tenantId` = arbitrary string from header | `tenantId` = `Workspace.tenantId` (validated) |
| No org association | Resolved via `Workspace → Org` |
| `'default'` = shared space | `'default'` = default workspace in default org |

### Migration Strategy

1. Create a `default` org with a `default` workspace (tenantId = `'default'`)
2. All existing entities belong to the default workspace
3. Custom tenantIds (if any) get mapped to new workspaces under the default org
4. New API keys carry `orgId` → workspace resolution is automatic

## Resolution Flow

```
API Key → orgId → list of Workspace.tenantId for this org
                      ↓
              Request validates that target tenantId belongs to caller's org
```

When `AUTH_MODE=off`:
- `X-Tenant-ID` accepted as-is (current behavior)
- All operations run in `default` workspace

When `AUTH_MODE=required`:
- Tenant resolved from API key's org
- If `X-Tenant-ID` header provided, validated against org's workspaces
- Mismatch → 403 Forbidden

## Default Seeding

On first run (or migration), the system creates:

```
Org: { id: 'default-org', name: 'Default', slug: 'default', plan: 'free' }
  └── Workspace: { orgId: 'default-org', name: 'Default', slug: 'default', tenantId: 'default', environment: 'development' }
```

## API Endpoints

```
# Org management
GET    /api/orgs              # List orgs (admin only)
POST   /api/orgs              # Create org
GET    /api/orgs/:id          # Get org details
PATCH  /api/orgs/:id          # Update org

# Workspace management
GET    /api/orgs/:orgId/workspaces          # List workspaces in org
POST   /api/orgs/:orgId/workspaces          # Create workspace
GET    /api/orgs/:orgId/workspaces/:id      # Get workspace
PATCH  /api/orgs/:orgId/workspaces/:id      # Update workspace

# Member management
GET    /api/orgs/:orgId/members             # List members
POST   /api/orgs/:orgId/members             # Invite member
PATCH  /api/orgs/:orgId/members/:id         # Update role
DELETE /api/orgs/:orgId/members/:id         # Remove member
```

## Workspace Settings

Per-workspace configuration overrides:

```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4",
    "maxTokensPerExecution": 10000
  },
  "policy": {
    "opaUrl": "http://localhost:8181",
    "failOpen": false
  },
  "limits": {
    "maxConcurrentExecutions": 10,
    "maxScenariosPerWorkspace": 100
  }
}
```

## Open Questions

1. Should workspaces share OPA policy bundles or have independent bundles?
2. Should workspace creation be self-service or admin-only?
3. Should we support workspace-level API keys (scoped to one workspace)?

## Dependencies

- N-10 (API Auth) — `ApiKey.orgId` references `Org`
- N-12 (RBAC) — `OrgMember.role` defines permissions
- N-13 (Trusted Tenant Mapping) — identity → org → workspace chain
