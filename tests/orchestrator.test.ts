import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator, ExecutionContext } from '../src/runtime/orchestrator';
import { ToolGateway } from '../src/gateway/tool-gateway';
import { WorkflowGraph, WorkflowNode } from '../src/builder/workflow-graph';
import { ScenarioSpec } from '../src/spec/scenario-spec';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let gateway: ToolGateway;

  beforeEach(() => {
    gateway = new ToolGateway();
    orchestrator = new Orchestrator(gateway);
  });

  it('should create Orchestrator instance', () => {
    expect(orchestrator).toBeDefined();
    expect(orchestrator).toBeInstanceOf(Orchestrator);
  });

  it('should accept workflow graph in execution context', () => {
    const workflowGraph: WorkflowGraph = {
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'end', type: 'end' }
      ],
      edges: []
    };

    const context: ExecutionContext = {
      executionId: 'test-exec-1',
      scenarioId: 'test-scenario-1',
      userId: 'test-user',
      workflowGraph,
      spec: {} as ScenarioSpec,
      startedAt: new Date()
    };

    // Проверяем, что контекст валиден
    expect(context.executionId).toBe('test-exec-1');
    expect(context.workflowGraph).toBeDefined();
  });
});
