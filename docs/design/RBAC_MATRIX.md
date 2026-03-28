# RBAC Matrix — Design Document

Status: **RFC / Design**
Depends on: N-11 (Org/Workspace Model)
Required by: N-13 (Trusted Tenant Mapping), N-16 (Audit/Export Boundaries)
Priority: P0

## Roles

Five roles, ordered by privilege level:

| Role | Scope | Purpose |
|------|-------|---------|
| **owner** | Org | Org creator, billing, can transfer ownership |
| **admin** | Org | Full org management, member management, all workspace access |
| **builder** | Workspace | Create/edit scenarios, templates, tools. Deploy and test. |
| **operator** | Workspace | Execute scenarios, view runs, manage queues. Cannot edit specs. |
| **viewer** | Workspace | Read-only access to scenarios, runs, audit logs. |

### Role Hierarchy

```
owner > admin > builder > operator > viewer
```

Higher roles inherit all permissions of lower roles.

## Permission Matrix

### Org-Level Permissions

| Permission | owner | admin | builder | operator | viewer |
|-----------|-------|-------|---------|----------|--------|
| View org details | Yes | Yes | Yes | Yes | Yes |
| Update org settings | Yes | Yes | — | — | — |
| Manage billing/plan | Yes | — | — | — | — |
| Transfer ownership | Yes | — | — | — | — |
| Delete org | Yes | — | — | — | — |
| Invite members | Yes | Yes | — | — | — |
| Remove members | Yes | Yes | — | — | — |
| Change member roles | Yes | Yes* | — | — | — |
| Create workspace | Yes | Yes | — | — | — |
| Delete workspace | Yes | Yes | — | — | — |
| Manage API keys | Yes | Yes | — | — | — |

*Admin can assign roles up to `admin` but cannot demote other admins or the owner.

### Workspace-Level Permissions

| Permission | admin | builder | operator | viewer |
|-----------|-------|---------|----------|--------|
| **Scenarios** | | | | |
| List/view scenarios | Yes | Yes | Yes | Yes |
| Create scenario | Yes | Yes | — | — |
| Edit scenario spec | Yes | Yes | — | — |
| Delete scenario | Yes | Yes | — | — |
| Change scenario status | Yes | Yes | — | — |
| **Executions** | | | | |
| Execute scenario | Yes | Yes | Yes | — |
| View run details | Yes | Yes | Yes | Yes |
| View run events | Yes | Yes | Yes | Yes |
| Cancel execution | Yes | Yes | Yes | — |
| **Templates** | | | | |
| List/view templates | Yes | Yes | Yes | Yes |
| Create/edit template | Yes | Yes | — | — |
| Delete template | Yes | Yes | — | — |
| **Queues** | | | | |
| List/view queues | Yes | Yes | Yes | Yes |
| Create/manage queue | Yes | Yes | — | — |
| Pause/resume queue | Yes | Yes | Yes | — |
| **Tools** | | | | |
| List/view tools | Yes | Yes | Yes | Yes |
| Register tool | Yes | Yes | — | — |
| Modify tool config | Yes | Yes | — | — |
| **Audit** | | | | |
| View audit logs | Yes | Yes | Yes | Yes |
| Export audit logs | Yes | Yes | — | — |
| **Configuration** | | | | |
| View system config | Yes | Yes | Yes | — |
| Modify workspace config | Yes | — | — | — |
| **Observability** | | | | |
| View metrics/traces | Yes | Yes | Yes | Yes |

### API Scope Mapping

Each permission maps to an API scope (from N-10 auth model):

| Scope | Covers |
|-------|--------|
| `scenarios:read` | List, view scenarios |
| `scenarios:write` | Create, edit, delete, status change |
| `executions:read` | View runs, events |
| `executions:write` | Execute, cancel |
| `templates:read` | List, view templates |
| `templates:write` | Create, edit, delete |
| `queues:read` | List, view queues |
| `queues:write` | Create, manage, pause/resume |
| `tools:read` | List, view tools |
| `tools:write` | Register, modify |
| `audit:read` | View audit logs |
| `audit:export` | Export audit data |
| `config:read` | View configuration |
| `config:write` | Modify configuration |
| `org:read` | View org details |
| `org:write` | Update org, members, workspaces |
| `org:billing` | Billing/plan management |
| `agent:execute` | Direct agent execution |
| `admin:write` | System administration |

### Role → Scopes Default Mapping

| Role | Default Scopes |
|------|---------------|
| owner | All scopes |
| admin | All except `org:billing` (unless also owner) |
| builder | `scenarios:*`, `templates:*`, `tools:*`, `executions:*`, `queues:*`, `audit:read`, `config:read`, `agent:execute` |
| operator | `scenarios:read`, `executions:*`, `templates:read`, `queues:read`, `queues:write` (pause/resume only), `audit:read`, `agent:execute` |
| viewer | `scenarios:read`, `executions:read`, `templates:read`, `queues:read`, `audit:read` |

## Implementation Strategy

### Phase 1: Role Check Middleware

```typescript
interface AuthIdentity {
  userId: string;
  orgId: string;
  role: 'owner' | 'admin' | 'builder' | 'operator' | 'viewer';
  scopes: string[];
}

function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = req.auth; // set by auth middleware
    if (!identity) return res.status(401).json({ error: 'Unauthenticated' });
    if (!identity.scopes.includes(scope) && !identity.scopes.includes('*')) {
      return res.status(403).json({ error: 'Forbidden', required: scope });
    }
    next();
  };
}
```

### Phase 2: OPA Integration

RBAC decisions can be delegated to OPA for complex cases:

```rego
package rbac

default allow = false

allow if {
    input.role == "admin"
}

allow if {
    input.role == "builder"
    input.scope in builder_scopes
}

builder_scopes := {
    "scenarios:read", "scenarios:write",
    "templates:read", "templates:write",
    "tools:read", "tools:write",
    "executions:read", "executions:write",
    "queues:read", "queues:write",
    "audit:read", "config:read",
    "agent:execute"
}
```

## UI Role Mapping

| Admin Page | Minimum Role |
|-----------|-------------|
| Admin Dashboard | viewer |
| Scenarios | viewer (read), builder (write) |
| Spec Studio | builder |
| Runs | viewer (read), operator (execute) |
| Templates | viewer (read), builder (write) |
| Queues | viewer (read), operator (manage) |
| Testing | builder |
| Configuration | admin |
| Monitoring | viewer |
| Components | viewer |
| Observability | viewer |

## Open Questions

1. Should custom roles be supported, or only the 5 predefined roles?
2. Should workspace-level role overrides exist (e.g., admin in org but viewer in specific workspace)?
3. Should API key scopes be freely customizable or tied to the key creator's role?

## Dependencies

- N-10 (API Auth) — scopes used in API key creation
- N-11 (Org/Workspace) — `OrgMember.role` field
- N-13 (Trusted Tenant Mapping) — role-based access to workspaces
