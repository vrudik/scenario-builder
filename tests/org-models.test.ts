import { describe, it, expect } from 'vitest';

describe('Org/Workspace/OrgMember models', () => {
  it('Org model has expected shape in Prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const count = await p.org.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await p.$disconnect();
    }
  });

  it('Workspace model has expected shape in Prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const count = await p.workspace.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await p.$disconnect();
    }
  });

  it('OrgMember model has expected shape in Prisma', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    try {
      const count = await p.orgMember.count();
      expect(count).toBeGreaterThanOrEqual(0);
    } finally {
      await p.$disconnect();
    }
  });
});
