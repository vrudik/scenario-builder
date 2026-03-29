import { prisma } from '../index';

export class WebhookRepository {
  async create(data: { orgId: string; url: string; events: string[]; secret: string }) {
    return prisma.webhookEndpoint.create({
      data: { orgId: data.orgId, url: data.url, events: JSON.stringify(data.events), secret: data.secret },
    });
  }

  async findById(id: string) {
    return prisma.webhookEndpoint.findUnique({ where: { id } });
  }

  async listByOrg(orgId: string) {
    return prisma.webhookEndpoint.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orgId: true, url: true, events: true, active: true, createdAt: true, updatedAt: true },
    });
  }

  async update(id: string, data: { url?: string; events?: string[]; active?: boolean }) {
    const updateData: Record<string, unknown> = {};
    if (data.url !== undefined) updateData.url = data.url;
    if (data.events !== undefined) updateData.events = JSON.stringify(data.events);
    if (data.active !== undefined) updateData.active = data.active;
    return prisma.webhookEndpoint.update({ where: { id }, data: updateData });
  }

  async remove(id: string) {
    return prisma.webhookEndpoint.delete({ where: { id } });
  }

  async findActiveByEvent(eventType: string) {
    return this.findActiveByEvents([eventType]);
  }

  /** Match endpoints subscribed to any of the given event types (or `*`). */
  async findActiveByEvents(eventTypes: string[]) {
    const want = new Set(eventTypes);
    const all = await prisma.webhookEndpoint.findMany({ where: { active: true } });
    return all.filter(ep => {
      try {
        const events: string[] = JSON.parse(ep.events);
        if (events.includes('*')) return true;
        return events.some(e => want.has(e));
      } catch {
        return false;
      }
    });
  }
}
