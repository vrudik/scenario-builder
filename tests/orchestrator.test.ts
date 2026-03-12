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
      edges: [],
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '0.1.0',
        compiledAt: new Date().toISOString(),
        specId: 'test-scenario-1'
      }
    };

    const context: ExecutionContext = {
      executionId: 'test-exec-1',
      scenarioId: 'test-scenario-1',
      userId: 'test-user',
      userRoles: ['user'],
      traceId: 'trace-1',
      spanId: 'span-1',
      workflowGraph,
      spec: {} as ScenarioSpec,
      startedAt: new Date()
    };

    expect(context.executionId).toBe('test-exec-1');
    expect(context.workflowGraph).toBeDefined();
  });

  it('should pick matching conditional edge for decision node', () => {
    const node: WorkflowNode = { id: 'decision-1', type: 'decision' };
    const graph: WorkflowGraph = {
      nodes: [node],
      edges: [
        { from: 'decision-1', to: 'action-approved', condition: 'approved == true' },
        { from: 'decision-1', to: 'action-rejected', condition: 'approved == false' },
        { from: 'decision-1', to: 'action-default' }
      ],
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '0.1.0',
        compiledAt: new Date().toISOString(),
        specId: 'test'
      }
    };

    const nextEdges = (orchestrator as any).findNextEdges(node, graph, { approved: true });
    expect(nextEdges).toHaveLength(1);
    expect(nextEdges[0].to).toBe('action-approved');
  });

  it('should fallback to default edge for decision node when no condition matched', () => {
    const node: WorkflowNode = { id: 'decision-1', type: 'decision' };
    const graph: WorkflowGraph = {
      nodes: [node],
      edges: [
        { from: 'decision-1', to: 'action-approved', condition: 'approved == true' },
        { from: 'decision-1', to: 'action-default' }
      ],
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '0.1.0',
        compiledAt: new Date().toISOString(),
        specId: 'test'
      }
    };

    const nextEdges = (orchestrator as any).findNextEdges(node, graph, { approved: false });
    expect(nextEdges).toHaveLength(1);
    expect(nextEdges[0].to).toBe('action-default');
  });

  it('should return all matched edges for parallel node', () => {
    const node: WorkflowNode = { id: 'parallel-1', type: 'parallel' };
    const graph: WorkflowGraph = {
      nodes: [node],
      edges: [
        { from: 'parallel-1', to: 'branch-a', condition: 'region == eu' },
        { from: 'parallel-1', to: 'branch-b', condition: 'priority == high' },
        { from: 'parallel-1', to: 'branch-default' }
      ],
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '0.1.0',
        compiledAt: new Date().toISOString(),
        specId: 'test'
      }
    };

    const nextEdges = (orchestrator as any).findNextEdges(node, graph, { region: 'eu', priority: 'high' });
    expect(nextEdges.map((edge: { to: string }) => edge.to)).toEqual(['branch-a', 'branch-b', 'branch-default']);
  });
});
