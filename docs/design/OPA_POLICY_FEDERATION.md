# OPA Policy Federation — Design Document

Status: **RFC / Design**

## Problem

Currently all tenants share the same OPA policy files. Enterprise customers need:
- Tenant-specific policy rules (different cost limits, different tool restrictions)
- Policy versioning per workspace
- Custom policy bundles without affecting other tenants

## Approaches

### Approach 1: Layered Policy Evaluation

Stack policies from general → org → workspace:

```
Base policies (platform defaults)
  └── Org policies (org-level overrides)
       └── Workspace policies (workspace-level overrides)
```

OPA input includes all layers; Rego rules merge them:

```rego
package scenario.tool

import data.platform.base
import data.orgs[input.orgId] as org_policy
import data.workspaces[input.tenantId] as ws_policy

effective_cost_limit := ws_policy.cost_limit {
    ws_policy.cost_limit
} else := org_policy.cost_limit {
    org_policy.cost_limit
} else := base.cost_limit

default allow = false
allow if {
    input.executionSpendUsd < effective_cost_limit
    # ... other checks
}
```

**Pros:** Single OPA instance, simple deployment.
**Cons:** All policies loaded in memory, org data visible to OPA.

### Approach 2: Per-Tenant OPA Bundles

Each org/workspace gets a separate policy bundle:

```
bundles/
├── platform/bundle.tar.gz       # Base rules
├── org-acme/bundle.tar.gz       # Acme overrides
├── org-acme-prod/bundle.tar.gz  # Acme production workspace
└── org-beta/bundle.tar.gz       # Beta overrides
```

OPA loads bundles dynamically based on request context:

```
POST /v1/data/scenario/tool/allow
{
  "input": {
    "tenantId": "acme-prod",
    "orgId": "org-acme",
    ...
  }
}
```

**Pros:** True isolation, org can't see other org's policies.
**Cons:** Bundle management complexity, more storage.

### Approach 3: OPA Per Tenant (Sidecar)

Each workspace gets its own OPA instance:

```
Workspace "acme-prod" → OPA instance (port 8181) with acme policies
Workspace "beta-dev"  → OPA instance (port 8182) with beta policies
```

Application routes to correct OPA based on tenant context.

**Pros:** Complete isolation, independent scaling.
**Cons:** Resource overhead, operational complexity.

## Recommendation

**Phase 1:** Approach 1 (Layered) — minimal change, works for <50 orgs.
**Phase 2:** Approach 2 (Per-Tenant Bundles) — for scale and true isolation.
**Phase 3:** Approach 3 (Per-Tenant OPA) — for enterprise with strict isolation needs.

## Policy Management API

```
GET    /api/v1/policies                          # List active policies
GET    /api/v1/policies/org/:orgId               # Get org-level policies
PUT    /api/v1/policies/org/:orgId               # Update org policies
GET    /api/v1/policies/workspace/:tenantId      # Get workspace policies
PUT    /api/v1/policies/workspace/:tenantId      # Update workspace policies
POST   /api/v1/policies/validate                 # Validate Rego syntax
POST   /api/v1/policies/test                     # Run policy tests
```

## Policy Authoring UX

Admin UI page for policy management:
- Code editor with Rego syntax highlighting
- Test runner (input → expected output)
- Diff view for changes
- Publish flow: draft → test → publish

## Bundle Structure

```json
{
  "orgId": "org-acme",
  "workspaceId": "ws-prod",
  "policies": {
    "tool_access": "package scenario.tool\n...",
    "cost_limits": "package scenario.cost\n...",
    "custom_rules": "package scenario.custom\n..."
  },
  "data": {
    "allowed_tools": ["api-call", "database-query"],
    "cost_limit": 1.00,
    "blocked_tools": ["web-search"]
  },
  "version": "2024-03-26T14:00:00Z"
}
```

## Dependencies

- N-15 (OPA production stance) — base OPA configuration
- N-11 (Org/Workspace) — org/workspace identifiers
- N-13 (Trusted tenant mapping) — routing to correct policy bundle
