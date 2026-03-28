import { describe, it, expect } from 'vitest';

describe('template model extensions', () => {
  it('Template model accepts new fields', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const templates = await p.template.findMany({
        take: 1,
        select: { id: true, version: true, difficulty: true, isPublished: true, mockConfig: true, guide: true },
      });
      expect(Array.isArray(templates)).toBe(true);
    } finally {
      await p.$disconnect();
    }
  });
});
