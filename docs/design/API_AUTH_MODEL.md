# API Auth Model — Design Document

Status: **RFC / Design**
Depends on: N-11 (Org/Workspace model), N-12 (RBAC)
Priority: P0

## Current State

- No HTTP authentication — all API endpoints are publicly accessible
- `X-Tenant-ID` header provides tenant scoping but is not authenticated
- Tool-level authorization exists (OPA policies, role checks) but `userRoles` is hardcoded to `['user']`
- Prisma schema has `userId`/`userRoles` fields but no `User`, `ApiKey`, or `Session` models

## Design Goals

1. **Secure API access** — every API call must be authenticated
2. **Backward compatible** — opt-in by default, gradual migration
3. **Self-hosted friendly** — no dependency on external auth providers (but support for them)
4. **Multi-tenant aware** — API keys scoped to organizations/workspaces
5. **Auditable** — every auth event logged

## Auth Methods

### 1. API Keys (Primary — Machine-to-Machine)

The primary auth method for programmatic access.

```
Authorization: Bearer sb_live_<key>
```

**Key format:** `sb_<env>_<random>` where:
- `sb_` — product prefix (Scenario Builder)
- `live_` / `test_` — environment scope
- `<random>` — 32-byte hex

**Storage:**
- Keys stored as SHA-256 hash in DB (never plaintext after creation)
- Displayed once at creation time, never retrievable again
- Metadata: name, orgId, createdBy, createdAt, lastUsedAt, expiresAt

**Prisma model:**

```prisma
model ApiKey {
  id          String    @id @default(uuid())
  name        String
  keyPrefix   String    // first 8 chars for identification (e.g. "sb_live_a1b2")
  keyHash     String    @unique // SHA-256 of full key
  orgId       String
  org         Org       @relation(fields: [orgId], references: [id])
  createdBy   String
  roles       String    // JSON array of roles
  scopes      String?   // JSON array of allowed scopes (null = all)
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([keyHash])
  @@index([orgId])
}
```

**Lifecycle:**
- Create → display key → store hash
- Rotate → create new + set expiry on old
- Revoke → set `revokedAt` (soft delete, keeps audit trail)

### 2. Session Auth (Admin UI)

For browser-based admin panel access.

**Phase 1 — Simple password auth:**
- Single admin password set via `ADMIN_PASSWORD` env var
- Session cookie (`sb_session`) with signed JWT
- Session duration: configurable (default 24h)

**Phase 2 — User accounts (later, with N-11 Org model):**
- Email + password with bcrypt
- Invite flow: admin creates user, sends invite link
- Optional: OIDC/SAML integration for enterprise SSO

### 3. Service Tokens (Internal — Worker/Temporal)

For internal service-to-service calls (Temporal worker → API).

```
Authorization: Bearer sb_svc_<token>
```

- Generated at startup, scoped to internal operations
- Not stored in DB — derived from `SERVICE_SECRET` env var
- Used by Temporal workers, event handlers, background jobs

## Middleware Architecture

```
Request → extractAuth(req) → verifyCredential(cred) → resolveIdentity(user, org, roles)
                                                          ↓
                                                    attachContext(req, identity)
                                                          ↓
                                                    next() → handler
```

**`extractAuth(req)`** — extracts credential from:
1. `Authorization: Bearer <token>` header (API key or service token)
2. `sb_session` cookie (session auth)
3. Returns `null` if no credential found

**`verifyCredential(cred)`** — validates:
1. API key: hash lookup in DB, check expiry, check revocation
2. Session: verify JWT signature, check expiry
3. Service token: verify against `SERVICE_SECRET`

**`resolveIdentity()`** — returns:

```typescript
interface AuthIdentity {
  type: 'api_key' | 'session' | 'service';
  userId: string;
  orgId: string;
  tenantId: string;
  roles: string[];
  scopes: string[] | null; // null = all scopes
  apiKeyId?: string;
}
```

## Enforcement Modes

To allow gradual migration:

```
AUTH_MODE=off       # No auth required (current behavior, dev default)
AUTH_MODE=optional  # Auth checked if present, anonymous allowed
AUTH_MODE=required  # Auth required for all API endpoints (production)
```

When `AUTH_MODE=off`:
- Existing `X-Tenant-ID` header behavior preserved
- `userId` defaults to `'anonymous'`
- `userRoles` defaults to `['admin']` (full access in dev)

When `AUTH_MODE=required`:
- Unauthenticated requests → 401
- Invalid credentials → 401
- Missing required scope → 403
- `X-Tenant-ID` ignored — tenant resolved from API key's org

## Endpoint Protection

| Endpoint Group | Auth Required | Scopes |
|---------------|--------------|--------|
| `GET /healthz`, `GET /readyz` | No | — |
| `GET /api/status` | No | — |
| `GET /*.html`, static assets | No | — |
| `POST /api/scenarios/*` | Yes | `scenarios:write` |
| `GET /api/scenarios/*` | Yes | `scenarios:read` |
| `POST /api/execute-*` | Yes | `executions:write` |
| `GET /api/runs/*` | Yes | `executions:read` |
| `POST /api/agent/execute` | Yes | `agent:execute` |
| `GET /api/audit/*` | Yes | `audit:read` |
| `POST /api/admin/*` | Yes | `admin:write` |
| `WS /ws/*` | Yes (on connect) | `executions:read` |

## Environment Variables

```bash
# Auth mode: off | optional | required
AUTH_MODE=off

# Session signing secret (required for session auth)
SESSION_SECRET=<random-64-bytes>

# Admin password for Phase 1 UI auth (optional)
ADMIN_PASSWORD=

# Service token secret for internal calls
SERVICE_SECRET=<random-64-bytes>

# API key settings
API_KEY_MAX_AGE_DAYS=365
SESSION_MAX_AGE_HOURS=24
```

## Migration Path

1. **Phase 0 (current):** `AUTH_MODE=off` — no changes to existing behavior
2. **Phase 1:** Add `ApiKey` model, create key management API, add middleware with `AUTH_MODE=optional`
3. **Phase 2:** Add session auth for admin UI, `AUTH_MODE=required` for production
4. **Phase 3:** OIDC/SAML integration, API key scopes enforcement

## API Key Management Endpoints

```
POST   /api/auth/keys          # Create API key (returns key once)
GET    /api/auth/keys          # List keys (prefix, name, lastUsed)
DELETE /api/auth/keys/:id      # Revoke key
POST   /api/auth/keys/:id/rotate  # Rotate key
POST   /api/auth/session       # Login (password → session cookie)
DELETE /api/auth/session       # Logout
```

## Security Considerations

- API keys hashed with SHA-256 before storage
- Rate limiting on auth endpoints (brute force protection)
- Failed auth attempts logged to audit trail
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`
- No key logging in application logs (redacted in all outputs)
- Key prefix (`sb_live_a1b2`) visible in logs for debugging without exposing the full key

## Open Questions

1. Should API keys be scoped to workspaces (within an org) or just orgs?
2. Should we support multiple auth methods per request (e.g., API key + tenant header)?
3. IP allowlisting for API keys — include in Phase 1 or defer?

## Dependencies

- N-11 (Org/Workspace model) — for `orgId` in API keys
- N-12 (RBAC matrix) — for role definitions and scope mapping
- N-13 (Trusted tenant mapping) — for org → tenant resolution
