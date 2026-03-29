import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkQuota } from '../src/services/quota-enforcer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const suffix = `qe-${Date.now()}`;
const slug = `quota-enforcer-${suffix}`;
const tenantId = `tenant-qe-${suffix}`;
let orgId: string;

describe('quota enforcer', () => {
  beforeAll(async () => {
    const org = await prisma.org.create({
      data: { name: 'QE Org', slug, plan: 'free', status: 'active' },
    });
    orgId = org.id;
    await prisma.workspace.create({
      data: {
        orgId,
        name: 'QE W',
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

  it('returns allowed=true when no quota configured', async () => {
    const result = await checkQuota('nonexistent-tenant-xyz-12345', 'executions');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBeNull();
  });

  it('returns allowed=true when usage is under limit', async () => {
    await prisma.quotaConfig.upsert({
      where: { orgId_metric_period: { orgId, metric: 'executions', period: 'monthly' } },
      create: { orgId, metric: 'executions', limitVal: 100, period: 'monthly', action: 'block' },
      update: { limitVal: 100, action: 'block' },
    });

    const result = await checkQuota(tenantId, 'executions');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
  });

  it('returns allowed=false when over limit with action=block', async () => {
    const period = new Date().toISOString().slice(0, 7);
    await prisma.usageRecord.upsert({
      where: { orgId_tenantId_period_metric: { orgId, tenantId, period, metric: 'executions' } },
      create: { orgId, tenantId, period, metric: 'executions', value: 150 },
      update: { value: 150 },
    });

    const result = await checkQuota(tenantId, 'executions');
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(150);
    expect(result.remaining).toBe(0);
  });

  it('returns allowed=true when action=warn even if over limit', async () => {
    await prisma.quotaConfig.update({
      where: { orgId_metric_period: { orgId, metric: 'executions', period: 'monthly' } },
      data: { action: 'warn' },
    });

    const result = await checkQuota(tenantId, 'executions');
    expect(result.allowed).toBe(true);
    expect(result.action).toBe('warn');
  });
});
