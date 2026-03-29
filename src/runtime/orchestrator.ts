/**
 * Runtime Orchestrator
 * 
 * Event-driven исполнение сценариев с durable execution через Temporal.
 * 
 * Функции:
 * - Event ingestion: подписка на топики/очереди, обработка webhooks
 * - Orchestration engine: хранение durable state каждого запуска,
 *   восстановление после сбоев, retries/timeouts
 * - Saga/Compensation: для длинных транзакций обязательна поддержка компенсации
 */

import { WorkflowGraph, WorkflowNode, ScenarioBuilder, type DeploymentDescriptor } from '../builder';
import { ScenarioSpec } from '../spec';
import { ToolGateway, ToolRequest, ToolRequestContext } from '../gateway';
import { RegisteredTool, ToolRegistry } from '../registry';
import { AgentRuntime, AgentExecutionContext } from '../agent/agent-runtime';
import { IEventBus, BaseEvent, createEvent } from '../events';
import { ExecutionRepository, NodeExecutionRepository } from '../db/repositories';
import { TemporalClient } from './temporal-client';
import type { ScenarioWorkflowStatusSnapshot } from './temporal-workflow-status';
import {
  toUnifiedExecutionStatus,
  toUnifiedExecutionStatusFromDb,
  type UnifiedExecutionStatus,
  type ExecutionRuntimeKind
} from './unified-execution-status';
import type { AuditService } from '../audit/audit-service';
import {
  collectIncomingOutputs,
  findNextEdges,
  getRoutingOutputs
} from './workflow-traversal';
import {
  assignExecutionLane,
  shouldRunShadowCanaryDuplicate,
  type DeploymentLane
} from './canary-router';
import type { ScenarioWorkflowOutcome } from './scenario-workflow-outcome';
import { estimateToolCallCostUsd } from '../utils/tool-call-cost';
import { dispatchWebhooks } from './webhook-dispatch';
import { getUsageMeter } from '../services/usage-meter.js';
import { resolveOrgIdForTenant } from '../services/quota-enforcer.js';

/**
 * Контекст выполнения сценария
 */
export interface ExecutionContext {
  scenarioId: string;
  executionId: string;
  workflowGraph: WorkflowGraph;
  spec: ScenarioSpec;
  /** Multi-tenant: запись Execution в БД и согласованность со сценариями API */
  tenantId?: string;
  /** Billing / usage: если не задан — вычисляется из tenantId через Workspace */
  orgId?: string;
  userId: string;
  userRoles: string[];
  traceId: string;
  spanId: string;
  startedAt: Date;
  /** Если не задан — вычисляется из spec через ScenarioBuilder */
  deploymentDescriptor?: DeploymentDescriptor;
  /** Если не задан — вычисляется по descriptor и executionId */
  deploymentLane?: DeploymentLane;
  /** Дубль shadow→canary: не порождать вложенные shadow-запуски */
  isShadowRun?: boolean;
}

/**
 * Состояние выполнения узла workflow
 */
export enum NodeExecutionState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATED = 'compensated'
}

/**
 * Результат выполнения узла
 */
export interface NodeExecutionResult {
  nodeId: string;
  state: NodeExecutionState;
  startedAt: Date;
  completedAt?: Date;
  outputs?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  retryCount: number;
}

/**
 * Состояние выполнения workflow
 */
export interface WorkflowExecutionState {
  executionId: string;
  currentNodeId: string;
  nodeResults: Map<string, NodeExecutionResult>;
  compensationStack: string[]; // стек узлов для компенсации
  completed: boolean;
  failed: boolean;
  error?: {
    code: string;
    message: string;
  };
  deploymentLane?: DeploymentLane;
  deploymentStrategy?: DeploymentDescriptor['strategy'];
  /** Откуда исполнялся сценарий (единая модель с БД и API) */
  runtimeKind?: ExecutionRuntimeKind;
  temporalRunId?: string;
  temporalTaskQueue?: string;
  /**
   * Temporal: workflow запущен, результат ещё не подтянут в процесс.
   * Вызовите {@link Orchestrator.syncTemporalExecutionResult}.
   */
  temporalAsync?: boolean;
  tenantId?: string;
  /** Накопленная оценка затрат USD за execution (после tool/agent узлов) */
  executionSpendUsd?: number;
}

/**
 * Event для workflow
 */
export interface WorkflowEvent {
  type: 'trigger' | 'node_completed' | 'node_failed' | 'compensation';
  executionId: string;
  nodeId?: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Orchestrator
 */
export class Orchestrator {
  private gateway: ToolGateway;
  private agentRuntime?: AgentRuntime;
  private registry?: ToolRegistry;
  private eventBus?: IEventBus;
  private executionRepository?: ExecutionRepository;
  private nodeExecutionRepository?: NodeExecutionRepository;
  private temporalClient?: TemporalClient;
  private auditService?: AuditService;
  private useTemporal: boolean = false;
  private executionStates: Map<string, WorkflowExecutionState> = new Map();
  private eventHistory: Map<string, WorkflowEvent[]> = new Map();
  /** Контекст для маппинга результата Temporal (async или после await) */
  private temporalLaunchContexts: Map<string, ExecutionContext> = new Map();
  private readonly scenarioBuilder = new ScenarioBuilder();

  constructor(
    gateway: ToolGateway,
    agentRuntime?: AgentRuntime,
    registry?: ToolRegistry,
    eventBus?: IEventBus,
    executionRepository?: ExecutionRepository,
    nodeExecutionRepository?: NodeExecutionRepository,
    temporalClient?: TemporalClient
  ) {
    this.gateway = gateway;
    this.agentRuntime = agentRuntime;
    this.registry = registry;
    this.eventBus = eventBus;
    this.executionRepository = executionRepository;
    this.nodeExecutionRepository = nodeExecutionRepository;
    this.temporalClient = temporalClient;
    this.useTemporal = temporalClient !== undefined;
  }

  /**
   * Установка Agent Runtime
   */
  setAgentRuntime(agentRuntime: AgentRuntime): void {
    this.agentRuntime = agentRuntime;
  }

