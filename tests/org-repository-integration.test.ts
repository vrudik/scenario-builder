import { describe, it, expect, afterAll } from 'vitest';
import { OrgRepository } from '../src/db/repositories/org-repository';
import { prisma } from '../src/db/index';

const repo = new OrgRepository();
const slug = `org-repo-${Date.now()}`;
let orgId: string;
let workspaceId: string;

describe('OrgRepository integration', () => {
  afterAll(async () => {
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    if (orgId) await prisma.org.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('createOrg and findOrgById', async () => {
    const org = await repo.createOrg({ name: 'Repo Test', slug });
    orgId = org.id;
    const found = await repo.findOrgById(orgId);
    expect(found?.slug).toBe(slug);
    expect(found?.name).toBe('Repo Test');
  });

  it('createWorkspace and listWorkspaces', async () => {
    const t = `tw-${Date.now()}`;
    const ws = await repo.createWorkspace(orgId, {
      name: 'Main',
      slug: 'main',
      tenantId: t,
    });
    workspaceId = ws.id;
    expect(ws.tenantId).toBe(t);
    const list = await repo.listWorkspaces(orgId);
    expect(list.some(w => w.id === ws.id)).toBe(true);
  });
});
