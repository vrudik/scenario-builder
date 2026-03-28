# Webhook / Event Contract — Design Document

Status: **RFC / Design**

## Overview

External webhook delivery for scenario lifecycle events, enabling integrations with third-party systems.

## Event Types

| Event | Trigger | Payload Contains |
|-------|---------|-----------------|
| `execution.started` | Scenario execution begins | executionId, scenarioId, timestamp |
| `execution.completed` | Execution finishes successfully | executionId, result, duration, cost |
| `execution.failed` | Execution fails | executionId, error, failedNode |
| `execution.compensated` | Saga compensation completed | executionId, compensatedNodes |
| `node.completed` | Individual node completes | executionId, nodeId, output |
| `guardrail.triggered` | Guardrail blocks an action | executionId, guardrailType, reason |
| `policy.denied` | OPA policy denies a tool call | executionId, toolId, policyDecision |
| `quota.warning` | Usage approaching limit | orgId, metric, current, limit |
| `quota.exceeded` | Usage limit exceeded | orgId, metric, current, limit |

## Webhook Configuration

```
POST /api/v1/webhooks
{
  "url": "https://example.com/webhook",
  "events": ["execution.completed", "execution.failed"],
  "secret": "whsec_...",
  "active": true
}
```

### Prisma Model

```prisma
model WebhookEndpoint {
  id        String   @id @default(uuid())
  orgId     String
  url       String
  events    String   // JSON array of event types
  secret    String   // HMAC signing secret
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([orgId])
  @@index([active])
}
```

## Delivery Format

```http
POST https://example.com/webhook
Content-Type: application/json
X-Webhook-Id: wh_abc123
X-Webhook-Signature: sha256=<hmac>
X-Webhook-Timestamp: 1711468800

{
  "id": "evt_xyz789",
  "type": "execution.completed",
  "timestamp": "2024-03-26T14:00:00Z",
  "data": {
    "executionId": "exec-123",
    "scenarioId": "scn-456",
    "status": "completed",
    "duration": 2340,
    "cost": 0.04,
    "nodesCompleted": 3
  }
}
```

## Signature Verification

HMAC-SHA256 of `timestamp.body` with webhook secret:

```javascript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${JSON.stringify(body)}`)
  .digest('hex');
```

Client verifies: `X-Webhook-Signature === 'sha256=' + computed`.

## Delivery Guarantees

| Property | Value |
|----------|-------|
| Delivery | At-least-once |
| Timeout | 10 seconds |
| Retries | 3 (exponential backoff: 10s, 60s, 300s) |
| Deduplication | Client-side via `id` field |
| Ordering | Best-effort (not guaranteed) |

## API

```
POST   /api/v1/webhooks              # Create endpoint
GET    /api/v1/webhooks              # List endpoints
GET    /api/v1/webhooks/:id          # Get endpoint
PATCH  /api/v1/webhooks/:id          # Update endpoint
DELETE /api/v1/webhooks/:id          # Delete endpoint
POST   /api/v1/webhooks/:id/test     # Send test event
GET    /api/v1/webhooks/:id/deliveries  # Delivery log
```
