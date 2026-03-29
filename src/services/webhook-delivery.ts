import { createHmac, randomUUID } from 'node:crypto';

interface WebhookEndpointLike {
  id: string;
  url: string;
  secret: string;
}

interface WebhookEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;

function signPayload(payload: string, secret: string, timestamp: string): string {
  return createHmac('sha256', secret)
    .update(timestamp + '.' + payload)
    .digest('hex');
}

export async function deliverWebhook(
  endpoint: WebhookEndpointLike,
  event: WebhookEvent,
  retries = MAX_RETRIES,
): Promise<boolean> {
  const webhookId = randomUUID();
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({
    id: webhookId,
    type: event.type,
    data: event.data,
    timestamp: event.timestamp,
  });
  const signature = signPayload(payload, endpoint.secret, timestamp);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Scenario-Builder-Webhook/1',
          'X-Webhook-Id': webhookId,
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Timestamp': timestamp,
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok || res.status < 500) {
        return res.ok;
      }
    } catch {
      // retry
    }

    if (attempt < retries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.warn(
    `[webhook] delivery failed after ${retries + 1} attempt(s): ${event.type} → ${endpoint.url}`,
  );
  return false;
}

export { signPayload };
