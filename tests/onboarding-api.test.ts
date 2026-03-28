import { describe, it, expect } from 'vitest';

describe('onboarding API', () => {
  it('Org model has onboardingCompletedAt field', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const org = await p.org.findFirst({ select: { onboardingCompletedAt: true } });
      expect(true).toBe(true);
    } finally {
      await p.$disconnect();
    }
  });
});
