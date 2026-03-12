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
});