  /**
   * Установка Tool Registry
   */
  setRegistry(registry: ToolRegistry): void {
    this.registry = registry;
  }

  /**
   * Установка Temporal Client для durable execution
   */
  setTemporalClient(temporalClient: TemporalClient): void {
    this.temporalClient = temporalClient;
    this.useTemporal = true;
  }

  /**
   * Установка сервиса аудита для логирования сценариев
   */
  setAuditService(service: AuditService): void {
    this.auditService = service;
  }

  /**
   * Запуск выполнения сценария
   */
  async startExecution(context: ExecutionContext): Promise<string> {
    const enriched = this.enrichExecutionContext(context);
    const tid = enriched.tenantId ?? 'default';
    const orgId = enriched.orgId ?? (await resolveOrgIdForTenant(tid));
    const ctx: ExecutionContext = { ...enriched, orgId };
    try {
      getUsageMeter().track(orgId, tid, 'executions', 1);
    } catch (_) {
      /* best-effort */
    }

    if (this.useTemporal && this.temporalClient) {
      return await this.startTemporalExecution(ctx);
    }

    return await this.startInMemoryExecution(ctx);
  }

  /**
   * Подтянуть результат workflow из Temporal и обновить `executionStates` / события / аудит.
   * Имеет смысл только если запуск был с `TEMPORAL_AWAIT_RESULT=false`.
   */
  async syncTemporalExecutionResult(executionId: string): Promise<ScenarioWorkflowOutcome | null> {
    if (!this.temporalClient) {
      return null;
    }
    const state = this.executionStates.get(executionId);
    if (!state?.temporalAsync) {
      return null;
    }
    const launchContext = this.temporalLaunchContexts.get(executionId);
    if (!launchContext) {
      return null;
    }
    try {
      const outcome = await this.temporalClient.getWorkflowResult(executionId);
      const desc = await this.temporalClient.describeScenarioWorkflow(executionId);
      const merged: ScenarioWorkflowOutcome = {
        ...outcome,
        temporalRunId: desc?.runId ?? outcome.temporalRunId,
        temporalWorkflowId: desc?.workflowId ?? outcome.temporalWorkflowId ?? executionId
      };
      await this.applyTemporalWorkflowOutcome(executionId, merged, launchContext);
      this.temporalLaunchContexts.delete(executionId);
      return merged;
    } catch (error) {
      console.error(`[Orchestrator] syncTemporalExecutionResult failed for ${executionId}:`, error);
      return null;
    }
  }

  /**
   * Статус Temporal workflow по `executionId` (= workflowId), без `result()`.
   */
  async getTemporalWorkflowStatus(
    executionId: string
  ): Promise<ScenarioWorkflowStatusSnapshot | null> {
    if (!this.temporalClient) {
      return null;
    }
    return this.temporalClient.describeScenarioWorkflow(executionId);
  }

  /** JSON-история Temporal workflow (`historyToJSON`), `null` если клиента нет или workflow не найден. */
  async getTemporalWorkflowHistoryJson(executionId: string): Promise<string | null> {
    if (!this.temporalClient) {
      return null;
    }
    return this.temporalClient.fetchScenarioWorkflowHistoryJson(executionId);
  }

  /**
   * Единый статус для API: in-memory состояние + при Temporal — describe().
   */
  async getUnifiedExecutionStatus(executionId: string): Promise<UnifiedExecutionStatus | null> {
    const state = this.executionStates.get(executionId);
    const runtimeKind: ExecutionRuntimeKind =
      state?.runtimeKind ?? (this.useTemporal ? 'temporal' : 'in_memory');

    if (!state && runtimeKind === 'in_memory' && !this.temporalClient) {
      return null;
    }

    let temporalDescribe: ScenarioWorkflowStatusSnapshot | null = null;
    if (this.temporalClient && runtimeKind === 'temporal') {
      temporalDescribe = await this.temporalClient.describeScenarioWorkflow(executionId);
    }

    const u = toUnifiedExecutionStatus(executionId, state, temporalDescribe, runtimeKind);
    return {
      ...u,
      ...(state !== undefined ? { source: 'memory' as const } : {})
    };
  }

  /**
   * Единый статус по строке Prisma + опционально live `describe()` Temporal (после рестарта API).
   */
  async getUnifiedExecutionStatusFromDb(
    executionId: string,
    tenantId: string = 'default'
  ): Promise<UnifiedExecutionStatus | null> {
    if (!this.executionRepository) {
      return null;
    }
    const row = await this.executionRepository.findStatusPayloadByExecutionId(executionId, tenantId);
    if (!row) {
      return null;
    }
    let live: ScenarioWorkflowStatusSnapshot | null = null;
    if (this.temporalClient && row.runtimeKind === 'temporal') {
      live = await this.temporalClient.describeScenarioWorkflow(executionId);
    }
    return toUnifiedExecutionStatusFromDb(row, live);
  }

  /**
   * Сначала память процесса (если есть execution в кэше), иначе БД — для API после рестарта.
   */
  async getUnifiedExecutionStatusResolved(
    executionId: string,
    tenantId?: string
  ): Promise<UnifiedExecutionStatus | null> {
    const state = this.executionStates.get(executionId);
    const tid = tenantId ?? state?.tenantId ?? 'default';
    if (state) {
      return this.getUnifiedExecutionStatus(executionId);
    }
    return this.getUnifiedExecutionStatusFromDb(executionId, tid);
  }

