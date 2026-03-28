/**
 * Temporal Workflow: durable исполнение сценария по WorkflowGraph.
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './temporal-activities';
import type { WorkflowGraph, WorkflowNode } from '../builder/workflow-graph';
import type {
  ScenarioWorkflowNodeOutcome,
  ScenarioWorkflowOutcome
} from './scenario-workflow-outcome.js';
import { collectIncomingOutputs, findNextEdges, getRoutingOutputs } from './workflow-traversal.js';

const { executeNodeActivity, compensateNodeActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2
  }
});

const { executeAgentNodeActivity } = proxyActivities<Pick<typeof activities, 'executeAgentNodeActivity'>>({
  startToCloseTimeout: '5m',
  retry: {
    maximumAttempts: 2,
    initialInterval: '2s',
    backoffCoefficient: 2
  }
});

export interface ScenarioWorkflowInitialContext {
  executionId: string;
  scenarioId: string;
  userId: string;
  userRoles: string[];
  traceId?: string;
  spanId?: string;
  /** Необязательные входные данные запуска (проброс из Orchestrator) */
  input?: Record<string, unknown>;
  deploymentLane?: 'stable' | 'canary';
  deploymentStrategy?: string;
  isShadowRun?: boolean;
  /** Проброс в activities: tool calls — заглушка (shadow-canary) */
  shadowToolStub?: boolean;
  /** Изоляция кэша activity / idempotency tool gateway */
  tenantId?: string;
  /** Стартовая накопленная оценка USD за execution (дальше ведётся в workflow) */
  executionSpendUsd?: number;
}

type StoredResult =
  | { ok: true; outputs?: Record<string, unknown> }
  | { ok: false; error?: string; code?: string };

function getStoredOutputs(
  results: Record<string, StoredResult>,
  id: string
): Record<string, unknown> | undefined {
  const r = results[id];
  return r?.ok ? r.outputs : undefined;
}

function toNodeOutcomes(
  results: Record<string, StoredResult>
): Record<string, ScenarioWorkflowNodeOutcome> {
  const out: Record<string, ScenarioWorkflowNodeOutcome> = {};
  for (const [id, r] of Object.entries(results)) {
    if (r.ok) {
      out[id] = { ok: true, outputs: r.outputs };
    } else {
      out[id] = { ok: false, code: r.code, error: r.error };
    }
  }
  return out;
}

function mergeToolInputs(
  node: WorkflowNode,
  graph: WorkflowGraph,
  results: Record<string, StoredResult>
): Record<string, unknown> {
  const fromPrevious = collectIncomingOutputs(node.id, graph, id => getStoredOutputs(results, id));
  const cfgInputs = node.config?.inputs;
  if (cfgInputs && typeof cfgInputs === 'object' && !Array.isArray(cfgInputs)) {
    return { ...fromPrevious, ...(cfgInputs as Record<string, unknown>) };
  }
  return fromPrevious;
}

async function executeWorkflowNode(
  node: WorkflowNode,
  graph: WorkflowGraph,
  ctx: ScenarioWorkflowInitialContext,
  results: Record<string, StoredResult>,
  scenarioSpec: unknown,
  spendAcc: { usd: number }
): Promise<StoredResult> {
  switch (node.type) {
    case 'start':
      return { ok: true, outputs: {} };
    case 'end':
      return { ok: true };
    case 'action': {
      if (!node.toolId) {
        return {
          ok: false,
          code: 'MISSING_TOOL_ID',
          error: 'Action node missing toolId'
        };
      }
      const inputs = mergeToolInputs(node, graph, results);
      const res = await executeNodeActivity({
        nodeId: node.id,
        toolId: node.toolId,
        inputs,
        context: {
          scenarioId: ctx.scenarioId,
          executionId: ctx.executionId,
          userId: ctx.userId,
          userRoles: ctx.userRoles,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          deploymentLane: ctx.deploymentLane,
          shadowToolStub: ctx.shadowToolStub === true,
          tenantId: ctx.tenantId,
          executionSpendUsd: spendAcc.usd
        }
      });
      if (!res.success) {
        return { ok: false, error: res.error, code: 'TOOL_FAILED' };
      }
      if (res.executionSpendUsdAfter !== undefined) {
        spendAcc.usd = res.executionSpendUsdAfter;
      }
      return { ok: true, outputs: res.outputs };
    }
    case 'agent': {
      const fromPrevious = collectIncomingOutputs(node.id, graph, id => getStoredOutputs(results, id));
      let userIntent = node.agentConfig?.userIntent;
      if (!userIntent && fromPrevious && typeof fromPrevious === 'object') {
        const fp = fromPrevious as Record<string, unknown>;
        userIntent =
          (fp.intent as string | undefined) ||
          (fp.query as string | undefined) ||
          (fp.message as string | undefined) ||
          JSON.stringify(fromPrevious);
      }
      if (!userIntent) {
        userIntent = 'Process the request';
      }
      const allowedToolIds = node.agentConfig?.allowedTools ?? [];
      const res = await executeAgentNodeActivity({
        nodeId: node.id,
        userIntent,
        allowedToolIds,
        context: {
          scenarioId: ctx.scenarioId,
          executionId: ctx.executionId,
          userId: ctx.userId,
          userRoles: ctx.userRoles,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          deploymentLane: ctx.deploymentLane,
          shadowToolStub: ctx.shadowToolStub === true,
          tenantId: ctx.tenantId,
          executionSpendUsd: spendAcc.usd
        },
        scenarioSpec
      });
      if (!res.success) {
        return { ok: false, error: res.error, code: 'AGENT_FAILED' };
      }
      if (res.executionSpendUsdAfter !== undefined) {
        spendAcc.usd = res.executionSpendUsdAfter;
      }
      return { ok: true, outputs: res.outputs };
    }
    default:
      return { ok: true, outputs: {} };
  }
}

