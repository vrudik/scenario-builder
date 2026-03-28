/**
 * Repository для работы с очередями сценариев
 */

import { PrismaClient, ScenarioQueue, QueueTrigger, ScenarioJob } from '@prisma/client';

export interface CreateQueueInput {
  name: string;
  description?: string;
  priority?: number;
  maxConcurrency?: number;
  retryConfig?: Record<string, unknown>;
  tenantId?: string;
}

export interface CreateTriggerInput {
  queueId: string;
  scenarioId?: string;
  eventType: string;
  topic: string;
  filter?: Record<string, unknown>;
}

export interface CreateJobInput {
  queueId: string;
  scenarioId: string;
  priority?: number;
  input?: Record<string, unknown>;
  eventId?: string;
  correlationId?: string;
  maxRetries?: number;
}

export class QueueRepository {
  constructor(private prisma: PrismaClient) {}

  private tenant(tid?: string) {
    return tid && tid.trim() !== '' ? tid : 'default';
  }

  // Queue operations
  async create(data: CreateQueueInput): Promise<ScenarioQueue> {
    return this.prisma.scenarioQueue.create({
      data: {
        name: data.name,
        description: data.description,
        priority: data.priority || 0,
        maxConcurrency: data.maxConcurrency || 10,
        retryConfig: data.retryConfig ? JSON.stringify(data.retryConfig) : null,
        tenantId: this.tenant(data.tenantId)
      },
    });
  }

