import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  nodeExecution: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
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

    mockPrisma.nodeExecution.findUnique.mockResolvedValue({ startedAt });
    mockPrisma.nodeExecution.update.mockImplementation(async ({ data }: any) => ({
      executionId: 'exec-1',
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

    expect(mockPrisma.nodeExecution.findUnique).toHaveBeenCalledWith({
      where: {
        executionId_nodeId: {
          executionId: 'exec-1',
          nodeId: 'node-1',
        },
      },
      select: { startedAt: true },
    });
    expect(result.duration).toBeTypeOf('number');
    expect(result.duration).toBeGreaterThan(0);
  });
});
