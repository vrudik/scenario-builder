/**
 * Execution Repository
 * 
 * Репозиторий для работы с выполнениями сценариев
 */

import { prisma } from '../index';

export interface CreateExecutionInput {
  executionId: string;
  scenarioId: string;
  userId?: string;
  userRoles?: string[];
  traceId?: string;
  spanId?: string;
}

export interface UpdateExecutionStatusInput {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'compensated';
  currentNodeId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export class ExecutionRepository {
  /**
   * Создать новое выполнение
   */
  async create(input: CreateExecutionInput) {
    return prisma.execution.create({
      data: {
        executionId: input.executionId,
        scenarioId: input.scenarioId,
        userId: input.userId,
        userRoles: input.userRoles ? JSON.stringify(input.userRoles) : null,
        traceId: input.traceId,
        spanId: input.spanId,
        status: 'pending',
      },
    });
  }

  /**
   * Получить выполнение по executionId
   */
  async findByExecutionId(executionId: string) {
    const execution = await prisma.execution.findUnique({
      where: { executionId },
      include: {
        events: {
          orderBy: { timestamp: 'asc' },
        },
        nodeExecutions: true,
        compensations: true,
      },
    });
    
    if (!execution) {
      return null;
    }
    
    return {
      ...execution,
      userRoles: execution.userRoles ? JSON.parse(execution.userRoles) : [],
      events: execution.events.map(e => ({
        ...e,
        data: e.data ? JSON.parse(e.data) : null,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      })),
      nodeExecutions: execution.nodeExecutions.map(n => ({
        ...n,
        input: n.input ? JSON.parse(n.input) : null,
        output: n.output ? JSON.parse(n.output) : null,
        error: n.error ? JSON.parse(n.error) : null,
      })),
      compensations: execution.compensations.map(c => ({
        ...c,
        action: c.action ? JSON.parse(c.action) : null,
      })),
    };
  }

  /**
   * Обновить статус выполнения
   */
  async updateStatus(executionId: string, input: UpdateExecutionStatusInput) {
    const updateData: any = {};
    
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'completed') {
        updateData.completedAt = new Date();
      } else if (input.status === 'failed' || input.status === 'compensated') {
        updateData.failedAt = new Date();
      }
    }
    if (input.currentNodeId !== undefined) updateData.currentNodeId = input.currentNodeId;
    if (input.errorMessage !== undefined) updateData.errorMessage = input.errorMessage;
    if (input.errorCode !== undefined) updateData.errorCode = input.errorCode;
    
    return prisma.execution.update({
      where: { executionId },
      data: updateData,
    });
  }

  /**
   * Получить все выполнения сценария
   */
  async findByScenarioId(scenarioId: string, options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }) {
    return prisma.execution.findMany({
      where: {
        scenarioId,
        ...(options?.status ? { status: options.status } : {}),
      },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { startedAt: 'desc' },
      include: {
        events: {
          take: 10,
          orderBy: { timestamp: 'desc' },
        },
      },
    });
  }

  /**
   * Добавить событие выполнения
   */
  async addEvent(executionId: string, event: {
    type: string;
    nodeId?: string;
    data?: unknown;
    metadata?: unknown;
  }) {
    return prisma.executionEvent.create({
      data: {
        executionId,
        type: event.type,
        nodeId: event.nodeId,
        data: event.data ? JSON.stringify(event.data) : null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      },
    });
  }

  /**
   * Получить историю событий выполнения
   */
  async getEventHistory(executionId: string) {
    const events = await prisma.executionEvent.findMany({
      where: { executionId },
      orderBy: { timestamp: 'asc' },
    });
    
    return events.map(e => ({
      ...e,
      data: e.data ? JSON.parse(e.data) : null,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));
  }
}
