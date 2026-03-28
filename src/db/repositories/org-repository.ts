import { prisma } from '../index';

export class OrgRepository {
  // --- Org ---
  async createOrg(data: { name: string; slug: string; plan?: string }) {
    return prisma.org.create({ data: { name: data.name, slug: data.slug, plan: data.plan ?? 'free' } });
  }

  async findOrgById(id: string) {
    return prisma.org.findUnique({ where: { id }, include: { workspaces: true, _count: { select: { members: true } } } });
  }

  async findOrgBySlug(slug: string) {
    return prisma.org.findUnique({ where: { slug } });
  }

  async listOrgs() {
    return prisma.org.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { workspaces: true, members: true } } } });
  }

  async updateOrg(id: string, data: { name?: string; plan?: string; status?: string }) {
    return prisma.org.update({ where: { id }, data });
  }

  // --- Workspace ---
  async createWorkspace(orgId: string, data: { name: string; slug: string; tenantId: string; environment?: string }) {
    return prisma.workspace.create({ data: { orgId, name: data.name, slug: data.slug, tenantId: data.tenantId, environment: data.environment ?? 'production' } });
  }

  async findWorkspaceById(id: string) {
    return prisma.workspace.findUnique({ where: { id } });
  }

  async listWorkspaces(orgId: string) {
    return prisma.workspace.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  }

  async updateWorkspace(id: string, data: { name?: string; settings?: string; status?: string }) {
    return prisma.workspace.update({ where: { id }, data });
  }

  async findWorkspacesByTenantIds(tenantIds: string[]) {
    return prisma.workspace.findMany({ where: { tenantId: { in: tenantIds } } });
  }

  async findWorkspaceByTenantId(tenantId: string) {
    return prisma.workspace.findUnique({ where: { tenantId } });
  }

  // --- Members ---
  async addMember(orgId: string, data: { userId: string; email: string; role?: string; invitedBy?: string }) {
    return prisma.orgMember.create({ data: { orgId, userId: data.userId, email: data.email, role: data.role ?? 'viewer', invitedBy: data.invitedBy, joinedAt: new Date() } });
  }

  async listMembers(orgId: string) {
    return prisma.orgMember.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  }

  async updateMember(id: string, data: { role?: string; status?: string }) {
    return prisma.orgMember.update({ where: { id }, data });
  }

  async removeMember(id: string) {
    return prisma.orgMember.delete({ where: { id } });
  }

  async findMemberByEmail(orgId: string, email: string) {
    return prisma.orgMember.findUnique({ where: { orgId_email: { orgId, email } } });
  }
}
