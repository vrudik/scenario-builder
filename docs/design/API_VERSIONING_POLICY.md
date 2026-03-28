# API Versioning Policy

Status: **RFC / Design**

## Strategy

**URL-based major versioning + header-based minor/patch.**

```
Base URL: /api/v1/scenarios
Header:   X-API-Version: 2024-03-26 (date-based for breaking changes within v1)
```

## Version Format

| Component | Format | Example | Meaning |
|-----------|--------|---------|---------|
| Major | URL path | `/api/v1/` | Breaking changes |
| Date version | Header | `X-API-Version: 2024-03-26` | Non-breaking additions |
| No version header | — | — | Latest stable within major |

## Compatibility Rules

1. **Additive changes are NOT breaking:** new fields in response, new optional parameters, new endpoints
2. **Breaking changes require major version bump:** field removal, type changes, behavior changes, endpoint removal
3. **Deprecation period:** 6 months minimum between deprecation notice and removal
4. **Sunset header:** `Sunset: Sat, 01 Mar 2025 00:00:00 GMT` on deprecated endpoints

## Current API Surface (v1 candidates)

| Group | Endpoints | Stability |
|-------|----------|-----------|
| Health | `GET /healthz`, `GET /readyz` | Stable (no versioning needed) |
| Scenarios | `GET/POST /api/scenarios/*` | Stable → v1 |
| Executions | `POST /api/execute-*`, `GET /api/runs/*` | Stable → v1 |
| Templates | `GET/POST /api/templates/*` | Stable → v1 |
| Queues | `GET/POST /api/queues/*` | Stable → v1 |
| Agent | `POST /api/agent/execute` | Stable → v1 |
| Audit | `GET /api/audit/*` | Stable → v1 |
| Auth | `POST /api/auth/*` | New → v1 |
| Org/Workspace | `GET/POST /api/orgs/*` | New → v1 |
| Usage | `GET /api/usage/*` | New → v1 |
| WebSocket | `WS /ws/*` | Stable → v1 |

## Deprecation Process

```
1. Mark endpoint as deprecated in docs and response header
   → Deprecation: true
   → Link: <https://docs.example.com/deprecation/endpoint-name>
2. Log deprecation warnings for callers using deprecated endpoints
3. After 6 months → remove endpoint, return 410 Gone
```

## Client Guidelines

```
Accept: application/json
X-API-Version: 2024-03-26  (optional, pin to known version)
```

If `X-API-Version` is not provided, the API returns the latest behavior within the major version.

## Changelog Format

Each API change documented in `CHANGELOG.md`:

```markdown
## API Changes

### 2024-03-26
- Added `orgId` field to execution response
- Added `GET /api/v1/usage` endpoint
- Deprecated `GET /api/status` in favor of `GET /api/v1/health`
```
