import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator, ExecutionContext, NodeExecutionState } from '../src/runtime/orchestrator';
import { ToolGateway, ToolRequest, ToolResponse } from '../src/gateway/tool-gateway';
import { WorkflowGraph } from '../src/builder/workflow-graph';
import { ScenarioSpec, RiskClass } from '../src/spec/scenario-spec';
import { ToolRegistry, RegisteredTool } from '../src/registry';

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let gateway: ToolGateway;

  beforeEach(() => {
    gateway = new ToolGateway();
    orchestrator = new Orchestrator(gateway);
  });

  const createTestTool = (id: string): RegisteredTool => ({
    id,
    name: `Tool ${id}`,
    version: '1.0.0',
    riskClass: RiskClass.LOW,
    requiresApproval: false,
    inputOutput: {
      inputs: {},
      outputs: {}
    },
    sla: {
      availability: 0.99,
      latency: {
        p50: 100,
        p95: 500,
        p99: 1000
      },
      maxRetries: 3
    },
    authorization: {
      scopes: [],
      roles: [],
      requiresApproval: false
    },
    idempotency: {
      supported: true
    },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'test-provider'
    }
  });

  const createWorkflowGraph = (toolId: string): WorkflowGraph => ({
    nodes: [
      { id: 'start', type: 'start' },
      { id: 'action-1', type: 'action', toolId },
      { id: 'end', type: 'end' }
    ],
    edges: [
      { from: 'start', to: 'action-1' },
      { from: 'action-1', to: 'end' }
    ],
    metadata: {
      version: '1.0.0',
      compiledAt: new Date().toISOString(),
      specId: 'test-spec'
    }
  });

  const createContext = (executionId: string, workflowGraph: WorkflowGraph): ExecutionContext => ({
    executionId,
    scenarioId: 'test-scenario-1',
    userId: 'test-user',
    userRoles: [],
    traceId: 'trace-1',
    spanId: 'span-1',
    workflowGraph,
    spec: {} as ScenarioSpec,
    startedAt: new Date()
  });

  it('should create Orchestrator instance', () => {
    expect(orchestrator).toBeDefined();
    expect(orchestrator).toBeInstanceOf(Orchestrator);
  });

  it('should execute registered tool via gateway registered executor', async () => {
    const registry = new ToolRegistry();
    const tool = createTestTool('registered-tool');

    registry.register(tool);
    gateway.registerTool(tool.id, tool, async (_req: ToolRequest): Promise<ToolResponse> => ({
      success: true,
      outputs: { result: 'executed' },
      metadata: {
        latency: 10,
        timestamp: new Date().toISOString()
      }
    }));

    orchestrator.setRegistry(registry);

    const executionId = 'exec-registered';
    await orchestrator.startExecution(createContext(executionId, createWorkflowGraph(tool.id)));

    const executionState = orchestrator.getExecutionState(executionId);
    const nodeResult = executionState?.nodeResults.get('action-1');

    expect(executionState?.completed).toBe(true);
    expect(executionState?.failed).toBe(false);
    expect(nodeResult?.state).toBe(NodeExecutionState.COMPLETED);
    expect(nodeResult?.outputs).toEqual({ result: 'executed' });
  });

  it('should fail action node when tool is not registered', async () => {
    orchestrator.setRegistry(new ToolRegistry());

    const executionId = 'exec-unregistered';
    await orchestrator.startExecution(createContext(executionId, createWorkflowGraph('missing-tool')));

    const executionState = orchestrator.getExecutionState(executionId);
    const nodeResult = executionState?.nodeResults.get('action-1');

    expect(executionState?.failed).toBe(true);
    expect(nodeResult?.state).toBe(NodeExecutionState.FAILED);
    expect(nodeResult?.error?.code).toBe('TOOL_NOT_REGISTERED');
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
