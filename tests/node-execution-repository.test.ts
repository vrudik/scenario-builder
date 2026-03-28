import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  execution: {
    findFirst: vi.fn()
  },
  nodeExecution: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock('../src/db/index', () => ({
  prisma: mockPrisma,
}));

describe('NodeExecutionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates non-zero duration when updating existing node to completed', async () => {
    const startedAt = new Date(Date.now() - 5_000);
    const internalRowId = '550e8400-e29b-41d4-a716-446655440000';

    mockPrisma.execution.findFirst.mockResolvedValue({ id: internalRowId });
    mockPrisma.nodeExecution.findUnique.mockResolvedValue({ startedAt });
    mockPrisma.nodeExecution.update.mockImplementation(async ({ data }: any) => ({
      executionId: internalRowId,
      nodeId: 'node-1',
      input: null,
      output: null,
      error: null,
      state: data.state,
      retryCount: 0,
      startedAt,
      completedAt: data.completedAt ?? null,
      duration: data.duration ?? null,
    }));

    const { NodeExecutionRepository } = await import('../src/db/repositories/node-execution-repository');
    const repository = new NodeExecutionRepository();

    const result = await repository.update('exec-1', 'node-1', { state: 'completed' });

    expect(mockPrisma.execution.findFirst).toHaveBeenCalledWith({
      where: { executionId: 'exec-1', tenantId: 'default' },
      select: { id: true }
    });
    expect(mockPrisma.nodeExecution.findUnique).toHaveBeenCalledWith({
      where: {
        executionId_nodeId: {
          executionId: internalRowId,
          nodeId: 'node-1',
        },
      },
      select: { startedAt: true },
    });
    expect(result.duration).toBeTypeOf('number');
    expect(result.duration).toBeGreaterThan(0);
  });
});