  /**
   * Параллельный дубль на полосе canary (strategy shadow), без влияния на основной ответ.
   * Инструменты — заглушка (`shadowToolStub`); см. `SHADOW_CANARY_ENABLED`.
   */
  private launchShadowCanaryDuplicateIfEligible(primary: ExecutionContext): void {
    if (primary.isShadowRun) {
      return;
    }
    const d = primary.deploymentDescriptor;
    if (!d || !shouldRunShadowCanaryDuplicate(d, primary.executionId)) {
      return;
    }
    const disabled =
      process.env.SHADOW_CANARY_ENABLED === '0' ||
      process.env.SHADOW_CANARY_ENABLED === 'false';
    if (disabled) {
      return;
    }

    const shadowId = `${primary.executionId}__shadow_canary`;
    const shadowCtx: ExecutionContext = {
      ...primary,
      executionId: shadowId,
      deploymentLane: 'canary',
      isShadowRun: true,
      startedAt: new Date()
    };

    void (async () => {
      try {
        if (this.useTemporal && this.temporalClient) {
          await this.startTemporalShadowWorkflow(shadowCtx);
        } else {
          await this.startInMemoryExecution(shadowCtx);
        }
      } catch (e) {
        console.warn('[Orchestrator] shadow canary duplicate failed:', e);
      }
    })();
  }

  private async startTemporalShadowWorkflow(context: ExecutionContext): Promise<void> {
    if (!this.temporalClient) {
      return;
    }
    const initialContextPayload = {
      executionId: context.executionId,
      scenarioId: context.scenarioId,
      userId: context.userId,
      userRoles: context.userRoles,
      traceId: context.traceId,
      spanId: context.spanId,
      input: {},
      deploymentLane: context.deploymentLane,
      deploymentStrategy: context.deploymentDescriptor?.strategy,
      isShadowRun: true,
      shadowToolStub: true,
      tenantId: context.tenantId ?? 'default'
    };
    await this.temporalClient.startScenarioWorkflow(
      context.executionId,
      context.workflowGraph,
      context.spec,
      initialContextPayload
    );
  }

  private enrichExecutionContext(context: ExecutionContext): ExecutionContext {
    const deploymentDescriptor =
      context.deploymentDescriptor ??
      this.scenarioBuilder.generateDeploymentDescriptor(context.spec);
    const deploymentLane =
      context.deploymentLane ?? assignExecutionLane(deploymentDescriptor, context.executionId);
    if (
      context.deploymentDescriptor === deploymentDescriptor &&
      context.deploymentLane === deploymentLane
    ) {
      return context;
    }
    return { ...context, deploymentDescriptor, deploymentLane };
  }

  /**
   * Паритет с in-memory: заполняем `WorkflowExecutionState` из результата Temporal workflow.
   */
  private mapTemporalOutcomeToExecutionState(
    executionId: string,
    outcome: ScenarioWorkflowOutcome,
    context: ExecutionContext
  ): WorkflowExecutionState {
    const nodeResults = new Map<string, NodeExecutionResult>();
    const completedAt = new Date();
    const startedAt = context.startedAt;
    if (outcome.nodeOutcomes) {
      for (const [id, n] of Object.entries(outcome.nodeOutcomes)) {
        nodeResults.set(id, {
          nodeId: id,
          state: n.ok ? NodeExecutionState.COMPLETED : NodeExecutionState.FAILED,
          startedAt,
          completedAt,
          outputs: n.outputs,
          error: n.ok ? undefined : { code: n.code ?? 'UNKNOWN', message: n.error ?? '' },
          retryCount: 0
        });
      }
    }
    const endNode = context.workflowGraph.nodes.find(n => n.type === 'end');
    const currentNodeId = outcome.success
      ? (endNode?.id ?? outcome.terminalNodeId ?? 'end')
      : (outcome.terminalNodeId ?? 'unknown');

    return {
      executionId,
      currentNodeId,
      nodeResults,
      compensationStack: [],
      completed: outcome.success,
      failed: !outcome.success,
      error: outcome.success
        ? undefined
        : {
            code: outcome.errorCode ?? 'WORKFLOW_FAILED',
            message: outcome.error ?? 'Workflow failed'
          },
      deploymentLane: context.deploymentLane,
      deploymentStrategy: context.deploymentDescriptor?.strategy,
      runtimeKind: 'temporal',
      temporalRunId: outcome.temporalRunId,
      temporalTaskQueue: 'scenario-execution',
      tenantId: context.tenantId ?? 'default'
    };
  }

  /** По умолчанию true; `false` — только старт workflow, результат через {@link syncTemporalExecutionResult}. */
  private temporalAwaitWorkflowResult(): boolean {
    return process.env.TEMPORAL_AWAIT_RESULT !== 'false';
  }

  private async persistDbAfterTemporalOutcome(
    executionId: string,
    executionState: WorkflowExecutionState,
    outcome: ScenarioWorkflowOutcome
  ): Promise<void> {
    if (!this.executionRepository) {
      return;
    }
    try {
      const tid = executionState.tenantId ?? 'default';
      const status = executionState.completed
        ? 'completed'
        : executionState.failed
          ? 'failed'
          : 'running';
      await this.executionRepository.updateStatus(
        executionId,
        {
          status,
          currentNodeId: executionState.currentNodeId,
          errorMessage: executionState.error?.message,
          errorCode: executionState.error?.code
        },
        tid
      );
      await this.executionRepository.patchTemporalMetadata(
        executionId,
        {
          temporalRunId: outcome.temporalRunId ?? executionState.temporalRunId ?? null,
          temporalTaskQueue: executionState.temporalTaskQueue ?? 'scenario-execution',
          temporalStatusName:
            status === 'completed' ? 'COMPLETED' : status === 'failed' ? 'FAILED' : 'RUNNING'
        },
        tid
      );
    } catch (e) {
      console.warn(`[Orchestrator] Failed to persist temporal execution to DB:`, e);
    }
  }

  private async persistTemporalWorkflowStarted(
    executionId: string,
    runId: string,
    tenantId: string = 'default'
  ): Promise<void> {
    if (!this.executionRepository) {
      return;
    }
    try {
      await this.executionRepository.updateStatus(
        executionId,
        {
          status: 'running',
          currentNodeId: 'temporal-pending'
        },
        tenantId
      );
      await this.executionRepository.patchTemporalMetadata(
        executionId,
        {
          temporalRunId: runId,
          temporalTaskQueue: 'scenario-execution',
          temporalStatusName: 'RUNNING'
        },
        tenantId
      );
    } catch (e) {
      console.warn(`[Orchestrator] Failed to persist temporal start to DB:`, e);
    }
  }

