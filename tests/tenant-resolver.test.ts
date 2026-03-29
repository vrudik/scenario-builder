import { describe, it, expect, afterAll } from 'vitest';
import { resolveTenant, clearTenantCache } from '../src/web/tenant-resolver';
import { prisma } from '../src/db/index';

describe('tenant-resolver', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exports resolveTenant function', async () => {
    const mod = await import('../src/web/tenant-resolver');
    expect(typeof mod.resolveTenant).toBe('function');
  });

  it('clearTenantCache does not throw', () => {
    expect(() => clearTenantCache()).not.toThrow();
  });

  it('returns null when header tenant is not in org workspaces', async () => {
    clearTenantCache();
    const slug = `tenant-res-${Date.now()}`;
    const org = await prisma.org.create({ data: { name: 'TR Org', slug } });
    const tenantId = `tid-${Date.now()}`;
    await prisma.workspace.create({
      data: {
        orgId: org.id,
        name: 'Main',
        slug: `ws-${Date.now()}`,
        tenantId,
      },
    });

    const denied = await resolveTenant({ orgId: org.id, tenantId }, 'foreign-tenant');
    expect(denied).toBeNull();

    const allowed = await resolveTenant({ orgId: org.id, tenantId }, tenantId);
    expect(allowed?.tenantId).toBe(tenantId);
    expect(allowed?.orgId).toBe(org.id);

    await prisma.workspace.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
    clearTenantCache();
  });

  it('allows switching to another workspace tenant in the same org via header', async () => {
    clearTenantCache();
    const slug = `tenant-res2-${Date.now()}`;
    const org = await prisma.org.create({ data: { name: 'TR Org 2', slug } });
    const t1 = `tid1-${Date.now()}`;
    const t2 = `tid2-${Date.now()}`;
    await prisma.workspace.createMany({
      data: [
        { orgId: org.id, name: 'A', slug: `ws-a-${Date.now()}`, tenantId: t1 },
        { orgId: org.id, name: 'B', slug: `ws-b-${Date.now()}`, tenantId: t2 },
      ],
    });

    const r = await resolveTenant({ orgId: org.id, tenantId: t1 }, t2);
    expect(r).toEqual({ tenantId: t2, orgId: org.id });

    await prisma.workspace.deleteMany({ where: { orgId: org.id } });
    await prisma.org.delete({ where: { id: org.id } });
    clearTenantCache();
  });
});
