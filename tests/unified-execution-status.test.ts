import { describe, it, expect } from 'vitest';
import {
  toUnifiedExecutionStatus,
  toUnifiedExecutionStatusFromDb
} from '../src/runtime/unified-execution-status';

describe('toUnifiedExecutionStatus', () => {
  it('prefers in-memory completed over temporal describe', () => {
    const u = toUnifiedExecutionStatus(
      'e1',
      {
        currentNodeId: 'end',
        completed: true,
        failed: false,
        temporalRunId: 'r1',
        temporalTaskQueue: 'scenario-execution'
      },
      { workflowId: 'e1', runId: 'r1', statusName: 'RUNNING', taskQueue: 'q', historyLength: 1, startTime: '' },
      'temporal'
    );
    expect(u.lifecycleStatus).toBe('completed');
    expect(u.runtimeKind).toBe('temporal');
  });

  it('maps temporal RUNNING when no terminal in-memory state', () => {
    const u = toUnifiedExecutionStatus(
      'e2',
      {
        currentNodeId: 'temporal-pending',
        completed: false,
        failed: false,
        temporalAsync: true,
        temporalRunId: 'r2',
        temporalTaskQueue: 'scenario-execution'
      },
      {
        workflowId: 'e2',
        runId: 'r2',
        statusName: 'RUNNING',
        taskQueue: 'scenario-execution',
        historyLength: 2,
        startTime: new Date().toISOString()
      },
      'temporal'
    );
    expect(u.lifecycleStatus).toBe('running');
    expect(u.temporal?.statusName).toBe('RUNNING');
  });

  it('in-memory running without temporal', () => {
    const u = toUnifiedExecutionStatus(
      'e3',
      {
        currentNodeId: 'n1',
        completed: false,
        failed: false
      },
      null,
      'in_memory'
    );
    expect(u.lifecycleStatus).toBe('running');
    expect(u.temporal).toBeUndefined();
  });

  it('toUnifiedExecutionStatusFromDb: pending + source database', () => {
    const started = new Date('2025-01-01T00:00:00Z');
    const u = toUnifiedExecutionStatusFromDb(
      {
        executionId: 'db-1',
        status: 'pending',
        currentNodeId: null,
        runtimeKind: 'in_memory',
        temporalRunId: null,
        temporalTaskQueue: null,
        temporalStatusName: null,
        temporalHistoryLength: null,
        startedAt: started,
        completedAt: null,
        failedAt: null
      },
      null
    );
    expect(u.source).toBe('database');
    expect(u.lifecycleStatus).toBe('pending');
  });

  it('toUnifiedExecutionStatusFromDb: temporal row prefers live describe', () => {
    const started = new Date('2025-01-01T00:00:00Z');
    const u = toUnifiedExecutionStatusFromDb(
      {
        executionId: 'db-t',
        status: 'running',
        currentNodeId: 'temporal-pending',
        runtimeKind: 'temporal',
        temporalRunId: 'r-db',
        temporalTaskQueue: 'scenario-execution',
        temporalStatusName: 'RUNNING',
        temporalHistoryLength: 2,
        startedAt: started,
        completedAt: null,
        failedAt: null
      },
      {
        workflowId: 'db-t',
        runId: 'r-live',
        statusName: 'COMPLETED',
        taskQueue: 'scenario-execution',
        historyLength: 10,
        startTime: started.toISOString()
      }
    );
    expect(u.temporal?.statusName).toBe('COMPLETED');
    expect(u.temporal?.runId).toBe('r-live');
    expect(u.source).toBe('database');
    expect(u.lifecycleStatus).toBe('completed');
  });
});
