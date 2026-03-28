/**
 * Temporal Activities: вызовы инструментов через Tool Gateway (worker process).
 *
 * Успешные результаты кэшируются в БД по ключу Temporal (workflowId + runId + activityId),
 * чтобы при retry activity не повторять вызов инструмента (см. TEMPORAL_ACTIVITY_DEDUP).
 */

import type { AgentExecutionContext, AgentRuntime } from '../agent/agent-runtime';
import { TemporalToolActivityResultRepository } from '../db/repositories/temporal-tool-activity-result-repository';
import type { ToolGateway, ToolRequest } from '../gateway/tool-gateway';
import type { RegisteredTool, ToolRegistry } from '../registry/tool-registry';
import type { ScenarioSpec } from '../spec/scenario-spec';
import {
  buildTenantScopedActivityDedupKey,
  getTemporalActivityDedupKeyOrNull
} from './temporal-activity-dedup-key';
import { estimateToolCallCostUsd } from '../utils/tool-call-cost';

/**
 * Параметры выполнения узла
 */
export interface ExecuteNodeParams {
  nodeId: string;
  toolId: string;
  inputs: Record<string, unknown>;
  context: {
    scenarioId: string;
    executionId: string;
    userId: string;
    userRoles: string[];
    traceId?: string;
    spanId?: string;
    deploymentLane?: string;
    shadowToolStub?: boolean;
    tenantId?: string;
    /** Накопленная оценка USD до этого вызова (OPA executionSpendUsd) */
    executionSpendUsd?: number;
  };
}

/**
 * Результат выполнения узла
 */
export interface ExecuteNodeResult {
  success: boolean;
  outputs?: Record<string, unknown>;
  error?: string;
  /** После успеха: накопленная оценка USD за execution */
  executionSpendUsdAfter?: number;
}

/**
 * Параметры компенсации
 */
export interface CompensateNodeParams {
  nodeId: string;
  reason?: string;
}

export interface ExecuteAgentNodeParams {
  nodeId: string;
  userIntent: string;
  allowedToolIds: string[];
  context: ExecuteNodeParams['context'];
  scenarioSpec: unknown;
}

let activityGateway: ToolGateway | null = null;
let activityRegistry: ToolRegistry | null = null;
let activityAgentRuntime: AgentRuntime | null = null;

export function initTemporalActivityEnv(gateway: ToolGateway, registry: ToolRegistry): void {
  activityGateway = gateway;
  activityRegistry = registry;
}

export function setTemporalAgentRuntime(runtime: AgentRuntime | null): void {
  activityAgentRuntime = runtime;
}

export function resetTemporalActivityEnv(): void {
  activityGateway = null;
  activityRegistry = null;
  activityAgentRuntime = null;
}

function requireActivityEnv(): { gateway: ToolGateway; registry: ToolRegistry } {
  if (!activityGateway || !activityRegistry) {
    throw new Error('Temporal activities: call initTemporalActivityEnv() before starting the worker');
  }
  return { gateway: activityGateway, registry: activityRegistry };
}

