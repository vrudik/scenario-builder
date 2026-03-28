import { describe, it, expect } from 'vitest';

describe('usage API', () => {
  it('UsageRecord model exists', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const count = await p.usageRecord.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await p.$disconnect();
    }
  });

  it('QuotaConfig model exists', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const count = await p.quotaConfig.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await p.$disconnect();
    }
  });
});
