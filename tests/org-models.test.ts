import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Org/Workspace/OrgMember CRUD', () => {
  let prisma: any;
  let testOrgId: string;

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    if (testOrgId) {
      await prisma.orgMember.deleteMany({ where: { orgId: testOrgId } });
      await prisma.workspace.deleteMany({ where: { orgId: testOrgId } });
      await prisma.org.deleteMany({ where: { id: testOrgId } });
    }
    await prisma.$disconnect();
  });

  it('creates an org', async () => {
    const org = await prisma.org.create({
      data: { name: 'Test Org', slug: 'test-org-crud-' + Date.now(), plan: 'pro' },
    });
    testOrgId = org.id;
    expect(org.name).toBe('Test Org');
    expect(org.plan).toBe('pro');
    expect(org.status).toBe('active');
  });

  it('creates a workspace under org', async () => {
    const ws = await prisma.workspace.create({
      data: {
        orgId: testOrgId,
        name: 'Test Workspace',
        slug: 'test-ws',
        tenantId: 'test-tenant-' + Date.now(),
        environment: 'staging',
      },
    });
    expect(ws.orgId).toBe(testOrgId);
    expect(ws.environment).toBe('staging');
  });

  it('creates a member in org', async () => {
    const member = await prisma.orgMember.create({
      data: {
        orgId: testOrgId,
        userId: 'user-' + Date.now(),
        email: 'test-' + Date.now() + '@example.com',
        role: 'builder',
      },
    });
    expect(member.role).toBe('builder');
    expect(member.status).toBe('active');
  });

  it('lists workspaces by orgId', async () => {
    const workspaces = await prisma.workspace.findMany({ where: { orgId: testOrgId } });
    expect(workspaces.length).toBeGreaterThanOrEqual(1);
  });

  it('lists members by orgId', async () => {
    const members = await prisma.orgMember.findMany({ where: { orgId: testOrgId } });
    expect(members.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces unique slug on org', async () => {
    const existingOrg = await prisma.org.findUnique({ where: { id: testOrgId } });
    await expect(
      prisma.org.create({ data: { name: 'Dup', slug: existingOrg.slug } })
    ).rejects.toThrow();
  });
});
