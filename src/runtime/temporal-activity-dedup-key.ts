/**
 * Стабильный ключ для дедупликации результата Temporal activity при retry
 * (тот же workflow run + тот же scheduled activity).
 */

import { Context } from '@temporalio/activity';
import { normalizeTenantId } from '../utils/tenant-id';

export function buildTemporalActivityDedupKey(info: {
  workflowExecution: { workflowId: string; runId: string };
  activityId: string;
}): string {
  const we = info.workflowExecution;
  return `temporal|${we.workflowId}|${we.runId}|${info.activityId}`;
}

/**
 * Вне контекста activity (тесты, прямой вызов функции) — null, кэш не используется.
 */
export function getTemporalActivityDedupKeyOrNull(): string | null {
  try {
    const info = Context.current().info;
    return buildTemporalActivityDedupKey(info);
  } catch {
    return null;
  }
}

/** Префикс тенанта для БД-кэша и idempotencyKey gateway (изоляция multi-tenant). */
export function buildTenantScopedActivityDedupKey(
  tenantId: string | undefined,
  baseKey: string
): string {
  return `${normalizeTenantId(tenantId)}|${baseKey}`;
}