function isTemporalActivityDedupEnabled(): boolean {
  const v = process.env.TEMPORAL_ACTIVITY_DEDUP?.toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

interface ActivityDedupRef {
  nodeId: string;
  context: ExecuteNodeParams['context'];
}

async function withSuccessfulActivityDedup(
  ref: ActivityDedupRef,
  activityKind: 'tool' | 'agent',
  toolIdForRecord: string | null,
  run: () => Promise<ExecuteNodeResult>
): Promise<ExecuteNodeResult> {
  const rawKey = getTemporalActivityDedupKeyOrNull();
  const dedupKey =
    rawKey && isTemporalActivityDedupEnabled()
      ? buildTenantScopedActivityDedupKey(ref.context.tenantId, rawKey)
      : null;
  if (dedupKey && isTemporalActivityDedupEnabled()) {
    const repo = new TemporalToolActivityResultRepository();
    const hit = await repo.findSuccessByDedupKey(dedupKey);
    if (hit) {
      if (activityKind === 'tool' && toolIdForRecord) {
        const { registry } = requireActivityEnv();
        const t = registry.get(toolIdForRecord);
        const before = ref.context.executionSpendUsd ?? 0;
        const delta = t ? estimateToolCallCostUsd(t) : 0;
        return {
          success: true,
          outputs: hit.outputs,
          executionSpendUsdAfter: before + delta
        };
      }
      if (activityKind === 'agent') {
        const raw = { ...hit.outputs } as Record<string, unknown>;
        const spendAfter =
          typeof raw.__sbExecutionSpendUsdAfter === 'number'
            ? raw.__sbExecutionSpendUsdAfter
            : ref.context.executionSpendUsd ?? 0;
        delete raw.__sbExecutionSpendUsdAfter;
        return {
          success: true,
          outputs: raw,
          executionSpendUsdAfter: spendAfter
        };
      }
      return { success: true, outputs: hit.outputs };
    }
  }

  const result = await run();

  if (
    result.success &&
    result.outputs !== undefined &&
    dedupKey &&
    isTemporalActivityDedupEnabled()
  ) {
    const repo = new TemporalToolActivityResultRepository();
    const outputsToPersist =
      activityKind === 'agent' && typeof result.executionSpendUsdAfter === 'number'
        ? { ...result.outputs, __sbExecutionSpendUsdAfter: result.executionSpendUsdAfter }
        : result.outputs;
    await repo.recordSuccess({
      dedupKey,
      businessExecutionId: ref.context.executionId,
      nodeId: ref.nodeId,
      activityKind,
      toolId: toolIdForRecord,
      outputs: outputsToPersist,
    });
  }

  return result;
}

/**
 * Activity: выполнение action-узла через Tool Gateway
 */
export async function executeNodeActivity(params: ExecuteNodeParams): Promise<ExecuteNodeResult> {
  return withSuccessfulActivityDedup(params, 'tool', params.toolId, async () => {
    const { gateway, registry } = requireActivityEnv();
    const tool = registry.get(params.toolId);
    if (!tool) {
      return {
        success: false,
        error: `Tool not registered: ${params.toolId}`,
      };
    }

    const before = params.context.executionSpendUsd ?? 0;
    const rawDedup = getTemporalActivityDedupKeyOrNull();
    const idempotencyKey = rawDedup
      ? buildTenantScopedActivityDedupKey(params.context.tenantId, rawDedup)
      : undefined;
    const request: ToolRequest = {
      toolId: params.toolId,
      inputs: params.inputs,
      context: {
        scenarioId: params.context.scenarioId,
        executionId: params.context.executionId,
        userId: params.context.userId,
        userRoles: params.context.userRoles,
        traceId: params.context.traceId,
        spanId: params.context.spanId,
        deploymentLane: params.context.deploymentLane,
        shadowToolStub: params.context.shadowToolStub === true,
        tenantId: params.context.tenantId ?? 'default',
        ...(idempotencyKey ? { idempotencyKey } : {}),
        executionSpendUsd: before > 0 ? before : undefined,
      },
    };

    const response = await gateway.execute(request, tool);
    if (response.success) {
      return {
        success: true,
        outputs: response.outputs,
        executionSpendUsdAfter: before + estimateToolCallCostUsd(tool),
      };
    }

    return {
      success: false,
      error: response.error?.message ?? 'Tool execution failed',
    };
  });
}

/**
 * Activity: компенсация (заглушка; расширяется под compensate tools)
 */
export async function compensateNodeActivity(params: CompensateNodeParams): Promise<void> {
  console.log(`[Temporal] Compensating node ${params.nodeId}, reason: ${params.reason ?? 'unknown'}`);
}

function isScenarioSpecLike(spec: unknown): spec is ScenarioSpec {
  if (!spec || typeof spec !== 'object') {
    return false;
  }
  const o = spec as Record<string, unknown>;
  return Array.isArray(o.allowedActions);
}

/**
 * Activity: выполнение agent-узла через Agent Runtime (если задан в worker).
 */
export async function executeAgentNodeActivity(
  params: ExecuteAgentNodeParams
): Promise<ExecuteNodeResult> {
  return withSuccessfulActivityDedup(params, 'agent', null, async () => {
    if (!activityAgentRuntime) {
      return {
        success: false,
        error:
          'Agent Runtime is not configured on Temporal worker (set TEMPORAL_ENABLE_AGENT=1 and Ollama, or use in-process Orchestrator)',
      };
    }

    const { registry } = requireActivityEnv();

    if (!isScenarioSpecLike(params.scenarioSpec)) {
      return {
        success: false,
        error: 'Invalid scenarioSpec: expected object with allowedActions[]',
      };
    }

    const scenarioSpec = params.scenarioSpec;
    let availableTools: RegisteredTool[] = [];
    const allowed = params.allowedToolIds;
    if (allowed.length > 0) {
      availableTools = registry.getAll().filter(t => allowed.includes(t.id));
    } else {
      const specToolIds = scenarioSpec.allowedActions?.map(a => a.id) ?? [];
      availableTools = registry.getAll().filter(t => specToolIds.includes(t.id));
    }

    const agentContext: AgentExecutionContext = {
      scenarioId: params.context.scenarioId,
      executionId: params.context.executionId,
      userId: params.context.userId,
      userRoles: params.context.userRoles,
      scenarioSpec,
      availableTools,
      userIntent: params.userIntent || 'Execute agent step',
      traceId: params.context.traceId,
      spanId: params.context.spanId,
      deploymentLane: params.context.deploymentLane,
      shadowToolStub: params.context.shadowToolStub === true,
      executionSpendUsd: params.context.executionSpendUsd ?? 0,
      tenantId: params.context.tenantId ?? 'default',
    };

    const agentResult = await activityAgentRuntime.execute(agentContext);

    if (agentResult.success) {
      return {
        success: true,
        outputs: {
          output: agentResult.output,
          toolCallsExecuted: agentResult.toolCallsExecuted,
          totalTokens: agentResult.totalTokens,
        },
        executionSpendUsdAfter: agentContext.executionSpendUsd ?? 0,
      };
    }

    return {
      success: false,
      error: agentResult.error?.message ?? 'Agent execution failed',
    };
  });
}