  private async applyTemporalWorkflowOutcome(
    executionId: string,
    outcome: ScenarioWorkflowOutcome,
    context: ExecutionContext
  ): Promise<void> {
    const executionState = this.mapTemporalOutcomeToExecutionState(executionId, outcome, context);
    this.executionStates.set(executionId, executionState);

    if (outcome.nodeOutcomes) {
      const nodeIds = Object.keys(outcome.nodeOutcomes).sort();
      for (const nodeId of nodeIds) {
        const n = outcome.nodeOutcomes[nodeId];
        await this.recordEvent({
          type: n.ok ? 'node_completed' : 'node_failed',
          executionId,
          nodeId,
          timestamp: new Date(),
          data: (n.ok ? n.outputs : { error: n.error, code: n.code }) as Record<string, unknown> | undefined
        });
      }
    }

    if (outcome.success) {
      void this.auditService?.logScenarioCompleted({
        scenarioId: context.scenarioId,
        executionId: context.executionId,
        userId: context.userId,
        traceId: context.traceId,
        spanId: context.spanId,
      });
      const durationMs = Date.now() - context.startedAt.getTime();
      const nodesCompleted = outcome.nodeOutcomes
        ? Object.values(outcome.nodeOutcomes).filter(n => n.ok).length
        : undefined;
      void dispatchWebhooks('execution.completed', {
        executionId: context.executionId,
        scenarioId: context.scenarioId,
        status: 'completed',
        tenantId: context.tenantId ?? 'default',
        duration: durationMs,
        cost: executionState.executionSpendUsd,
        nodesCompleted,
      });
    } else {
      void this.auditService?.logScenarioFailed({
        scenarioId: context.scenarioId,
        executionId: context.executionId,
        userId: context.userId,
        errorCode: outcome.errorCode,
        errorMessage: outcome.error,
        traceId: context.traceId,
        spanId: context.spanId,
      });
      void dispatchWebhooks('execution.failed', {
        executionId: context.executionId,
        scenarioId: context.scenarioId,
        error: outcome.error ?? 'Workflow failed',
        tenantId: context.tenantId ?? 'default',
        failedNode: outcome.terminalNodeId,
      });
    }

    await this.persistDbAfterTemporalOutcome(executionId, executionState, outcome);
  }

  /**
   * Запуск выполнения через Temporal (durable execution)
   */
  private async startTemporalExecution(context: ExecutionContext): Promise<string> {
    const executionId = context.executionId;

    // Сохранение выполнения в БД
    if (this.executionRepository) {
      try {
        await this.executionRepository.create({
          executionId,
          scenarioId: context.scenarioId,
          userId: context.userId,
          userRoles: context.userRoles,
          traceId: context.traceId,
          spanId: context.spanId,
          runtimeKind: 'temporal',
          tenantId: context.tenantId ?? 'default'
        });
      } catch (error) {
        console.warn(`[Orchestrator] Failed to save execution to DB:`, error);
      }
    }

    const initialContextPayload = {
      executionId: context.executionId,
      scenarioId: context.scenarioId,
      userId: context.userId,
      userRoles: context.userRoles,
      traceId: context.traceId,
      spanId: context.spanId,
      input: {},
      deploymentLane: context.deploymentLane,
      deploymentStrategy: context.deploymentDescriptor?.strategy,
      isShadowRun: context.isShadowRun === true,
      shadowToolStub: context.isShadowRun === true,
      tenantId: context.tenantId ?? 'default'
    };

    try {
      this.temporalLaunchContexts.set(executionId, context);
      this.eventHistory.set(executionId, []);

      void this.launchShadowCanaryDuplicateIfEligible(context);

      await this.recordEvent({
        type: 'trigger',
        executionId,
        timestamp: new Date(),
        data: {
          deploymentLane: context.deploymentLane,
          deploymentStrategy: context.deploymentDescriptor?.strategy
        }
      });

      void this.auditService?.logScenarioStarted({
        scenarioId: context.scenarioId,
        executionId: context.executionId,
        userId: context.userId,
        traceId: context.traceId,
        spanId: context.spanId,
      });

      void dispatchWebhooks('execution.started', {
        executionId: context.executionId,
        scenarioId: context.scenarioId,
        tenantId: context.tenantId ?? 'default',
      });

      if (this.eventBus) {
        await this.eventBus.publish(
          createEvent(
            'scenario.started',
            {
              executionId,
              scenarioId: context.scenarioId,
              userId: context.userId,
              deploymentLane: context.deploymentLane,
              deploymentStrategy: context.deploymentDescriptor?.strategy
            },
            context.executionId
          ),
          { topic: 'scenario-execution' }
        );
      }

      if (!this.temporalAwaitWorkflowResult()) {
        const startInfo = await this.temporalClient!.startScenarioWorkflow(
          executionId,
          context.workflowGraph,
          context.spec,
          initialContextPayload
        );
        await this.persistTemporalWorkflowStarted(
          executionId,
          startInfo.runId,
          context.tenantId ?? 'default'
        );
        this.executionStates.set(executionId, {
          executionId,
          currentNodeId: 'temporal-pending',
          nodeResults: new Map(),
          compensationStack: [],
          completed: false,
          failed: false,
          deploymentLane: context.deploymentLane,
          deploymentStrategy: context.deploymentDescriptor?.strategy,
          temporalAsync: true,
          runtimeKind: 'temporal',
          temporalRunId: startInfo.runId,
          temporalTaskQueue: 'scenario-execution',
          tenantId: context.tenantId ?? 'default'
        });
        return executionId;
      }

      const outcome = await this.temporalClient!.runScenarioWorkflow(
        executionId,
        context.workflowGraph,
        context.spec,
        initialContextPayload
      );

      await this.applyTemporalWorkflowOutcome(executionId, outcome, context);
      this.temporalLaunchContexts.delete(executionId);

      return executionId;
    } catch (error) {
      this.temporalLaunchContexts.delete(executionId);
      console.error(`[Orchestrator] Failed to start Temporal workflow:`, error);
      return await this.startInMemoryExecution(context);
    }
  }

