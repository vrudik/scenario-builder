/**
 * Node Execution Repository
 * 
 * Репозиторий для работы с выполнениями узлов workflow
 */

import { prisma } from '../index';

export interface CreateNodeExecutionInput {
  /** Публичный executionId (поле Execution.executionId), не PK строки Execution */
  executionId: string;
  nodeId: string;
  input?: unknown;
  tenantId?: string;
}

export interface UpdateNodeExecutionInput {
  state?: 'pending' | 'running' | 'completed' | 'failed' | 'compensated';
  output?: unknown;
  error?: unknown;
  retryCount?: number;
}

export class NodeExecutionRepository {
  /** PK строки Execution по публичному executionId и tenant */
  private async resolveRowId(
    publicExecutionId: string,
    tenantId: string = 'default'
  ): Promise<string | null> {
    const row = await prisma.execution.findFirst({
      where: { executionId: publicExecutionId, tenantId },
      select: { id: true }
    });
    return row?.id ?? null;
  }

  /**
   * Создать выполнение узла
   */
  async create(input: CreateNodeExecutionInput) {
    const tenantId = input.tenantId ?? 'default';
    const rowId = await this.resolveRowId(input.executionId, tenantId);
    if (!rowId) {
      throw new Error(
        `NodeExecutionRepository.create: execution row not found for executionId=${input.executionId}`
      );
    }
    return prisma.nodeExecution.create({
      data: {
        executionId: rowId,
        nodeId: input.nodeId,
        input: input.input ? JSON.stringify(input.input) : null,
        state: 'running',
        startedAt: new Date()
      }
    });
  }

  /**
   * Обновить выполнение узла
   */
  async update(
    publicExecutionId: string,
    nodeId: string,
    input: UpdateNodeExecutionInput,
    tenantId: string = 'default'
  ) {
    const rowId = await this.resolveRowId(publicExecutionId, tenantId);
    if (!rowId) {
      throw new Error(
        `NodeExecutionRepository.update: execution row not found for executionId=${publicExecutionId}`
      );
    }

    const updateData: Record<string, unknown> = {};

    if (input.state !== undefined) {
      updateData.state = input.state;
      if (input.state === 'running' && !updateData.startedAt) {
        updateData.startedAt = new Date();
      }
      if (input.state === 'completed' || input.state === 'failed') {
        updateData.completedAt = new Date();
        const started = await prisma.nodeExecution.findUnique({
          where: {
            executionId_nodeId: {
              executionId: rowId,
              nodeId
            }
          },
          select: { startedAt: true }
        });
        if (started?.startedAt) {
          updateData.duration = new Date().getTime() - started.startedAt.getTime();
        }
      }
    }
    if (input.output !== undefined) updateData.output = JSON.stringify(input.output);
    if (input.error !== undefined) updateData.error = JSON.stringify(input.error);
    if (input.retryCount !== undefined) updateData.retryCount = input.retryCount;

    const updated = await prisma.nodeExecution.update({
      where: {
        executionId_nodeId: {
          executionId: rowId,
          nodeId
        }
      },
      data: updateData
    });
    
    return {
      ...updated,
      input: updated.input ? JSON.parse(updated.input) : null,
      output: updated.output ? JSON.parse(updated.output) : null,
      error: updated.error ? JSON.parse(updated.error) : null,
    };
  }

  /**
   * Получить выполнение узла
   */
  async findByExecutionAndNode(
    publicExecutionId: string,
    nodeId: string,
    tenantId: string = 'default'
  ) {
    const rowId = await this.resolveRowId(publicExecutionId, tenantId);
    if (!rowId) return null;

    const nodeExecution = await prisma.nodeExecution.findUnique({
      where: {
        executionId_nodeId: {
          executionId: rowId,
          nodeId,
        },
      },
    });
    
    if (!nodeExecution) {
      return null;
    }
    
    return {
      ...nodeExecution,
      input: nodeExecution.input ? JSON.parse(nodeExecution.input) : null,
      output: nodeExecution.output ? JSON.parse(nodeExecution.output) : null,
      error: nodeExecution.error ? JSON.parse(nodeExecution.error) : null,
    };
  }

  /**
   * Получить все выполнения узлов для execution (по публичному executionId)
   */
  async findByExecutionId(publicExecutionId: string, tenantId: string = 'default') {
    const rowId = await this.resolveRowId(publicExecutionId, tenantId);
    if (!rowId) return [];

    const nodeExecutions = await prisma.nodeExecution.findMany({
      where: { executionId: rowId },
      orderBy: { startedAt: 'asc' }
    });
    
    return nodeExecutions.map(n => ({
      ...n,
      input: n.input ? JSON.parse(n.input) : null,
      output: n.output ? JSON.parse(n.output) : null,
      error: n.error ? JSON.parse(n.error) : null,
    }));
  }
}
