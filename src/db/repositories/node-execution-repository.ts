/**
 * Node Execution Repository
 * 
 * Репозиторий для работы с выполнениями узлов workflow
 */

import { prisma } from '../index';

export interface CreateNodeExecutionInput {
  executionId: string;
  nodeId: string;
  input?: unknown;
}

export interface UpdateNodeExecutionInput {
  state?: 'pending' | 'running' | 'completed' | 'failed' | 'compensated';
  output?: unknown;
  error?: unknown;
  retryCount?: number;
}

export class NodeExecutionRepository {
  /**
   * Создать выполнение узла
   */
  async create(input: CreateNodeExecutionInput) {
    return prisma.nodeExecution.create({
      data: {
        executionId: input.executionId,
        nodeId: input.nodeId,
        input: input.input ? JSON.stringify(input.input) : null,
        state: 'pending',
        startedAt: new Date(),
      },
    });
  }

  /**
   * Обновить выполнение узла
   */
  async update(executionId: string, nodeId: string, input: UpdateNodeExecutionInput) {
    const updateData: any = {};
    
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
              executionId,
              nodeId,
            },
          },
          select: { startedAt: true },
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
          executionId,
          nodeId,
        },
      },
      data: updateData,
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
  async findByExecutionAndNode(executionId: string, nodeId: string) {
    const nodeExecution = await prisma.nodeExecution.findUnique({
      where: {
        executionId_nodeId: {
          executionId,
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
   * Получить все выполнения узлов для execution
   */
  async findByExecutionId(executionId: string) {
    const nodeExecutions = await prisma.nodeExecution.findMany({
      where: { executionId },
      orderBy: { startedAt: 'asc' },
    });
    
    return nodeExecutions.map(n => ({
      ...n,
      input: n.input ? JSON.parse(n.input) : null,
      output: n.output ? JSON.parse(n.output) : null,
      error: n.error ? JSON.parse(n.error) : null,
    }));
  }
}
