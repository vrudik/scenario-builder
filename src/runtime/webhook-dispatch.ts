import { WebhookRepository } from '../db/repositories/webhook-repository.js';
import { deliverWebhook } from '../services/webhook-delivery.js';

/**
 * Canonical types per docs/design/WEBHOOK_EVENT_CONTRACT.md; legacy aliases keep existing subscriptions working.
 */
const WEBHOOK_EVENT_TYPE_ALIASES: Record<string, readonly string[]> = {
  'execution.started': ['scenario.started'],
  'execution.completed': ['scenario.completed'],
  'execution.failed': ['scenario.failed'],
  'node.completed': ['tool.completed'],
};

/** All event type strings that should match the same subscribers as `eventType`. */
export function expandWebhookEventTypes(eventType: string): string[] {
  const out = new Set<string>([eventType]);
  const legacies = WEBHOOK_EVENT_TYPE_ALIASES[eventType];
  if (legacies) {
    for (const t of legacies) out.add(t);
  }
  for (const [canonical, legs] of Object.entries(WEBHOOK_EVENT_TYPE_ALIASES)) {
    if (legs.includes(eventType)) out.add(canonical);
  }
  return [...out];
}

let _repo: WebhookRepository | null = null;

function getRepo(): WebhookRepository {
  if (!_repo) {
    _repo = new WebhookRepository();
  }
  return _repo;
}

export async function dispatchWebhooks(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const repo = getRepo();
    const variants = expandWebhookEventTypes(eventType);
    const endpoints = await repo.findActiveByEvents(variants);
    const timestamp = new Date().toISOString();
    for (const ep of endpoints) {
      deliverWebhook(ep, { type: eventType, data, timestamp }).catch(() => {});
    }
  } catch {
    // best-effort — never block the caller
  }
}
