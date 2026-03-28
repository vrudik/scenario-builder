import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Orchestrator,
  ExecutionContext,
  NodeExecutionState,
  WorkflowExecutionState,
  NodeExecutionResult
} from '../src/runtime/orchestrator';
import { findNextEdges } from '../src/runtime/workflow-traversal';
import { ToolGateway, ToolRequest, ToolResponse } from '../src/gateway/tool-gateway';
import { WorkflowGraph, WorkflowNode } from '../src/builder/workflow-graph';
import { ScenarioSpec, RiskClass, TriggerType } from '../src/spec/scenario-spec';
import { ToolRegistry, RegisteredTool } from '../src/registry';
import { ScenarioBuilder, type DeploymentDescriptor } from '../src/builder/scenario-builder';
import type { TemporalClient } from '../src/runtime/temporal-client';

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
    traversal: {
      decision: 'first-match-else-default',
      parallel: 'all-matching',
      default: 'first-match'
    },
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

  it('should pass previous node outputs as tool inputs', async () => {
    const registry = new ToolRegistry();
    const toolA = createTestTool('tool-a');
    const toolB = createTestTool('tool-b');
    let capturedInputs: Record<string, unknown> | undefined;

    registry.register(toolA);
    registry.register(toolB);

    gateway.registerTool(toolA.id, toolA, async (_req: ToolRequest): Promise<ToolResponse> => ({
      success: true,
      outputs: { query: 'hello-world', maxResults: 3 },
      metadata: {
        latency: 1,
        timestamp: new Date().toISOString()
      }
    }));

    gateway.registerTool(toolB.id, toolB, async (req: ToolRequest): Promise<ToolResponse> => {
      capturedInputs = req.inputs;
      return {
        success: true,
        outputs: { done: true },
        metadata: {
          latency: 1,
          timestamp: new Date().toISOString()
        }
      };
    });

    orchestrator.setRegistry(registry);

    const workflowGraph: WorkflowGraph = {
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'action-a', type: 'action', toolId: 'tool-a' },
        { id: 'action-b', type: 'action', toolId: 'tool-b' },
        { id: 'end', type: 'end' }
      ],
      edges: [
        { from: 'start', to: 'action-a' },
        { from: 'action-a', to: 'action-b' },
        { from: 'action-b', to: 'end' }
      ],
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '1.0.0',
        compiledAt: new Date().toISOString(),
        specId: 'test-spec'
      }
    };

    const executionId = 'exec-chain-inputs';
    await orchestrator.startExecution(createContext(executionId, workflowGraph));

    const executionState = orchestrator.getExecutionState(executionId);
    expect(executionState?.completed).toBe(true);
    expect(capturedInputs).toEqual({ query: 'hello-world', maxResults: 3 });
  });

  it('should merge outputs from multiple incoming edges (fan-in)', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'action', toolId: 'ta' },
        { id: 'b', type: 'action', toolId: 'tb' },
        { id: 'c', type: 'action', toolId: 'tc' }
      ],
      edges: [
        { from: 'a', to: 'c' },
        { from: 'b', to: 'c' }
      ],
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '1.0.0',
        compiledAt: new Date().toISOString(),
        specId: 'test-spec'
      }
    };

    const now = new Date();
    const ra: NodeExecutionResult = {
      nodeId: 'a',
      state: NodeExecutionState.COMPLETED,
      startedAt: now,
      completedAt: now,
      outputs: { foo: 1 },
      retryCount: 0
    };
    const rb: NodeExecutionResult = {
      nodeId: 'b',
      state: NodeExecutionState.COMPLETED,
      startedAt: now,
      completedAt: now,
      outputs: { bar: 2 },
      retryCount: 0
    };

    const state: WorkflowExecutionState = {
      executionId: 'fan-in',
      currentNodeId: 'c',
      nodeResults: new Map([
        ['a', ra],
        ['b', rb]
      ]),
      compensationStack: [],
      completed: false,
      failed: false
    };

    const merged = (orchestrator as any).getPreviousNodeOutputs('c', state, graph);
    expect(merged).toEqual({ foo: 1, bar: 2 });
  });

  it('should record canary deployment strategy for high-risk spec', async () => {
    const registry = new ToolRegistry();
    const tool = createTestTool('registered-tool');
    registry.register(tool);
    gateway.registerTool(tool.id, tool, async (_req: ToolRequest): Promise<ToolResponse> => ({
      success: true,
      outputs: { ok: true },
      metadata: { latency: 1, timestamp: new Date().toISOString() }
    }));
    orchestrator.setRegistry(registry);

    const spec: ScenarioSpec = {
      version: '0.1.0',
      id: 'high-risk',
      name: 'High risk',
      goal: 'g',
      triggers: [{ type: TriggerType.EVENT, source: 'events.test' }],
      allowedActions: [
        {
          id: 'registered-tool',
          name: 'T',
          version: '1.0.0',
          riskClass: RiskClass.LOW,
          requiresApproval: false
        }
      ],
      riskClass: RiskClass.HIGH
    };
    const workflowGraph = new ScenarioBuilder().compile(spec);
    const executionId = 'exec-high-risk-canary';
    await orchestrator.startExecution({
      ...createContext(executionId, workflowGraph),
      spec
    });
    const st = orchestrator.getExecutionState(executionId);
    expect(st?.deploymentStrategy).toBe('canary');
    expect(['stable', 'canary']).toContain(st?.deploymentLane);
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

    const nextEdges = findNextEdges(node, graph, { approved: true });
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

    const nextEdges = findNextEdges(node, graph, { approved: false });
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

    const nextEdges = findNextEdges(node, graph, { region: 'eu', priority: 'high' });
    expect(nextEdges.map((edge: { to: string }) => edge.to)).toEqual(['branch-a', 'branch-b', 'branch-default']);
  });

  describe('Temporal fire-and-forget (TEMPORAL_AWAIT_RESULT=false)', () => {
    let prevAwait: string | undefined;

    beforeEach(() => {
      prevAwait = process.env.TEMPORAL_AWAIT_RESULT;
    });

    afterEach(() => {
      if (prevAwait === undefined) {
        delete process.env.TEMPORAL_AWAIT_RESULT;
      } else {
        process.env.TEMPORAL_AWAIT_RESULT = prevAwait;
      }
    });

    it('sets temporalAsync until syncTemporalExecutionResult', async () => {
      process.env.TEMPORAL_AWAIT_RESULT = 'false';
      const startScenarioWorkflow = vi.fn().mockResolvedValue({
        workflowId: 'exec-temporal-async',
        runId: 'run-xyz'
      });
      const runScenarioWorkflow = vi.fn();
      const getWorkflowResult = vi.fn().mockResolvedValue({
        success: true,
        result: { x: 1 },
        nodeOutcomes: {
          st: { ok: true, outputs: {} },
          en: { ok: true }
        }
      });
      const describeScenarioWorkflow = vi.fn().mockResolvedValue({
        workflowId: 'exec-temporal-async',
        runId: 'run-xyz',
        statusName: 'COMPLETED',
        taskQueue: 'scenario-execution',
        historyLength: 3,
        startTime: new Date().toISOString()
      });
      const temporalClient = {
        startScenarioWorkflow,
        runScenarioWorkflow,
        getWorkflowResult,
        describeScenarioWorkflow
      } as unknown as TemporalClient;

      const g = new ToolGateway();
      const orch = new Orchestrator(g, undefined, undefined, undefined, undefined, undefined, temporalClient);

      const workflowGraph: WorkflowGraph = {
        nodes: [
          { id: 'st', type: 'start' },
          { id: 'en', type: 'end' }
        ],
        edges: [{ from: 'st', to: 'en' }],
        traversal: {
          decision: 'first-match-else-default',
          parallel: 'all-matching',
          default: 'first-match'
        },
        metadata: {
          version: '1',
          compiledAt: new Date().toISOString(),
          specId: 't'
        }
      };

      const eid = 'exec-temporal-async';
      await orch.startExecution(createContext(eid, workflowGraph));

      expect(startScenarioWorkflow).toHaveBeenCalled();
      expect(runScenarioWorkflow).not.toHaveBeenCalled();

      const pending = orch.getExecutionState(eid);
      expect(pending?.temporalAsync).toBe(true);
      expect(pending?.completed).toBe(false);

      const outcome = await orch.syncTemporalExecutionResult(eid);
      expect(outcome?.success).toBe(true);
      expect(getWorkflowResult).toHaveBeenCalledWith(eid);

      const done = orch.getExecutionState(eid);
      expect(done?.temporalAsync).toBeFalsy();
      expect(done?.completed).toBe(true);
    });
  });

  describe('Shadow canary duplicate', () => {
    let prevShadow: string | undefined;

    beforeEach(() => {
      prevShadow = process.env.SHADOW_CANARY_ENABLED;
      delete process.env.SHADOW_CANARY_ENABLED;
    });

    afterEach(() => {
      if (prevShadow === undefined) {
        delete process.env.SHADOW_CANARY_ENABLED;
      } else {
        process.env.SHADOW_CANARY_ENABLED = prevShadow;
      }
    });

    it('parallel shadow run: stable primary, canary duplicate, tools executed once', async () => {
      const registry = new ToolRegistry();
      const tool = createTestTool('shadow-tool');
      registry.register(tool);
      let realExecutions = 0;
      gateway.registerTool(tool.id, tool, async () => {
        realExecutions++;
        return {
          success: true,
          outputs: { ok: true },
          metadata: { latency: 0, timestamp: new Date().toISOString() }
        };
      });
      orchestrator.setRegistry(registry);

      const execId = 'primary-shadow-1';
      const graph = createWorkflowGraph(tool.id);
      const deploymentDescriptor: DeploymentDescriptor = {
        strategy: 'shadow',
        shadowConfig: { enabled: true, percentage: 100 }
      };

      await orchestrator.startExecution({
        ...createContext(execId, graph),
        deploymentDescriptor
      });

      expect(orchestrator.getExecutionState(execId)?.completed).toBe(true);
      expect(orchestrator.getExecutionState(execId)?.deploymentLane).toBe('stable');

      const shadowId = `${execId}__shadow_canary`;
      for (let i = 0; i < 120; i++) {
        const s = orchestrator.getExecutionState(shadowId);
        if (s?.completed) {
          break;
        }
        await new Promise(r => setTimeout(r, 10));
      }

      const shadowState = orchestrator.getExecutionState(shadowId);
      expect(shadowState?.completed).toBe(true);
      expect(shadowState?.deploymentLane).toBe('canary');
      expect(realExecutions).toBe(1);
    });
  });
});