  /**
   * Запуск выполнения в памяти (без Temporal)
   */
  private async startInMemoryExecution(context: ExecutionContext): Promise<string> {
    const executionId = context.executionId;
    
    // Сохранение выполнения в БД, если репозиторий доступен
    if (this.executionRepository) {
      try {
        await this.executionRepository.create({
          executionId,
          scenarioId: context.scenarioId,
          userId: context.userId,
          userRoles: context.userRoles,
          traceId: context.traceId,
          spanId: context.spanId,
          runtimeKind: 'in_memory',
          tenantId: context.tenantId ?? 'default'
        });
      } catch (error) {
        console.warn(`[Orchestrator] Failed to save execution to DB:`, error);
        // Продолжаем выполнение даже если сохранение в БД не удалось
      }
    }
    
    // Инициализация состояния выполнения
    const executionState: WorkflowExecutionState = {
      executionId,
      currentNodeId: 'start',
      nodeResults: new Map(),
      compensationStack: [],
      completed: false,
      failed: false,
      deploymentLane: context.deploymentLane,
      deploymentStrategy: context.deploymentDescriptor?.strategy,
      runtimeKind: 'in_memory',
      tenantId: context.tenantId ?? 'default'
    };

    this.executionStates.set(executionId, executionState);
    this.eventHistory.set(executionId, []);

    // Запись события запуска
    await this.recordEvent({
      type: 'trigger',
      executionId,
      timestamp: new Date(),
      data: {
        deploymentLane: context.deploymentLane,
        deploymentStrategy: context.deploymentDescriptor?.strategy,
        ...(context.isShadowRun ? { isShadowRun: true } : {})
      }
    });

    void this.auditService?.logScenarioStarted({
      scenarioId: context.scenarioId,
      executionId: context.executionId,
      userId: context.userId,
      traceId: context.traceId,
      spanId: context.spanId,
    });

    void dispatchWebhooks('execution.started', {
      executionId: context.executionId,
      scenarioId: context.scenarioId,
      tenantId: context.tenantId ?? 'default',
    });

    void this.launchShadowCanaryDuplicateIfEligible(context);

    // Начало выполнения workflow
    await this.executeWorkflow(context, executionState);

    return executionId;
  }

  /**
   * Выполнение workflow
   */
  private async executeWorkflow(
    context: ExecutionContext,
    state: WorkflowExecutionState
  ): Promise<void> {
    const { workflowGraph } = context;
    const currentNode = workflowGraph.nodes.find(n => n.id === state.currentNodeId);

    if (!currentNode) {
      state.failed = true;
      state.error = {
        code: 'NODE_NOT_FOUND',
        message: `Node ${state.currentNodeId} not found`
      };
      return;
    }

    // Выполнение узла
    try {
      const result = await this.executeNode(currentNode, context, state);
      state.nodeResults.set(currentNode.id, result);

      if (this.nodeExecutionRepository) {
        const tid = state.tenantId ?? context.tenantId ?? 'default';
        try {
          await this.nodeExecutionRepository.update(
            context.executionId,
            currentNode.id,
            {
              state: result.state,
              output: result.outputs,
              error: result.error,
              retryCount: result.retryCount
            },
            tid
          );
        } catch (dbErr) {
          console.warn('[Orchestrator] Failed to update node execution in DB:', dbErr);
        }
      }

      // Запись события
      await this.recordEvent({
        type: result.state === NodeExecutionState.COMPLETED ? 'node_completed' : 'node_failed',
        executionId: context.executionId,
        nodeId: currentNode.id,
        data:
          result.state === NodeExecutionState.COMPLETED
            ? result.outputs
            : { error: result.error, outputs: result.outputs },
        timestamp: new Date()
      });

      // Если узел завершился успешно, переходим к следующему
      if (result.state === NodeExecutionState.COMPLETED) {
        // Добавляем узел в стек компенсации (для saga pattern)
        if (currentNode.type === 'action' || currentNode.type === 'agent') {
          state.compensationStack.push(currentNode.id);
        }

        // Находим следующие переходы с учетом условий и типа узла
        const routingOutputs = getRoutingOutputs(
          currentNode,
          workflowGraph,
          result.outputs,
          id => state.nodeResults.get(id)?.outputs as Record<string, unknown> | undefined
        );
        const nextEdges = findNextEdges(currentNode, workflowGraph, routingOutputs);

        if (nextEdges.length === 0) {
          state.completed = true;
          void this.auditService?.logScenarioCompleted({
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            userId: context.userId,
            traceId: context.traceId,
            spanId: context.spanId,
          });
          const durationMs = Date.now() - context.startedAt.getTime();
          const nodesCompleted = [...state.nodeResults.values()].filter(
            r => r.state === NodeExecutionState.COMPLETED,
          ).length;
          void dispatchWebhooks('execution.completed', {
            executionId: context.executionId,
            scenarioId: context.scenarioId,
            status: 'completed',
            tenantId: context.tenantId ?? 'default',
            duration: durationMs,
            cost: state.executionSpendUsd,
            nodesCompleted,
          });
          return;
        }

        if (nextEdges.some(edge => edge.to === 'end')) {
          state.completed = true;
          state.currentNodeId = 'end';
          void this.auditService?.logScenarioCompleted({
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            userId: context.userId,
            traceId: context.traceId,
            spanId: context.spanId,
          });
          const durationMsEnd = Date.now() - context.startedAt.getTime();
          const nodesCompletedEnd = [...state.nodeResults.values()].filter(
            r => r.state === NodeExecutionState.COMPLETED,
          ).length;
          void dispatchWebhooks('execution.completed', {
            executionId: context.executionId,
            scenarioId: context.scenarioId,
            status: 'completed',
            tenantId: context.tenantId ?? 'default',
            duration: durationMsEnd,
            cost: state.executionSpendUsd,
            nodesCompleted: nodesCompletedEnd,
          });
          return;
        }

        // Для parallel выполняем все ветки последовательно в рамках in-memory исполнения
        for (const edge of nextEdges) {
          state.currentNodeId = edge.to;
          await this.executeWorkflow(context, state);

          if (state.failed || state.completed) {
            return;
          }
        }
      } else {
        // Узел завершился с ошибкой - запускаем компенсацию
        await this.compensate(context, state);
        state.failed = true;
        state.error = {
          code: 'NODE_EXECUTION_FAILED',
          message: result.error?.message || 'Node execution failed'
        };
        void this.auditService?.logScenarioFailed({
          scenarioId: context.scenarioId,
          executionId: context.executionId,
          userId: context.userId,
          errorCode: state.error.code,
          errorMessage: state.error.message,
          traceId: context.traceId,
          spanId: context.spanId,
        });
        void dispatchWebhooks('execution.failed', {
          executionId: context.executionId,
          scenarioId: context.scenarioId,
          error: state.error.message,
          tenantId: context.tenantId ?? 'default',
          failedNode: state.currentNodeId,
        });
      }
    } catch (error) {
      // Критическая ошибка - запускаем компенсацию
      await this.compensate(context, state);
      state.failed = true;
      state.error = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      
      void this.auditService?.logScenarioFailed({
        scenarioId: context.scenarioId,
        executionId: context.executionId,
        userId: context.userId,
        errorCode: state.error?.code,
        errorMessage: state.error?.message,
        traceId: context.traceId,
        spanId: context.spanId,
      });
      void dispatchWebhooks('execution.failed', {
        executionId: context.executionId,
        scenarioId: context.scenarioId,
        error: state.error?.message ?? 'Unknown error',
        tenantId: context.tenantId ?? 'default',
        failedNode: state.currentNodeId,
      });

      // Обновляем статус выполнения в БД
      if (this.executionRepository) {
        try {
          await this.executionRepository.updateStatus(
            context.executionId,
            {
              status: 'failed',
              errorMessage: state.error?.message,
              errorCode: state.error?.code
            },
            state.tenantId ?? context.tenantId ?? 'default'
          );
        } catch (dbError) {
          console.warn(`[Orchestrator] Failed to update execution status in DB:`, dbError);
        }
      }
    }
  }

