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

import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../builder';
import { ScenarioSpec } from '../spec';
import { ToolGateway, ToolRequest, ToolRequestContext } from '../gateway';
import { RegisteredTool, ToolRegistry } from '../registry';
import { AgentRuntime, AgentExecutionContext } from '../agent/agent-runtime';
import { IEventBus, BaseEvent, createEvent } from '../events';
import { ExecutionRepository, NodeExecutionRepository } from '../db/repositories';
import { TemporalClient } from './temporal-client';
import type { AuditService } from '../audit/audit-service';

/**
 * Контекст выполнения сценария
 */
export interface ExecutionContext {
  scenarioId: string;
  executionId: string;
  workflowGraph: WorkflowGraph;
  spec: ScenarioSpec;
  userId: string;
  userRoles: string[];
  traceId: string;
  spanId: string;
  startedAt: Date;
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
    // Если Temporal доступен, используем его для durable execution
    if (this.useTemporal && this.temporalClient) {
      return await this.startTemporalExecution(context);
    }
    
    // Иначе используем обычное выполнение (in-memory)
    return await this.startInMemoryExecution(context);
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
        });
      } catch (error) {
        console.warn(`[Orchestrator] Failed to save execution to DB:`, error);
      }
    }

    // Запуск workflow через Temporal
    try {
      await this.temporalClient!.startScenarioWorkflow(
        executionId,
        context.workflowGraph,
        context.spec,
        {
          executionId: context.executionId,
          scenarioId: context.scenarioId,
          userId: context.userId,
          userRoles: context.userRoles,
          traceId: context.traceId,
          spanId: context.spanId,
          input: {},
        }
      );

      // Публикация события запуска
      if (this.eventBus) {
        await this.eventBus.publish(
          createEvent(
            'scenario.started',
            {
              executionId,
              scenarioId: context.scenarioId,
              userId: context.userId,
            },
            context.executionId
          ),
          { topic: 'scenario-execution' }
        );
      }

      return executionId;
    } catch (error) {
      console.error(`[Orchestrator] Failed to start Temporal workflow:`, error);
      // Fallback на in-memory выполнение
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
      failed: false
    };

    this.executionStates.set(executionId, executionState);
    this.eventHistory.set(executionId, []);

    // Запись события запуска
    await this.recordEvent({
      type: 'trigger',
      executionId,
      timestamp: new Date()
    });

    void this.auditService?.logScenarioStarted({
      scenarioId: context.scenarioId,
      executionId: context.executionId,
      userId: context.userId,
      traceId: context.traceId,
      spanId: context.spanId,
    });

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

      // Запись события
      await this.recordEvent({
        type: result.state === NodeExecutionState.COMPLETED ? 'node_completed' : 'node_failed',
        executionId: context.executionId,
        nodeId: currentNode.id,
        data: result.outputs,
        timestamp: new Date()
      });

      // Если узел завершился успешно, переходим к следующему
      if (result.state === NodeExecutionState.COMPLETED) {
        // Добавляем узел в стек компенсации (для saga pattern)
        if (currentNode.type === 'action' || currentNode.type === 'agent') {
          state.compensationStack.push(currentNode.id);
        }

        // Находим следующие переходы с учетом условий и типа узла
        const nextEdges = this.findNextEdges(currentNode, workflowGraph, result.outputs);

        if (nextEdges.length === 0) {
          state.completed = true;
          void this.auditService?.logScenarioCompleted({
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            userId: context.userId,
            traceId: context.traceId,
            spanId: context.spanId,
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

      // Обновляем статус выполнения в БД
      if (this.executionRepository) {
        try {
          await this.executionRepository.updateStatus(context.executionId, {
            status: 'failed',
            errorMessage: state.error?.message,
            errorCode: state.error?.code,
          });
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
          input: this.getPreviousNodeOutputs(node.id, state),
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
    _state: WorkflowExecutionState,
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

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      result.retryCount = attempt;

      try {
        // Создание контекста запроса
        const requestContext: ToolRequestContext = {
          scenarioId: context.scenarioId,
          executionId: context.executionId,
          userId: context.userId,
          userRoles: context.userRoles,
          traceId: context.traceId,
          spanId: context.spanId
        };

        // Создание запроса (в реальной системе здесь будет получение inputs из предыдущих узлов)
        const request: ToolRequest = {
          toolId,
          inputs: {}, // TODO: получить из предыдущих узлов
          context: requestContext
        };

        // Выполнение через gateway
        const response = await this.gateway.execute(request, tool);

        if (response.success) {
          result.state = NodeExecutionState.COMPLETED;
          result.outputs = response.outputs;
          result.completedAt = new Date();
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
          spanId: context.spanId
        };

        // Выполняем агента
        const agentResult = await this.agentRuntime.execute(agentContext);

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

    // Находим предыдущий узел через edges
    const incomingEdge = graph.edges.find(e => e.to === currentNodeId);
    if (!incomingEdge) {
      return null;
    }
    
    const previousNodeResult = state.nodeResults.get(incomingEdge.from);
    return (previousNodeResult?.outputs as Record<string, unknown>) || null;
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
   * Поиск следующих переходов в workflow.
   *
   * Поведение:
   * - decision: первый подходящий condition, иначе edge без condition
   * - parallel: все подходящие edges
   * - остальные узлы: первый подходящий edge
   */
  private findNextEdges(
    currentNode: WorkflowNode,
    graph: WorkflowGraph,
    outputs?: Record<string, unknown>
  ): WorkflowEdge[] {
    const outgoingEdges = graph.edges.filter(edge => edge.from === currentNode.id);

    if (outgoingEdges.length === 0) {
      return [];
    }

    const conditionalEdges = outgoingEdges.filter(edge => edge.condition);
    const defaultEdges = outgoingEdges.filter(edge => !edge.condition);

    if (currentNode.type === 'decision') {
      for (const edge of conditionalEdges) {
        if (this.matchesCondition(edge.condition, outputs)) {
          return [edge];
        }
      }

      return defaultEdges.length > 0 ? [defaultEdges[0]] : [];
    }

    if (currentNode.type === 'parallel') {
      const matchedConditional = conditionalEdges.filter(edge => this.matchesCondition(edge.condition, outputs));
      return [...matchedConditional, ...defaultEdges];
    }

    const firstConditional = conditionalEdges.find(edge => this.matchesCondition(edge.condition, outputs));
    if (firstConditional) {
      return [firstConditional];
    }

    return defaultEdges.length > 0 ? [defaultEdges[0]] : [];
  }

  private matchesCondition(
    condition: string | undefined,
    outputs?: Record<string, unknown>
  ): boolean {
    if (!condition) {
      return true;
    }

    const normalized = condition.trim();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }

    const equalsMatch = normalized.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=)\s*(.+)$/);
    if (equalsMatch) {
      const [, field, operator, rawExpected] = equalsMatch;
      const actual = this.getOutputValue(outputs, field);
      const expected = this.parseConditionValue(rawExpected.trim());
      return operator === '==' ? actual === expected : actual !== expected;
    }

    const value = this.getOutputValue(outputs, normalized);
    return Boolean(value);
  }

  private getOutputValue(outputs: Record<string, unknown> | undefined, path: string): unknown {
    if (!outputs) {
      return undefined;
    }

    return path.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in (current as Record<string, unknown>)) {
        return (current as Record<string, unknown>)[segment];
      }

      return undefined;
    }, outputs);
  }

  private parseConditionValue(value: string): unknown {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    if (value === 'null') {
      return null;
    }

    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value !== '') {
      return numeric;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
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
    // Восстанавливаем состояние из истории событий
    const state: WorkflowExecutionState = {
      executionId: context.executionId,
      currentNodeId: 'start',
      nodeResults: new Map(),
      compensationStack: [],
      completed: false,
      failed: false
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

    this.executionStates.set(context.executionId, state);
    this.eventHistory.set(context.executionId, eventHistory);

    // Продолжаем выполнение с последнего успешного узла
    await this.executeWorkflow(context, state);
  }
}
