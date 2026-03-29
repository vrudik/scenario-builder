import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UsageMeter, currentPeriod } from '../src/services/usage-meter';

describe('usage meter', () => {
  let prisma: any;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.usageRecord.deleteMany({ where: { orgId: 'test-meter-org' } });
    await prisma.$disconnect();
  });

  it('currentPeriod returns YYYY-MM format', () => {
    const period = currentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('track + flush writes aggregated records to DB', async () => {
    const meter = new UsageMeter();
    const period = currentPeriod();

    meter.track('test-meter-org', 'default', 'executions', 3);
    meter.track('test-meter-org', 'default', 'executions', 2);
    meter.track('test-meter-org', 'default', 'tool_calls', 5);

    await meter.flush();

    const execRecord = await prisma.usageRecord.findUnique({
      where: { orgId_tenantId_period_metric: { orgId: 'test-meter-org', tenantId: 'default', period, metric: 'executions' } },
    });
    expect(execRecord).not.toBeNull();
    expect(execRecord.value).toBe(5);

    const toolRecord = await prisma.usageRecord.findUnique({
      where: { orgId_tenantId_period_metric: { orgId: 'test-meter-org', tenantId: 'default', period, metric: 'tool_calls' } },
    });
    expect(toolRecord).not.toBeNull();
    expect(toolRecord.value).toBe(5);

    meter.stop();
  });

  it('increments existing records on subsequent flushes', async () => {
    const meter = new UsageMeter();
    const period = currentPeriod();

    meter.track('test-meter-org', 'default', 'executions', 10);
    await meter.flush();

    const record = await prisma.usageRecord.findUnique({
      where: { orgId_tenantId_period_metric: { orgId: 'test-meter-org', tenantId: 'default', period, metric: 'executions' } },
    });
    expect(record.value).toBe(15); // 5 from previous test + 10

    meter.stop();
  });
});