  /**
   * Выполнение узла workflow
   */
  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    state: WorkflowExecutionState
  ): Promise<NodeExecutionResult> {
    const result: NodeExecutionResult = {
      nodeId: node.id,
      state: NodeExecutionState.RUNNING,
      startedAt: new Date(),
      retryCount: 0
    };

    // Создаем запись выполнения узла в БД, если репозиторий доступен
    if (this.nodeExecutionRepository) {
      try {
        await this.nodeExecutionRepository.create({
          executionId: context.executionId,
          nodeId: node.id,
          input: this.getPreviousNodeOutputs(node.id, state, context.workflowGraph),
          tenantId: state.tenantId ?? context.tenantId ?? 'default'
        });
      } catch (error) {
        console.warn(`[Orchestrator] Failed to save node execution to DB:`, error);
      }
    }

    // Обработка разных типов узлов
    switch (node.type) {
      case 'start':
        result.state = NodeExecutionState.COMPLETED;
        result.completedAt = new Date();
        return result;

      case 'action':
        if (!node.toolId) {
          result.state = NodeExecutionState.FAILED;
          result.error = {
            code: 'MISSING_TOOL_ID',
            message: 'Action node missing toolId'
          };
          result.completedAt = new Date();
          return result;
        }

        // Выполнение действия через gateway
        return await this.executeAction(node, context, state, result);

      case 'agent':
        // Выполнение агента через Agent Runtime
        if (!this.agentRuntime) {
          result.state = NodeExecutionState.FAILED;
          result.error = {
            code: 'AGENT_RUNTIME_NOT_AVAILABLE',
            message: 'Agent Runtime is not configured'
          };
          result.completedAt = new Date();
          return result;
        }
        return await this.executeAgentNode(node, context, state, result);

      case 'end':
        result.state = NodeExecutionState.COMPLETED;
        result.completedAt = new Date();
        return result;

      default:
        result.state = NodeExecutionState.COMPLETED;
        result.completedAt = new Date();
        return result;
    }
  }

  /**
   * Выполнение действия через Tool Gateway
   */
  private async executeAction(
    node: WorkflowNode,
    context: ExecutionContext,
    state: WorkflowExecutionState,
    result: NodeExecutionResult
  ): Promise<NodeExecutionResult> {
    const toolId = node.toolId;
    const tool = toolId && this.registry ? this.registry.get(toolId) : undefined;

    if (!toolId || !tool) {
      result.state = NodeExecutionState.FAILED;
      result.error = {
        code: 'TOOL_NOT_REGISTERED',
        message: `Tool ${toolId || 'unknown'} is not registered`
      };
      result.completedAt = new Date();
      return result;
    }

    const maxRetries = node.retry?.maxAttempts || 3;
    const initialDelay = node.retry?.initialDelay || 1000;
    const meterTid = state.tenantId ?? context.tenantId ?? 'default';
    const meterOrg = context.orgId ?? (await resolveOrgIdForTenant(meterTid));

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      result.retryCount = attempt;

      try {
        // Создание контекста запроса
        const spendBefore = state.executionSpendUsd ?? 0;
        const requestContext: ToolRequestContext = {
          scenarioId: context.scenarioId,
          executionId: context.executionId,
          userId: context.userId,
          userRoles: context.userRoles,
          traceId: context.traceId,
          spanId: context.spanId,
          deploymentLane: context.deploymentLane,
          shadowToolStub: context.isShadowRun === true,
          executionSpendUsd: spendBefore > 0 ? spendBefore : undefined,
          tenantId: meterTid,
          orgId: context.orgId,
          mockToolConfig: context.spec.mockToolConfig,
        };

        const fromPrevious =
          this.getPreviousNodeOutputs(node.id, state, context.workflowGraph) ?? {};
        const cfgInputs = node.config?.inputs;
        const inputs: Record<string, unknown> =
          cfgInputs && typeof cfgInputs === 'object' && !Array.isArray(cfgInputs)
            ? { ...fromPrevious, ...(cfgInputs as Record<string, unknown>) }
            : fromPrevious;

        const request: ToolRequest = {
          toolId,
          inputs,
          context: requestContext
        };

        // Выполнение через gateway
        const response = await this.gateway.execute(request, tool);
        try {
          getUsageMeter().track(meterOrg, meterTid, 'tool_calls', 1);
        } catch (_) {
          /* best-effort */
        }

        if (response.success) {
          state.executionSpendUsd = spendBefore + estimateToolCallCostUsd(tool);
          result.state = NodeExecutionState.COMPLETED;
          result.outputs = response.outputs;
          result.completedAt = new Date();
          void dispatchWebhooks('node.completed', {
            executionId: context.executionId,
            nodeId: node.id,
            scenarioId: context.scenarioId,
            toolId: toolId!,
            output: response.outputs ?? null,
          });
          return result;
        } else {
          // Если не последняя попытка, ждем перед повтором
          if (attempt < maxRetries - 1) {
            const delay = this.calculateBackoff(initialDelay, attempt, node.retry?.backoff);
            await this.sleep(delay);
          }
        }
      } catch (error) {
        // Если не последняя попытка, ждем перед повтором
        if (attempt < maxRetries - 1) {
          const delay = this.calculateBackoff(initialDelay, attempt, node.retry?.backoff);
          await this.sleep(delay);
        }
      }
    }