  async findById(id: string, tenantId?: string): Promise<ScenarioQueue | null> {
    const t = this.tenant(tenantId);
    return this.prisma.scenarioQueue.findFirst({
      where: { id, tenantId: t },
      include: {
        triggers: true,
        jobs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findAll(options?: {
    status?: string;
    limit?: number;
    offset?: number;
    tenantId?: string;
  }): Promise<ScenarioQueue[]> {
    const t = this.tenant(options?.tenantId);
    return this.prisma.scenarioQueue.findMany({
      where: {
        tenantId: t,
        ...(options?.status ? { status: options.status } : {}),
      },
      take: options?.limit,
      skip: options?.offset,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        triggers: true,
        _count: {
          select: {
            jobs: {
              where: {
                status: {
                  in: ['pending', 'queued', 'running'],
                },
              },
            },
          },
        },
      },
    });
  }

  async update(
    id: string,
    tenantId: string | undefined,
    data: Partial<CreateQueueInput & { status?: string }>
  ): Promise<ScenarioQueue> {
    const t = this.tenant(tenantId);
    const existing = await this.prisma.scenarioQueue.findFirst({ where: { id, tenantId: t } });
    if (!existing) {
      throw new Error('Queue not found');
    }
    return this.prisma.scenarioQueue.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.maxConcurrency !== undefined && { maxConcurrency: data.maxConcurrency }),
        ...(data.retryConfig && { retryConfig: JSON.stringify(data.retryConfig) }),
        ...(data.status && { status: data.status }),
      },
    });
  }

  async delete(id: string, tenantId?: string): Promise<void> {
    const t = this.tenant(tenantId);
    const existing = await this.prisma.scenarioQueue.findFirst({ where: { id, tenantId: t } });
    if (!existing) {
      throw new Error('Queue not found');
    }
    await this.prisma.scenarioQueue.delete({
      where: { id },
    });
  }

  // Trigger operations
  async createTrigger(data: CreateTriggerInput, tenantId?: string): Promise<QueueTrigger> {
    const t = this.tenant(tenantId);
    const q = await this.prisma.scenarioQueue.findFirst({
      where: { id: data.queueId, tenantId: t },
    });
    if (!q) {
      throw new Error('Queue not found');
    }
    return this.prisma.queueTrigger.create({
      data: {
        queueId: data.queueId,
        scenarioId: data.scenarioId,
        eventType: data.eventType,
        topic: data.topic,
        filter: data.filter ? JSON.stringify(data.filter) : null,
      },
    });
  }

  async findTriggersByQueue(queueId: string): Promise<QueueTrigger[]> {
    return this.prisma.queueTrigger.findMany({
      where: { queueId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTriggersByEventType(eventType: string, tenantId?: string): Promise<QueueTrigger[]> {
    const t = this.tenant(tenantId);
    return this.prisma.queueTrigger.findMany({
      where: {
        eventType,
        enabled: true,
        queue: { tenantId: t },
      },
      include: {
        queue: true,
      },
    });
  }

  async updateTrigger(
    id: string,
    tenantId: string | undefined,
    data: Partial<CreateTriggerInput & { enabled?: boolean }>
  ): Promise<QueueTrigger> {
    const t = this.tenant(tenantId);
    const tr = await this.prisma.queueTrigger.findFirst({
      where: { id },
      include: { queue: true },
    });
    if (!tr || tr.queue.tenantId !== t) {
      throw new Error('Trigger not found');
    }
    return this.prisma.queueTrigger.update({
      where: { id },
      data: {
        ...(data.eventType && { eventType: data.eventType }),
        ...(data.topic && { topic: data.topic }),
        ...(data.filter !== undefined && { filter: data.filter ? JSON.stringify(data.filter) : null }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
      },
    });
  }

  async deleteTrigger(id: string, tenantId?: string): Promise<void> {
    const t = this.tenant(tenantId);
    const tr = await this.prisma.queueTrigger.findFirst({
      where: { id },
      include: { queue: true },
    });
    if (!tr || tr.queue.tenantId !== t) {
      throw new Error('Trigger not found');
    }
    await this.prisma.queueTrigger.delete({
      where: { id },
    });
  }

  // Job operations
  async createJob(data: CreateJobInput, tenantId?: string): Promise<ScenarioJob> {
    const t = this.tenant(tenantId);
    const q = await this.prisma.scenarioQueue.findFirst({
      where: { id: data.queueId, tenantId: t },
    });
    if (!q) {
      throw new Error('Queue not found');
    }
    const scenario = await this.prisma.scenario.findFirst({
      where: { id: data.scenarioId, tenantId: t },
    });
    if (!scenario) {
      throw new Error('Scenario not found');
    }
    return this.prisma.scenarioJob.create({
      data: {
        queueId: data.queueId,
        scenarioId: data.scenarioId,
        priority: data.priority || 0,
        input: data.input ? JSON.stringify(data.input) : null,
        eventId: data.eventId,
        correlationId: data.correlationId,
        maxRetries: data.maxRetries || 3,
        queuedAt: new Date(),
      },
    });
  }

  async findJobById(id: string, tenantId?: string): Promise<ScenarioJob | null> {
    const t = this.tenant(tenantId);
    const job = await this.prisma.scenarioJob.findUnique({
      where: { id },
      include: {
        queue: true,
        scenario: true,
      },
    });
    if (!job || job.queue.tenantId !== t) {
      return null;
    }
    return job;
  }

  async findJobsByQueue(
    queueId: string,
    tenantId: string | undefined,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ScenarioJob[]> {
    const t = this.tenant(tenantId);
    const q = await this.prisma.scenarioQueue.findFirst({ where: { id: queueId, tenantId: t } });
    if (!q) {
      return [];
    }
    return this.prisma.scenarioJob.findMany({
      where: {
        queueId,
        ...(options?.status && { status: options.status }),
      },
      take: options?.limit,
      skip: options?.offset,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      include: {
        scenario: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });
  }

  async findNextJob(queueId: string, tenantId?: string): Promise<ScenarioJob | null> {
    const t = this.tenant(tenantId);
    const q = await this.prisma.scenarioQueue.findFirst({ where: { id: queueId, tenantId: t } });
    if (!q) {
      return null;
    }
    return this.prisma.scenarioJob.findFirst({
      where: {
        queueId,
        status: {
          in: ['pending', 'queued'],
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async updateJob(
    id: string,
    tenantId: string | undefined,
    data: {
      status?: string;
      executionId?: string;
      output?: Record<string, unknown>;
      error?: Record<string, unknown>;
      retryCount?: number;
      startedAt?: Date;
      completedAt?: Date;
      failedAt?: Date;
    }
  ): Promise<ScenarioJob> {
    const t = this.tenant(tenantId);
    const job = await this.findJobById(id, t);
    if (!job) {
      throw new Error('Job not found');
    }
    return this.prisma.scenarioJob.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.executionId && { executionId: data.executionId }),
        ...(data.output && { output: JSON.stringify(data.output) }),
        ...(data.error && { error: JSON.stringify(data.error) }),
        ...(data.retryCount !== undefined && { retryCount: data.retryCount }),
        ...(data.startedAt && { startedAt: data.startedAt }),
        ...(data.completedAt && { completedAt: data.completedAt }),
        ...(data.failedAt && { failedAt: data.failedAt }),
      },
    });
  }

  async getQueueStats(queueId: string, tenantId?: string): Promise<{
    total: number;
    pending: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  }> {
    const t = this.tenant(tenantId);
    const q = await this.prisma.scenarioQueue.findFirst({ where: { id: queueId, tenantId: t } });
    if (!q) {
      return { total: 0, pending: 0, queued: 0, running: 0, completed: 0, failed: 0 };
    }
    const [total, pending, queued, running, completed, failed] = await Promise.all([
      this.prisma.scenarioJob.count({ where: { queueId } }),
      this.prisma.scenarioJob.count({ where: { queueId, status: 'pending' } }),
      this.prisma.scenarioJob.count({ where: { queueId, status: 'queued' } }),
      this.prisma.scenarioJob.count({ where: { queueId, status: 'running' } }),
      this.prisma.scenarioJob.count({ where: { queueId, status: 'completed' } }),
      this.prisma.scenarioJob.count({ where: { queueId, status: 'failed' } }),
    ]);

    return { total, pending, queued, running, completed, failed };
  }
}
