import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { checkQuota, resolveOrgIdForTenant } from '../src/services/quota-enforcer';
import { UsageMeter, currentPeriod } from '../src/services/usage-meter';

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slug = `quota-test-${suffix}`;
const tenantId = `t-quota-${suffix}`;

describe('quota + usage integration', () => {
  let orgId: string;

  beforeAll(async () => {
    const org = await prisma.org.create({
      data: { name: 'Quota Test Org', slug, plan: 'free', status: 'active' },
    });
    orgId = org.id;
    await prisma.workspace.create({
      data: {
        orgId,
        name: 'W',
        slug: `w-${suffix}`,
        tenantId,
        environment: 'production',
      },
    });
  });

  afterAll(async () => {
    await prisma.quotaConfig.deleteMany({ where: { orgId } });
    await prisma.usageRecord.deleteMany({ where: { orgId } });
    await prisma.workspace.deleteMany({ where: { orgId } });
    await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('resolveOrgIdForTenant maps workspace tenant to org', async () => {
    const resolved = await resolveOrgIdForTenant(tenantId);
    expect(resolved).toBe(orgId);
  });

  it('checkQuota blocks when usage at limit', async () => {
    const period = currentPeriod();
    await prisma.usageRecord.deleteMany({ where: { orgId, tenantId, period, metric: 'executions' } });
    await prisma.quotaConfig.deleteMany({ where: { orgId, metric: 'executions', period: 'monthly' } });
    await prisma.quotaConfig.create({
      data: { orgId, metric: 'executions', limitVal: 5, period: 'monthly', action: 'block' },
    });
    await prisma.usageRecord.create({
      data: { orgId, tenantId, period, metric: 'executions', value: 5 },
    });
    const r = await checkQuota(tenantId, 'executions');
    expect(r.allowed).toBe(false);
    expect(r.limit).toBe(5);
    expect(r.current).toBe(5);
  });

  it('UsageMeter flush persists aggregated value', async () => {
    const period = currentPeriod();
    await prisma.usageRecord.deleteMany({ where: { orgId, tenantId, period, metric: 'api_calls' } });
    const meter = new UsageMeter();
    meter.track(orgId, tenantId, 'api_calls', 2);
    meter.track(orgId, tenantId, 'api_calls', 3);
    await meter.flush();
    meter.stop();
    const row = await prisma.usageRecord.findUnique({
      where: { orgId_tenantId_period_metric: { orgId, tenantId, period, metric: 'api_calls' } },
    });
    expect(row?.value).toBe(5);
  });
});
