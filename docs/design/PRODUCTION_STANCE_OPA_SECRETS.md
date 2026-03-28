# Production Stance: OPA & Secrets — Design Document

Status: **RFC / Design**
Priority: P0

## Overview

This document defines the recommended production defaults for OPA policy engine and secrets management.

## OPA Production Stance

### Current Defaults (Development)

```env
OPA_URL=               # empty = OPA disabled
OPA_FAIL_OPEN=true     # if OPA unreachable, allow action
OPA_TIMEOUT_MS=2500    # 2.5s timeout
```

### Recommended Production Defaults

```env
OPA_URL=http://opa:8181            # OPA sidecar or service
OPA_FAIL_OPEN=false                # if OPA unreachable, DENY action
OPA_TIMEOUT_MS=1000                # tighter timeout for production
```

### Fail-Open vs Fail-Closed

| Setting | Behavior | When to Use |
|---------|----------|-------------|
| `OPA_FAIL_OPEN=true` | OPA down → allow all tool calls | Development, demos |
| `OPA_FAIL_OPEN=false` | OPA down → deny all tool calls | **Production** |

**Production rationale:** In regulated environments, "deny by default" is the only acceptable posture. If the policy engine is unavailable, no autonomous actions should proceed. This prevents uncontrolled agent behavior during outages.

### OPA Deployment Modes

| Mode | Setup | Latency | Resilience |
|------|-------|---------|-----------|
| **Sidecar** | OPA container alongside app | <1ms | Pod-level |
| **Service** | Dedicated OPA deployment | 1-5ms | Service-level HA |
| **Bundle** | Pre-compiled policy bundle | <1ms | No external dependency |

**Recommended:** Sidecar for single-instance, Service for multi-instance with shared policy.

### Policy Bundle Management

```bash
# Build bundle from policy files
npm run bundle:opa
# Output: build/opa-policy-bundle.tar.gz

# Run OPA with bundle
opa run --server --addr :8181 build/opa-policy-bundle.tar.gz
```

For production:
- Store bundles in a policy registry (S3, GCS, or OCI)
- OPA auto-polls for bundle updates (configurable interval)
- Bundle signing for integrity verification

### Health Monitoring

```
GET /health          → OPA liveness
GET /health?bundles  → OPA bundle status
```

Application should monitor OPA health and alert on:
- OPA unreachable for >30s
- Bundle load failures
- Policy evaluation errors

## Secrets Management

### Current State

All secrets via environment variables, some in `.env` file:

| Secret | Current Location | Risk |
|--------|-----------------|------|
| `OPENAI_API_KEY` | `.env` file | Medium — file on disk |
| `DATABASE_URL` | `.env` file | Low — local SQLite |
| `SESSION_SECRET` | Not yet implemented | — |
| `SERVICE_SECRET` | Not yet implemented | — |

### Production Recommendations

#### Tier 1: Required Secrets

| Secret | Purpose | Requirements |
|--------|---------|-------------|
| `SESSION_SECRET` | JWT signing for admin UI sessions | 64+ bytes, cryptographically random |
| `SERVICE_SECRET` | Internal service token derivation | 64+ bytes, cryptographically random |
| `OPENAI_API_KEY` | LLM provider access | Rotate quarterly, scope to minimum permissions |
| `DATABASE_URL` | Database connection (PostgreSQL in prod) | Use connection pooler, SSL required |

#### Tier 2: Recommended Secrets

| Secret | Purpose | Requirements |
|--------|---------|-------------|
| `ADMIN_PASSWORD` | Phase 1 admin UI auth | Strong password, rotate monthly |
| Kafka credentials | Event bus authentication | SASL/SCRAM or mTLS |
| GHCR token | Container registry access | Scoped to pull only in production |

### Secret Storage Hierarchy

| Environment | Recommendation |
|-------------|---------------|
| **Development** | `.env` file (gitignored) |
| **CI/CD** | GitHub Actions secrets |
| **Staging** | Docker secrets or environment injection |
| **Production (self-hosted)** | HashiCorp Vault, AWS Secrets Manager, or k8s secrets |
| **Production (Docker)** | Docker Swarm secrets or bind-mounted secret files |

### .env File Security

```
.env          → gitignored, contains actual secrets
.env.example  → committed, contains placeholder values only
.env.staging  → gitignored, staging-specific values
```

**Rules:**
1. Never commit `.env` with real secrets
2. `.env.example` must never contain real values
3. Rotate secrets immediately if exposed
4. Use different secrets per environment

### Secret Rotation

| Secret | Rotation Policy |
|--------|----------------|
| `SESSION_SECRET` | On security incident, or every 90 days |
| `SERVICE_SECRET` | On security incident, or every 90 days |
| `OPENAI_API_KEY` | Every 90 days, or on personnel change |
| API keys (customer) | Customer-controlled, max age configurable |
| `ADMIN_PASSWORD` | Every 30 days |

### Environment Variable Validation

On startup, the application should validate critical secrets:

```typescript
function validateSecrets() {
  const required = ['SESSION_SECRET', 'SERVICE_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (process.env.AUTH_MODE === 'required' && missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 64) {
    throw new Error('SESSION_SECRET must be at least 64 characters');
  }
}
```

## Production Checklist

```
[ ] OPA_FAIL_OPEN=false
[ ] OPA_URL points to running OPA instance
[ ] OPA health monitoring configured
[ ] Policy bundle tested and versioned
[ ] SESSION_SECRET set (64+ bytes)
[ ] SERVICE_SECRET set (64+ bytes)
[ ] AUTH_MODE=required
[ ] DATABASE_URL points to PostgreSQL with SSL
[ ] OPENAI_API_KEY scoped to minimum permissions
[ ] .env file not present in production (secrets via env injection)
[ ] Secret rotation schedule documented
[ ] Monitoring alerts for OPA failures
[ ] Monitoring alerts for auth failures
```

## Docker Compose Production Example

```yaml
services:
  app:
    image: ghcr.io/org/scenario-builder:latest
    environment:
      AUTH_MODE: required
      OPA_URL: http://opa:8181
      OPA_FAIL_OPEN: "false"
      OPA_TIMEOUT_MS: "1000"
      DATABASE_URL: ${DATABASE_URL}
    secrets:
      - session_secret
      - service_secret
      - openai_api_key

  opa:
    image: openpolicyagent/opa:latest
    command: run --server --addr :8181 /policies
    volumes:
      - ./policies:/policies:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8181/health"]
      interval: 10s
      timeout: 5s
      retries: 3

secrets:
  session_secret:
    file: ./secrets/session_secret
  service_secret:
    file: ./secrets/service_secret
  openai_api_key:
    file: ./secrets/openai_api_key
```
