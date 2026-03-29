# Outbound webhook delivery contract

Scenario Builder delivers lifecycle notifications to URLs registered in `WebhookEndpoint` (see `POST /api/webhooks`). This document is the consumer-facing contract for verifying and handling those requests.

## Transport

- **Method:** `POST`
- **Content-Type:** `application/json`
- **User-Agent:** `Scenario-Builder-Webhook/1` (for log filtering; do not rely on it for security)

## Request body (JSON)

Each delivery is a single JSON object:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique id for **this delivery attempt**. Use for idempotent processing (the same logical event may be retried with a **new** `id`). |
| `type` | string | Event type (e.g. `test`, or orchestrator lifecycle types). |
| `data` | object | Event-specific payload. |
| `timestamp` | string (ISO 8601) | Event time as emitted by the producer (may differ from signing timestamp). |

Example:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "test",
  "data": { "message": "Test webhook delivery" },
  "timestamp": "2026-03-29T12:00:00.000Z"
}
```

## Headers

| Header | Description |
|--------|-------------|
| `X-Webhook-Id` | Same UUID as body `id` for this attempt. |
| `X-Webhook-Timestamp` | ISO 8601 time used for signing (delivery time). |
| `X-Webhook-Signature` | `sha256=<hex>` HMAC-SHA256 of the string `timestamp + '.' + rawBody` using the endpoint **secret** (UTF-8). `rawBody` is the exact JSON string sent as the body (same bytes as verification). |

### Verifying the signature

1. Read the raw request body as a string (do not re-serialize parsed JSON).
2. Let `ts` = value of `X-Webhook-Timestamp`.
3. Compute `HMAC_SHA256(secret, ts + '.' + rawBody)` as lowercase hex.
4. Compare securely to the value after `sha256=` in `X-Webhook-Signature`.

Reject if the timestamp is too far from your server clock (e.g. ±5 minutes) to limit replay windows.

## HTTP response

- **2xx:** Treated as success; no retries for that attempt.
- **4xx:** Treated as success for retry purposes (no further retries). Fix the client or URL.
- **5xx or network error:** Retried with exponential backoff.

## Retries and reliability

- **Attempts:** Up to **4** tries (initial + **3** retries).
- **Timeout:** **10 seconds** per attempt.
- **Backoff:** `min(1000 * 2^attempt, 8000)` ms between attempts (`attempt` is the retry index after the first try).
- **Idempotency:** Because `id` changes per attempt, consumers should key idempotency on business keys inside `data` if needed, not only on `id`.

## Registration API (admin)

- List: `GET /api/webhooks?orgId=<org>` (scope `config:read`)
- Create: `POST /api/webhooks` with `{ "orgId", "url", "events": ["*"] | ["type1", ...] }` (scope `config:write`) — response includes `secret` **once**.
- Update: `PATCH /api/webhooks/:id` with optional `url`, `events`, `active`.
- Test: `POST /api/webhooks/:id/test`
- Delete: `DELETE /api/webhooks/:id`

Admin UI: `/admin-webhooks.html`.
