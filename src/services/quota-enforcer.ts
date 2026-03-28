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

export async function checkQuota(orgId: string, metric: string): Promise<QuotaCheckResult> {
  const period = currentPeriod();

  const quota = await prisma.quotaConfig.findUnique({
    where: { orgId_metric_period: { orgId, metric, period: 'monthly' } },
  });

  if (!quota) {
    return { allowed: true, metric, current: 0, limit: null, action: 'none', remaining: null };
  }

  const usage = await prisma.usageRecord.findUnique({
    where: { orgId_tenantId_period_metric: { orgId, tenantId: 'default', period, metric } },
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
