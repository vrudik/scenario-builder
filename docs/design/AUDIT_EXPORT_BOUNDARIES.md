# Audit / Export Boundaries — Design Document

Status: **RFC / Design**
Depends on: N-11 (Org/Workspace), N-12 (RBAC), N-13 (Trusted Tenant Mapping)
Priority: P0

## Current Audit System

### What Exists

- `AuditLog` model in Prisma with: action, actor, resource, outcome, severity, message, details, traceId, spanId, timestamp
- `AuditService` writes events from orchestrator, agent runtime, tool gateway, eval runner
- `audit-api.ts` provides `GET /api/audit` with filters and `GET /api/audit/stats`
- 14 action types covering scenario lifecycle, agent execution, guardrails, tool calls, eval

### What's Missing

- No org/tenant scoping on audit logs
- No export format standardization
- No retention policy
- No data classification / PII boundaries
- No immutability guarantee beyond DB constraints

## Design: Org-Scoped Audit with Export Boundaries

### Schema Enhancement

Add `orgId` and `tenantId` to audit logs:

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  action      String
  actor       String?
  resource    String?
  outcome     String   @default("success")
  severity    String   @default("info")
  message     String?
  details     String?  // JSON
  traceId     String?
  spanId      String?
  orgId       String?          // NEW: org context
  tenantId    String?          // NEW: workspace context
  timestamp   DateTime @default(now())

  @@index([action])
  @@index([actor])
  @@index([resource])
  @@index([outcome])
  @@index([timestamp])
  @@index([orgId, timestamp])  // NEW
  @@index([tenantId, timestamp]) // NEW
}
```

### Access Boundaries

| Role | Can View | Can Export |
|------|---------|-----------|
| **owner** | All audit logs in org | Yes, all formats |
| **admin** | All audit logs in org | Yes, all formats |
| **builder** | Logs in assigned workspaces | No export |
| **operator** | Logs in assigned workspaces | No export |
| **viewer** | Logs in assigned workspaces | No export |

Export requires `audit:export` scope (owner/admin only).

### Data Classification in Audit Details

Audit `details` field may contain sensitive data. Classification levels:

| Level | What It Contains | Export Behavior |
|-------|-----------------|----------------|
| **public** | Action type, outcome, timestamp, resource IDs | Always exported |
| **internal** | Tool names, node IDs, error messages | Exported with `audit:export` scope |
| **sensitive** | Input/output data, LLM prompts/responses | Redacted by default, opt-in with `include_sensitive=true` |
| **restricted** | PII, credentials, API keys | Never exported, redacted at write time |

### Redaction at Write Time

Before storing audit events:

```typescript
function redactAuditDetails(
  details: Record<string, unknown>,
  piiClassification: string
): Record<string, unknown> {
  if (piiClassification === 'high') {
    return {
      ...details,
      input: '[REDACTED]',
      output: '[REDACTED]',
      prompt: '[REDACTED]',
      response: '[REDACTED]',
    };
  }
  return details;
}
```

### Export API

```
GET /api/audit/export
  ?format=json|csv|ndjson
  &from=2024-01-01T00:00:00Z
  &to=2024-12-31T23:59:59Z
  &actions=tool_call_completed,guardrail_tool_blocked
  &severity=warning,error,critical
  &include_sensitive=false
  &limit=10000
```

Response headers:
```
Content-Type: application/json (or text/csv, application/x-ndjson)
Content-Disposition: attachment; filename="audit-export-2024-01-01-2024-12-31.json"
X-Total-Records: 4523
X-Exported-Records: 4523
X-Redacted-Fields: 12
```

### Export Formats

**JSON** — full structured export:
```json
{
  "exportedAt": "2024-03-26T10:00:00Z",
  "orgId": "org-acme",
  "filters": { "from": "...", "to": "...", "actions": ["..."] },
  "totalRecords": 4523,
  "records": [
    {
      "id": "...",
      "action": "tool_call_completed",
      "actor": "user-123",
      "resource": "exec-456",
      "outcome": "success",
      "severity": "info",
      "message": "Tool 'api-call' executed successfully",
      "details": { "toolId": "api-call", "duration": 234 },
      "traceId": "abc123",
      "timestamp": "2024-03-26T09:30:00Z"
    }
  ]
}
```

**CSV** — tabular export for compliance tools:
```
id,action,actor,resource,outcome,severity,message,timestamp,traceId
...,tool_call_completed,user-123,exec-456,success,info,"Tool 'api-call' executed",2024-03-26T09:30:00Z,abc123
```

**NDJSON** — streaming export for large datasets:
```
{"id":"...","action":"tool_call_completed","actor":"user-123",...}
{"id":"...","action":"guardrail_tool_blocked","actor":"user-456",...}
```

## Retention Policy

### Configurable Retention

```env
AUDIT_RETENTION_DAYS=365          # Default: 1 year
AUDIT_RETENTION_POLICY=archive    # delete | archive
```

| Policy | Behavior |
|--------|---------|
| `delete` | Records older than retention period permanently deleted |
| `archive` | Records exported to archive storage, then deleted from active DB |

### Retention by Severity

| Severity | Minimum Retention |
|----------|------------------|
| `info` | `AUDIT_RETENTION_DAYS` (default 365) |
| `warning` | 2x retention (default 730) |
| `error` | 3x retention (default 1095) |
| `critical` | 5x retention (default 1825) or indefinite |

### Cleanup Job

Background job (daily) that:
1. Identifies records past retention period
2. If `archive` policy: exports to configured storage
3. Deletes from active database
4. Logs cleanup action to audit trail itself

## Immutability Guarantees

| Guarantee | Implementation |
|-----------|---------------|
| No modification | No UPDATE operations on AuditLog table |
| No deletion | DELETE only via retention job, not via API |
| Tamper detection | Optional: hash chain (each record's hash includes previous record's hash) |
| Export integrity | Export includes record count and SHA-256 checksum |

### Hash Chain (Optional, Phase 2)

```prisma
model AuditLog {
  // ... existing fields ...
  prevHash    String?  // SHA-256 of previous record
  recordHash  String?  // SHA-256 of this record's content + prevHash
}
```

This creates a tamper-evident chain — if any record is modified, the chain breaks.

## Compliance Mapping

| Requirement | How Scenario Builder Addresses It |
|-------------|----------------------------------|
| **SOC 2 CC7.2** (System monitoring) | All actions logged with actor, outcome, timestamp |
| **SOC 2 CC6.1** (Access control logging) | Auth events, role changes, API key operations logged |
| **GDPR Art. 30** (Processing records) | Export API provides processing activity records |
| **HIPAA §164.312(b)** (Audit controls) | Immutable audit trail with configurable retention |
| **ISO 27001 A.12.4** (Logging and monitoring) | Severity-based retention, correlation via traceId |

## Open Questions

1. Should the hash chain be mandatory or opt-in?
2. Should we support streaming audit to external SIEM (Splunk, Datadog)?
3. Should retention be configurable per-org or system-wide?
