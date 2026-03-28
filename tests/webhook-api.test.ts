import { describe, it, expect } from 'vitest';

describe('webhook API', () => {
  it('WebhookEndpoint model exists in Prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const count = await p.webhookEndpoint.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await p.$disconnect();
    }
  });

  it('WebhookRepository can be instantiated', async () => {
    const { WebhookRepository } = await import('../src/db/repositories/webhook-repository');
    const repo = new WebhookRepository();
    expect(typeof repo.create).toBe('function');
    expect(typeof repo.findActiveByEvent).toBe('function');
  });
});