/**
 * Workflow для выполнения сценария (паритет с in-memory executeWorkflow оркестратора).
 */
export async function scenarioWorkflow(
  workflowGraph: WorkflowGraph,
  scenarioSpec: unknown,
  initialContext: ScenarioWorkflowInitialContext
): Promise<ScenarioWorkflowOutcome> {
  const graph = workflowGraph;
  const ctx = initialContext;
  const results: Record<string, StoredResult> = {};
  const compensationStack: string[] = [];
  const spendAcc = { usd: ctx.executionSpendUsd ?? 0 };

  let scenarioFailed = false;
  let scenarioError: string | undefined;
  let scenarioErrorCode: string | undefined;
  let terminalNodeId: string | undefined;
  let finished = false;
  let finalResult: unknown = undefined;

  async function walk(nodeId: string): Promise<void> {
    if (finished || scenarioFailed) {
      return;
    }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) {
      scenarioFailed = true;
      scenarioError = `Node ${nodeId} not found`;
      scenarioErrorCode = 'NODE_NOT_FOUND';
      terminalNodeId = nodeId;
      return;
    }

    const outcome = await executeWorkflowNode(node, graph, ctx, results, scenarioSpec, spendAcc);
    results[node.id] = outcome;

    if (!outcome.ok) {
      while (compensationStack.length > 0) {
        const cid = compensationStack.pop()!;
        await compensateNodeActivity({ nodeId: cid, reason: outcome.error });
      }
      scenarioFailed = true;
      scenarioError = outcome.error ?? 'Node execution failed';
      scenarioErrorCode = outcome.code ?? 'NODE_FAILED';
      terminalNodeId = node.id;
      return;
    }

    if (outcome.outputs !== undefined) {
      finalResult = outcome.outputs;
    }

    if (node.type === 'action' || node.type === 'agent') {
      compensationStack.push(node.id);
    }

    const routingOutputs = getRoutingOutputs(
      node,
      graph,
      outcome.outputs,
      id => getStoredOutputs(results, id)
    );
    const nextEdges = findNextEdges(node, graph, routingOutputs);

    if (nextEdges.length === 0) {
      finished = true;
      return;
    }
    if (nextEdges.some(e => e.to === 'end')) {
      finished = true;
      return;
    }

    for (const edge of nextEdges) {
      await walk(edge.to);
      if (scenarioFailed || finished) {
        return;
      }
    }
  }

  const startNode = graph.nodes.find(n => n.type === 'start');
  if (!startNode) {
    return {
      success: false,
      error: 'Workflow graph has no start node',
      errorCode: 'NO_START_NODE',
      nodeOutcomes: {}
    };
  }

  await walk(startNode.id);

  const nodeOutcomes = toNodeOutcomes(results);

  if (scenarioFailed) {
    return {
      success: false,
      error: scenarioError,
      errorCode: scenarioErrorCode ?? 'WORKFLOW_FAILED',
      terminalNodeId,
      nodeOutcomes
    };
  }

  const endNode = graph.nodes.find(n => n.type === 'end');
  return {
    success: true,
    result: finalResult,
    terminalNodeId: endNode?.id ?? 'end',
    nodeOutcomes
  };
}
