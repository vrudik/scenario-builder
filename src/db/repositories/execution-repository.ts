/**
 * Execution Repository
 *
 * Репозиторий для работы с выполнениями сценариев (изоляция по tenantId).
 */

import { prisma } from '../index';
import type { ExecutionDbStatusRow } from '../../runtime/unified-execution-status';

export interface CreateExecutionInput {
  executionId: string;
  scenarioId: string;
  userId?: string;
  userRoles?: string[];
  traceId?: string;
  spanId?: string;
  runtimeKind?: 'in_memory' | 'temporal';
  tenantId?: string;
}

export interface PatchExecutionTemporalInput {
  temporalRunId?: string | null;
  temporalTaskQueue?: string | null;
  temporalStatusName?: string | null;
  temporalHistoryLength?: number | null;
}

export interface UpdateExecutionStatusInput {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'compensated';
  currentNodeId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export class ExecutionRepository {
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
        runtimeKind: input.runtimeKind ?? 'in_memory',
        tenantId: input.tenantId ?? 'default'
      }
    });
  }

  async patchTemporalMetadata(
    executionId: string,
    input: PatchExecutionTemporalInput,
    tenantId: string = 'default'
  ) {
    const data: Record<string, unknown> = {};
    if (input.temporalRunId !== undefined) data.temporalRunId = input.temporalRunId;
    if (input.temporalTaskQueue !== undefined) data.temporalTaskQueue = input.temporalTaskQueue;
    if (input.temporalStatusName !== undefined) data.temporalStatusName = input.temporalStatusName;
    if (input.temporalHistoryLength !== undefined) data.temporalHistoryLength = input.temporalHistoryLength;
    if (Object.keys(data).length === 0) {
      return prisma.execution.findFirst({ where: { executionId, tenantId } });
    }
    await prisma.execution.updateMany({
      where: { executionId, tenantId },
      data
    });
    return prisma.execution.findFirst({ where: { executionId, tenantId } });
  }

  async findStatusPayloadByExecutionId(
    executionId: string,
    tenantId: string = 'default'
  ): Promise<ExecutionDbStatusRow | null> {
    return prisma.execution.findFirst({
      where: { executionId, tenantId },
      select: {
        executionId: true,
        status: true,
        currentNodeId: true,
        runtimeKind: true,
        temporalRunId: true,
        temporalTaskQueue: true,
        temporalStatusName: true,
        temporalHistoryLength: true,
        startedAt: true,
        completedAt: true,
        failedAt: true
      }
    });
  }

  async findByExecutionId(executionId: string, tenantId: string = 'default') {
    const execution = await prisma.execution.findFirst({
      where: { executionId, tenantId },
      include: {
        events: {
          orderBy: { timestamp: 'asc' }
        },
        nodeExecutions: true,
        compensations: true
      }
    });

    if (!execution) {
      return null;
    }

    return {
      ...execution,
      userRoles: execution.userRoles ? JSON.parse(execution.userRoles) : [],
      events: execution.events.map((e) => ({
        ...e,
        data: e.data ? JSON.parse(e.data) : null,
        metadata: e.metadata ? JSON.parse(e.metadata) : null
      })),
      nodeExecutions: execution.nodeExecutions.map((n) => ({
        ...n,
        input: n.input ? JSON.parse(n.input) : null,
        output: n.output ? JSON.parse(n.output) : null,
        error: n.error ? JSON.parse(n.error) : null
      })),
      compensations: execution.compensations.map((c) => ({
        ...c,
        action: c.action ? JSON.parse(c.action) : null
      }))
    };
  }

  async updateStatus(
    executionId: string,
    input: UpdateExecutionStatusInput,
    tenantId: string = 'default'
  ) {
    const updateData: Record<string, unknown> = {};

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

    await prisma.execution.updateMany({
      where: { executionId, tenantId },
      data: updateData
    });
    return prisma.execution.findFirst({ where: { executionId, tenantId } });
  }

  async findRecentSummaries(
    limit = 30,
    filters?: { scenarioId?: string; tenantId?: string }
  ) {
    const take = Math.min(Math.max(1, limit), 100);
    const sid = filters?.scenarioId?.trim();
    const tenantId = filters?.tenantId ?? 'default';
    return prisma.execution.findMany({
      where: {
        tenantId,
        ...(sid ? { scenarioId: sid } : {})
      },
      take,
      orderBy: { startedAt: 'desc' },
      select: {
        executionId: true,
        scenarioId: true,
        status: true,
        runtimeKind: true,
        currentNodeId: true,
        startedAt: true,
        completedAt: true,
        failedAt: true,
        temporalStatusName: true
      }
    });
  }

  async findByScenarioId(
    scenarioId: string,
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
    }
  ) {
    const scenario = await prisma.scenario.findFirst({
      where: { id: scenarioId, tenantId }
    });
    if (!scenario) {
      return [];
    }
    return prisma.execution.findMany({
      where: {
        scenarioId,
        tenantId,
        ...(options?.status ? { status: options.status } : {})
      },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { startedAt: 'desc' },
      include: {
        events: {
          take: 10,
          orderBy: { timestamp: 'desc' }
        }
      }
    });
  }

  async addEvent(
    internalExecutionRowId: string,
    event: {
      type: string;
      nodeId?: string;
      data?: unknown;
      metadata?: unknown;
      timestamp?: Date;
    }
  ) {
    return prisma.executionEvent.create({
      data: {
        executionId: internalExecutionRowId,
        type: event.type,
        nodeId: event.nodeId,
        data: event.data ? JSON.stringify(event.data) : null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        ...(event.timestamp ? { timestamp: event.timestamp } : {})
      }
    });
  }

  /**
   * Сохранить событие по публичному executionId и tenant (для оркестратора).
   */
  async addEventForPublicExecution(
    publicExecutionId: string,
    tenantId: string,
    event: {
      type: string;
      nodeId?: string;
      data?: unknown;
      metadata?: unknown;
      timestamp?: Date;
    }
  ): Promise<void> {
    const row = await prisma.execution.findFirst({
      where: { executionId: publicExecutionId, tenantId },
      select: { id: true }
    });
    if (!row) {
      return;
    }
    await this.addEvent(row.id, event);
  }

  async getEventHistory(publicExecutionId: string, tenantId: string = 'default') {
    const ex = await prisma.execution.findFirst({
      where: { executionId: publicExecutionId, tenantId },
      select: { id: true }
    });
    if (!ex) {
      return [];
    }
    const events = await prisma.executionEvent.findMany({
      where: { executionId: ex.id },
      orderBy: { timestamp: 'asc' }
    });

    return events.map((e) => ({
      ...e,
      data: e.data ? JSON.parse(e.data) : null,
      metadata: e.metadata ? JSON.parse(e.metadata) : null
    }));
  }
}
