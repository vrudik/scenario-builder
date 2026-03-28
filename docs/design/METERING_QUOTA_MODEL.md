# Metering / Quota Model — Design Document

Status: **RFC / Design**
Priority: P0

## Overview

This document defines how usage is measured, quotas are enforced, and usage data is exposed.

## Metered Dimensions

| Dimension | Unit | Counted At | Primary Use |
|-----------|------|-----------|-------------|
| **Executions** | count | Execution start | Billing, tier enforcement |
| **Tool Calls** | count | Tool Gateway | Cost analysis, rate limiting |
| **LLM Tokens** | count (input + output) | Agent Runtime | Cost tracking |
| **Execution Duration** | seconds | Execution complete | Performance monitoring |
| **Storage** | MB | Database | Capacity planning |
| **API Calls** | count | Auth middleware | Rate limiting |

### Primary Billing Metric: Executions

One execution = one scenario run started via API. This is the metric used for tier enforcement and billing.

## Data Model

```prisma
model UsageRecord {
  id          String   @id @default(uuid())
  orgId       String
  workspaceId String
  tenantId    String
  period      String   // "2024-03" (monthly bucket)
  metric      String   // "executions", "tool_calls", "llm_tokens", etc.
  value       Float    // accumulated value for the period
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  @@unique([orgId, workspaceId, period, metric])
  @@index([orgId, period])
  @@index([tenantId, period])
}

model QuotaConfig {
  id          String   @id @default(uuid())
  orgId       String
  metric      String   // "executions", "api_calls", etc.
  limit       Float    // max value per period
  period      String   // "monthly", "daily", "hourly"
  action      String   // "block", "warn", "throttle"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([orgId, metric, period])
  @@index([orgId])
}
```

## Quota Enforcement

### Enforcement Points

```
API Request → Auth → Quota Check → Route Handler → Execution → Meter
                        ↓
                   Over quota? → 429 Too Many Requests
```

### Enforcement Actions

| Action | Behavior | HTTP Response |
|--------|---------|--------------|
| **block** | Reject request | 429 with `Retry-After` header |
| **warn** | Allow request, log warning | 200 + `X-Quota-Warning` header |
| **throttle** | Delay request | 200 (with added latency) |

### Default Quotas by Tier

| Metric | Free | Pro | Business | Enterprise |
|--------|------|-----|----------|-----------|
| Executions/month | 500 | 5,000 | 25,000 | Unlimited |
| API calls/hour | 100 | 1,000 | 10,000 | 100,000 |
| Tool calls/execution | 50 | 200 | 500 | Configurable |
| LLM tokens/execution | 5,000 | 20,000 | 100,000 | Configurable |
| Concurrent executions | 2 | 10 | 50 | Configurable |
| Scenarios/workspace | 10 | 50 | 200 | Unlimited |
| Templates/workspace | 5 | 50 | 200 | Unlimited |
| API keys/org | 1 | 5 | 20 | Unlimited |

### Quota Check Implementation

```typescript
async function checkQuota(
  orgId: string,
  metric: string,
  increment: number = 1
): Promise<QuotaCheckResult> {
  const config = await getQuotaConfig(orgId, metric);
  if (!config) return { allowed: true }; // No quota = unlimited

  const currentUsage = await getCurrentUsage(orgId, metric, config.period);
  const projected = currentUsage + increment;

  if (projected > config.limit) {
    if (config.action === 'block') {
      return {
        allowed: false,
        reason: `Quota exceeded: ${metric} (${currentUsage}/${config.limit})`,
        retryAfter: getNextPeriodStart(config.period),
      };
    }
    if (config.action === 'warn') {
      return { allowed: true, warning: `Approaching quota: ${metric}` };
    }
  }

  return { allowed: true, remaining: config.limit - projected };
}
```

## Usage Tracking

### Increment Points

| Event | Metric Incremented | Where |
|-------|-------------------|-------|
| `POST /api/execute-*` | `executions` | Execution handler |
| Tool call via Gateway | `tool_calls` | Tool Gateway |
| LLM completion | `llm_tokens` (input + output) | Agent Runtime |
| Any API request | `api_calls` | Auth middleware |

### Batched Writes

Usage records are updated via batched increments (not per-request DB writes):

```typescript
class UsageMeter {
  private buffer = new Map<string, number>();
  private flushInterval = 10_000; // 10 seconds

  increment(orgId: string, metric: string, value: number = 1) {
    const key = `${orgId}:${metric}`;
    this.buffer.set(key, (this.buffer.get(key) || 0) + value);
  }

  async flush() {
    const entries = [...this.buffer.entries()];
    this.buffer.clear();
    // Batch upsert to UsageRecord table
    await prisma.$transaction(
      entries.map(([key, value]) => {
        const [orgId, metric] = key.split(':');
        return prisma.usageRecord.upsert({
          where: { orgId_workspaceId_period_metric: { ... } },
          update: { value: { increment: value } },
          create: { orgId, metric, value, period: currentPeriod() },
        });
      })
    );
  }
}
```

## Usage API

```
GET /api/usage
  ?period=2024-03
  &metric=executions,tool_calls,llm_tokens

Response:
{
  "orgId": "org-acme",
  "period": "2024-03",
  "usage": {
    "executions": { "current": 3420, "limit": 5000, "remaining": 1580 },
    "tool_calls": { "current": 18500, "limit": null, "remaining": null },
    "llm_tokens": { "current": 2450000, "limit": null, "remaining": null }
  }
}

GET /api/usage/history
  ?metric=executions
  &periods=6

Response:
{
  "metric": "executions",
  "history": [
    { "period": "2024-01", "value": 1200 },
    { "period": "2024-02", "value": 2800 },
    { "period": "2024-03", "value": 3420 }
  ]
}
```

## Response Headers

Every API response includes usage context:

```
X-Quota-Remaining: 1580
X-Quota-Limit: 5000
X-Quota-Reset: 2024-04-01T00:00:00Z
X-Usage-Executions: 3420
```

When approaching quota (>80%):
```
X-Quota-Warning: Approaching monthly execution limit (3420/5000)
```

## Admin UI: Usage Dashboard

Display on admin dashboard:
- Current period usage (executions, tool calls, tokens)
- Usage trend chart (last 6 periods)
- Quota progress bars with warning thresholds
- Projected month-end usage

## Dependencies

- N-10 (API Auth) — orgId from identity for usage attribution
- N-11 (Org/Workspace) — org-level quotas
- N-21 (Pricing) — tier → quota mapping
- Existing execution and tool gateway code for meter instrumentation
