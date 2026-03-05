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
}

export interface CreateTriggerInput {
  queueId: string;
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

  // Queue operations
  async create(data: CreateQueueInput): Promise<ScenarioQueue> {
    return this.prisma.scenarioQueue.create({
      data: {
        name: data.name,
        description: data.description,
        priority: data.priority || 0,
        maxConcurrency: data.maxConcurrency || 10,
        retryConfig: data.retryConfig ? JSON.stringify(data.retryConfig) : null,
      },
    });
  }

  async findById(id: string): Promise<ScenarioQueue | null> {
    return this.prisma.scenarioQueue.findUnique({
      where: { id },
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
  }): Promise<ScenarioQueue[]> {
    return this.prisma.scenarioQueue.findMany({
      where: options?.status ? { status: options.status } : undefined,
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

  async update(id: string, data: Partial<CreateQueueInput & { status?: string }>): Promise<ScenarioQueue> {
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

  async delete(id: string): Promise<void> {
    await this.prisma.scenarioQueue.delete({
      where: { id },
    });
  }

  // Trigger operations
  async createTrigger(data: CreateTriggerInput): Promise<QueueTrigger> {
    return this.prisma.queueTrigger.create({
      data: {
        queueId: data.queueId,
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

  async findTriggersByEventType(eventType: string): Promise<QueueTrigger[]> {
    return this.prisma.queueTrigger.findMany({
      where: {
        eventType,
        enabled: true,
      },
      include: {
        queue: true,
      },
    });
  }

  async updateTrigger(id: string, data: Partial<CreateTriggerInput & { enabled?: boolean }>): Promise<QueueTrigger> {
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

  async deleteTrigger(id: string): Promise<void> {
    await this.prisma.queueTrigger.delete({
      where: { id },
    });
  }

  // Job operations
  async createJob(data: CreateJobInput): Promise<ScenarioJob> {
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

  async findJobById(id: string): Promise<ScenarioJob | null> {
    return this.prisma.scenarioJob.findUnique({
      where: { id },
      include: {
        queue: true,
        scenario: true,
      },
    });
  }

  async findJobsByQueue(queueId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ScenarioJob[]> {
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

  async findNextJob(queueId: string): Promise<ScenarioJob | null> {
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

  async updateJob(id: string, data: {
    status?: string;
    executionId?: string;
    output?: Record<string, unknown>;
    error?: Record<string, unknown>;
    retryCount?: number;
    startedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
  }): Promise<ScenarioJob> {
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

  async getQueueStats(queueId: string): Promise<{
    total: number;
    pending: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  }> {
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