    // Все попытки исчерпаны
    result.state = NodeExecutionState.FAILED;
    result.error = {
      code: 'MAX_RETRIES_EXCEEDED',
      message: `Failed after ${maxRetries} attempts`
    };
    result.completedAt = new Date();
    return result;
  }

  /**
   * Выполнение агента через Agent Runtime
   */
  private async executeAgentNode(
    node: WorkflowNode,
    context: ExecutionContext,
    state: WorkflowExecutionState,
    result: NodeExecutionResult
  ): Promise<NodeExecutionResult> {
    const maxRetries = node.retry?.maxAttempts || 1; // Агенты обычно не требуют retry
    const initialDelay = node.retry?.initialDelay || 1000;
    const agentMeterTid = state.tenantId ?? context.tenantId ?? 'default';
    const agentMeterOrg = context.orgId ?? (await resolveOrgIdForTenant(agentMeterTid));

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      result.retryCount = attempt;

      try {
        if (!this.agentRuntime) {
          throw new Error('Agent Runtime not available');
        }

        // Получаем userIntent из конфигурации узла или из предыдущих узлов
        let userIntent = node.agentConfig?.userIntent;
        
        // Если userIntent не указан, пытаемся получить из предыдущих узлов
        if (!userIntent) {
          // Ищем последний узел с outputs
          const previousOutputs = this.getPreviousNodeOutputs(node.id, state, context.workflowGraph);
          if (previousOutputs && typeof previousOutputs === 'object') {
            // Пытаемся извлечь intent из outputs предыдущих узлов
            userIntent = (previousOutputs as any).intent || 
                        (previousOutputs as any).query || 
                        (previousOutputs as any).message ||
                        JSON.stringify(previousOutputs);
          } else {
            userIntent = 'Process the request';
          }
        }

        // Получаем доступные инструменты из spec или из конфигурации узла
        const allowedToolIds = node.agentConfig?.allowedTools || 
                              context.spec.allowedActions?.map(a => a.id) || 
                              [];
        
        // Получаем инструменты из registry
        let availableTools: RegisteredTool[] = [];
        if (this.registry) {
          if (allowedToolIds.length > 0) {
            // Фильтруем по allowedToolIds
            availableTools = this.registry.getAll().filter(tool => allowedToolIds.includes(tool.id));
          } else {
            // Используем все доступные инструменты из spec
            const specToolIds = context.spec.allowedActions?.map(a => a.id) || [];
            availableTools = this.registry.getAll().filter(tool => specToolIds.includes(tool.id));
          }
        }

        // Создаем контекст выполнения агента
        const agentContext: AgentExecutionContext = {
          scenarioId: context.scenarioId,
          executionId: context.executionId,
          userId: context.userId,
          userRoles: context.userRoles,
          scenarioSpec: context.spec,
          availableTools,
          userIntent: userIntent || 'Execute agent step',
          traceId: context.traceId,
          spanId: context.spanId,
          deploymentLane: context.deploymentLane,
          shadowToolStub: context.isShadowRun === true,
          executionSpendUsd: state.executionSpendUsd ?? 0,
          tenantId: agentMeterTid,
          orgId: context.orgId,
        };

        // Выполняем агента
        const agentResult = await this.agentRuntime.execute(agentContext);
        state.executionSpendUsd = agentContext.executionSpendUsd ?? state.executionSpendUsd ?? 0;

        try {
          const meter = getUsageMeter();
          meter.track(agentMeterOrg, agentMeterTid, 'agent_calls', 1);
          if (agentResult.totalTokens > 0) {
            meter.track(agentMeterOrg, agentMeterTid, 'llm_tokens', agentResult.totalTokens);
          }
        } catch (_) {
          /* best-effort */
        }

        if (agentResult.success) {
          result.state = NodeExecutionState.COMPLETED;
          result.outputs = {
            output: agentResult.output,
            toolCallsExecuted: agentResult.toolCallsExecuted,
            totalTokens: agentResult.totalTokens
          };
          result.completedAt = new Date();
          return result;
        } else {
          result.state = NodeExecutionState.FAILED;
          result.error = {
            code: agentResult.error?.code || 'AGENT_EXECUTION_FAILED',
            message: agentResult.error?.message || 'Agent execution failed',
            details: agentResult.error
          };
          result.completedAt = new Date();
          
          // Если не последняя попытка, ждем перед повтором
          if (attempt < maxRetries - 1) {
            const delay = this.calculateBackoff(initialDelay, attempt, node.retry?.backoff);
            await this.sleep(delay);
          }
        }
      } catch (error) {
        result.state = NodeExecutionState.FAILED;
        result.error = {
          code: 'AGENT_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown agent execution error',
          details: error
        };
        result.completedAt = new Date();
        
        // Если не последняя попытка, ждем перед повтором
        if (attempt < maxRetries - 1) {
          const delay = this.calculateBackoff(initialDelay, attempt, node.retry?.backoff);
          await this.sleep(delay);
        }
      }
    }

    // Все попытки исчерпаны
    return result;
  }

  /**
   * Получение outputs предыдущих узлов
   */
  private getPreviousNodeOutputs(
    currentNodeId: string,
    state: WorkflowExecutionState,
    graph?: WorkflowGraph
  ): Record<string, unknown> | null {
    if (!graph) {
      const lastResultWithOutput = Array.from(state.nodeResults.values())
        .reverse()
        .find(nodeResult => nodeResult.outputs && nodeResult.nodeId !== currentNodeId);
      return (lastResultWithOutput?.outputs as Record<string, unknown>) || null;
    }

    const merged = collectIncomingOutputs(currentNodeId, graph, from =>
      state.nodeResults.get(from)?.outputs as Record<string, unknown> | undefined
    );
    return Object.keys(merged).length > 0 ? merged : null;
  }

  /**
   * Вычисление задержки для retry
   */
  private calculateBackoff(
    initialDelay: number,
    attempt: number,
    backoffType?: 'exponential' | 'linear' | 'fixed'
  ): number {
    switch (backoffType) {
      case 'exponential':
        return initialDelay * Math.pow(2, attempt);
      case 'linear':
        return initialDelay * (attempt + 1);
      case 'fixed':
      default:
        return initialDelay;
    }
  }

  /**
   * Задержка выполнения
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Компенсация (Saga pattern)
   */
  private async compensate(
    context: ExecutionContext,
    state: WorkflowExecutionState
  ): Promise<void> {
    // Выполняем компенсацию в обратном порядке
    while (state.compensationStack.length > 0) {
      const nodeId = state.compensationStack.pop()!;
      const node = context.workflowGraph.nodes.find(n => n.id === nodeId);

      if (node && node.type === 'action') {
        // В реальной системе здесь будет вызов компенсирующего действия
        // Для примера просто записываем событие
        await this.recordEvent({
          type: 'compensation',
          executionId: context.executionId,
          nodeId,
          timestamp: new Date()
        });

        const result: NodeExecutionResult = {
          nodeId: `${nodeId}_compensation`,
          state: NodeExecutionState.COMPENSATED,
          startedAt: new Date(),
          completedAt: new Date(),
          retryCount: 0
        };

        state.nodeResults.set(result.nodeId, result);
      }
    }
  }

  /**
   * Запись события в историю и публикация в Event Bus
   */
  private async recordEvent(event: WorkflowEvent): Promise<void> {
    // Сохраняем в локальную историю
    const history = this.eventHistory.get(event.executionId) || [];
    history.push(event);
    this.eventHistory.set(event.executionId, history);

    if (this.executionRepository) {
      try {
        const tenantId =
          this.executionStates.get(event.executionId)?.tenantId ??
          this.temporalLaunchContexts.get(event.executionId)?.tenantId ??
          'default';
        await this.executionRepository.addEventForPublicExecution(event.executionId, tenantId, {
          type: event.type,
          nodeId: event.nodeId,
          data: event.data,
          timestamp: event.timestamp
        });
      } catch (err) {
        console.warn('[Orchestrator] Failed to persist execution event to DB:', err);
      }
    }

    // Публикуем в Event Bus, если он настроен
    if (this.eventBus && this.eventBus.isConnected()) {
      try {
        const baseEvent: BaseEvent = createEvent(
          `workflow.${event.type}`,
          {
            executionId: event.executionId,
            nodeId: event.nodeId,
            data: event.data
          },
          event.executionId // correlationId = executionId для отслеживания цепочки событий одного выполнения
        );

        await this.eventBus.publish(baseEvent, {
          topic: `scenario.${event.executionId.split('-')[0]}.events`, // Используем префикс executionId для топика
          key: event.executionId, // Партиционируем по executionId для гарантии порядка
          idempotencyKey: `${event.executionId}-${event.type}-${event.nodeId || 'global'}-${event.timestamp.getTime()}`
        });
      } catch (error) {
        console.error(`[Orchestrator] Failed to publish event to Event Bus:`, error);
        // Не прерываем выполнение, если публикация в Event Bus не удалась
      }
    }
  }

  /**
   * Получение состояния выполнения
   */
  getExecutionState(executionId: string): WorkflowExecutionState | undefined {
    return this.executionStates.get(executionId);
  }

  /**
   * Получение истории событий
   */
  getEventHistory(executionId: string): WorkflowEvent[] {
    return this.eventHistory.get(executionId) || [];
  }

  /**
   * Восстановление выполнения после сбоя (на основе истории событий)
   */
  async recoverExecution(
    context: ExecutionContext,
    eventHistory: WorkflowEvent[]
  ): Promise<void> {
    const ctx = this.enrichExecutionContext(context);
    const state: WorkflowExecutionState = {
      executionId: ctx.executionId,
      currentNodeId: 'start',
      nodeResults: new Map(),
      compensationStack: [],
      completed: false,
      failed: false,
      deploymentLane: ctx.deploymentLane,
      deploymentStrategy: ctx.deploymentDescriptor?.strategy,
      tenantId: ctx.tenantId ?? 'default'
    };

    // Восстанавливаем состояние узлов из истории
    for (const event of eventHistory) {
      if (event.type === 'node_completed' && event.nodeId) {
        const result: NodeExecutionResult = {
          nodeId: event.nodeId,
          state: NodeExecutionState.COMPLETED,
          startedAt: event.timestamp,
          completedAt: event.timestamp,
          outputs: event.data,
          retryCount: 0
        };
        state.nodeResults.set(event.nodeId, result);
        state.currentNodeId = event.nodeId;
      }
    }

    this.executionStates.set(ctx.executionId, state);
    this.eventHistory.set(ctx.executionId, eventHistory);

    await this.executeWorkflow(ctx, state);
  }
}
