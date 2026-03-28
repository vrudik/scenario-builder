# OpenAPI / Spec Publication Plan

Status: **RFC / Design**

## Goal

Publish a machine-readable API specification (OpenAPI 3.1) that enables:
- Auto-generated client SDKs
- Interactive API explorer (Swagger UI / Redoc)
- Automated testing against spec
- Third-party integration development

## Approach

### Phase 1: Manual OpenAPI Spec

Write `openapi.yaml` manually based on existing endpoints in `server.cjs` and `src/web/*.ts`.

**Location:** `docs/api/openapi.yaml`

**Scope:** All v1 endpoints from API_VERSIONING_POLICY.md.

### Phase 2: Code-First Generation

Migrate to code-first approach using Zod schemas (already in codebase) to auto-generate OpenAPI:

```
Zod schemas (src/spec/) → zod-to-openapi → openapi.yaml → Swagger UI
```

Libraries: `@asteasolutions/zod-to-openapi` or `zod-openapi`.

### Phase 3: CI Integration

- OpenAPI spec validated in CI (`npm run lint:api`)
- Breaking changes detected automatically
- Docs auto-published on merge to main

## Publication Channels

| Channel | Format | Audience |
|---------|--------|---------|
| `/api/docs` (Swagger UI) | Interactive HTML | Developers |
| `/api/openapi.json` | JSON spec | SDK generators |
| `docs/api/openapi.yaml` | YAML in repo | Contributors |
| Docs site | Redoc static page | Public |

## Spec Structure

```yaml
openapi: "3.1.0"
info:
  title: Scenario Builder API
  version: "1.0.0"
  description: API for managing autonomous scenario executions
paths:
  /api/v1/scenarios:
    get: ...
    post: ...
  /api/v1/scenarios/{id}:
    get: ...
  /api/v1/execute-orchestrator:
    post: ...
  /api/v1/runs:
    get: ...
  /api/v1/templates:
    get: ...
    post: ...
  /api/v1/audit:
    get: ...
  /api/v1/auth/keys:
    get: ...
    post: ...
  /api/v1/orgs:
    get: ...
    post: ...
  /api/v1/usage:
    get: ...
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
    ApiKey:
      type: apiKey
      in: header
      name: Authorization
  schemas:
    Scenario: ...
    Execution: ...
    Template: ...
    AuditLog: ...
```

## Timeline

| Phase | ETA | Deliverable |
|-------|-----|-------------|
| Phase 1 | Sprint 5 | Manual `openapi.yaml` + Swagger UI at `/api/docs` |
| Phase 2 | Sprint 6 | Zod → OpenAPI generation |
| Phase 3 | Sprint 7 | CI validation + auto-publish |
