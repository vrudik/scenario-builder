import { prisma } from '../db/index.js';
import { currentPeriod } from './usage-meter.js';

export interface QuotaCheckResult {
  allowed: boolean;
  metric: string;
  current: number;
  limit: number | null;
  action: string;
  remaining: number | null;
}

/**
 * Resolve billing org id from workspace.tenantId, else default org by slug.
 */
export async function resolveOrgIdForTenant(tenantId: string): Promise<string> {
  try {
    const ws = await prisma.workspace.findUnique({
      where: { tenantId },
      select: { orgId: true },
    });
    if (ws?.orgId) return ws.orgId;
    const def = await prisma.org.findUnique({
      where: { slug: 'default' },
      select: { id: true },
    });
    return def?.id ?? 'default';
  } catch {
    return 'default';
  }
}

/**
 * Check quota for a workspace tenant: resolves org from Workspace row, then reads UsageRecord for that org+tenant.
 */
export async function checkQuota(tenantId: string, metric: string): Promise<QuotaCheckResult> {
  const period = currentPeriod();
  const orgId = await resolveOrgIdForTenant(tenantId);

  const quota = await prisma.quotaConfig.findUnique({
    where: { orgId_metric_period: { orgId, metric, period: 'monthly' } },
  });

  if (!quota) {
    return { allowed: true, metric, current: 0, limit: null, action: 'none', remaining: null };
  }

  const usage = await prisma.usageRecord.findUnique({
    where: { orgId_tenantId_period_metric: { orgId, tenantId, period, metric } },
  });

  const current = usage?.value ?? 0;
  const remaining = Math.max(0, quota.limitVal - current);
  const allowed = quota.action !== 'block' || current < quota.limitVal;

  return {
    allowed,
    metric,
    current,
    limit: quota.limitVal,
    action: quota.action,
    remaining,
  };
}
