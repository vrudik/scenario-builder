/**
 * Сервис аудита
 * Единая точка записи событий для Orchestrator, AgentRuntime, ToolGateway, EvalRunner
 */

import { AuditRepository } from './audit-repository';
import {
  AuditAction,
  AuditOutcome,
  AuditSeverity,
  type AuditEventInput,
  type AuditActionType,
  type AuditOutcomeType,
} from './audit-types';
import { getLogger } from '../observability/logger';

const logger = getLogger({ serviceName: 'audit' });

export class AuditService {
  private repository: AuditRepository | null;

  constructor(repository?: AuditRepository) {
    this.repository = repository ?? null;
  }

  /**
   * Установить репозиторий (например, после инициализации БД)
   */
  setRepository(repository: AuditRepository): void {
    this.repository = repository;
  }

  /**
   * Записать событие
   */
  async log(event: AuditEventInput): Promise<void> {
    if (!this.repository) {
      logger.debug('Audit skipped (no repository)', { action: event.action, resource: event.resource });
      return;
    }
    try {
      await this.repository.append(event);
    } catch (error) {
      logger.error('Audit write failed', error, { action: event.action });
    }
  }

  /**
   * Сценарий: старт
   */
  async logScenarioStarted(params: {
    scenarioId: string;
    executionId: string;
    userId?: string;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.SCENARIO_STARTED,
      actor: params.userId,
      resource: params.executionId,
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.INFO,
      message: `Scenario ${params.scenarioId} started`,
      details: { scenarioId: params.scenarioId, executionId: params.executionId },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Сценарий: завершён успешно
   */
  async logScenarioCompleted(params: {
    scenarioId: string;
    executionId: string;
    userId?: string;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.SCENARIO_COMPLETED,
      actor: params.userId,
      resource: params.executionId,
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.INFO,
      message: `Scenario ${params.scenarioId} completed`,
      details: { scenarioId: params.scenarioId, executionId: params.executionId },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Сценарий: ошибка
   */
  async logScenarioFailed(params: {
    scenarioId: string;
    executionId: string;
    userId?: string;
    errorCode?: string;
    errorMessage?: string;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.SCENARIO_FAILED,
      actor: params.userId,
      resource: params.executionId,
      outcome: AuditOutcome.FAILURE,
      severity: AuditSeverity.ERROR,
      message: params.errorMessage ?? `Scenario ${params.scenarioId} failed`,
      details: {
        scenarioId: params.scenarioId,
        executionId: params.executionId,
        errorCode: params.errorCode,
      },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Узел workflow: старт/завершение/ошибка
   */
  async logNodeEvent(params: {
    action: 'node_started' | 'node_completed' | 'node_failed';
    executionId: string;
    nodeId: string;
    outcome?: AuditOutcomeType;
    message?: string;
    details?: Record<string, unknown>;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    const actionMap = {
      node_started: AuditAction.NODE_STARTED,
      node_completed: AuditAction.NODE_COMPLETED,
      node_failed: AuditAction.NODE_FAILED,
    };
    await this.log({
      action: actionMap[params.action] as AuditActionType,
      resource: params.executionId,
      outcome: params.outcome ?? (params.action === 'node_failed' ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS),
      severity: params.action === 'node_failed' ? AuditSeverity.ERROR : AuditSeverity.INFO,
      message: params.message,
      details: { nodeId: params.nodeId, ...params.details },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Агент: старт выполнения
   */
  async logAgentStarted(params: {
    scenarioId: string;
    executionId: string;
    userId?: string;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.AGENT_EXECUTION_STARTED,
      actor: params.userId,
      resource: params.executionId,
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.INFO,
      message: `Agent execution started`,
      details: { scenarioId: params.scenarioId, executionId: params.executionId },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Агент: завершён успешно / с ошибкой
   */
  async logAgentCompleted(params: {
    scenarioId: string;
    executionId: string;
    userId?: string;
    success: boolean;
    toolCallsExecuted?: number;
    totalTokens?: number;
    errorCode?: string;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: params.success ? AuditAction.AGENT_EXECUTION_COMPLETED : AuditAction.AGENT_EXECUTION_FAILED,
      actor: params.userId,
      resource: params.executionId,
      outcome: params.success ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      severity: params.success ? AuditSeverity.INFO : AuditSeverity.ERROR,
      message: params.success ? 'Agent execution completed' : `Agent failed: ${params.errorCode ?? 'unknown'}`,
      details: {
        scenarioId: params.scenarioId,
        executionId: params.executionId,
        toolCallsExecuted: params.toolCallsExecuted,
        totalTokens: params.totalTokens,
        errorCode: params.errorCode,
      },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Guardrail: блокировка промпта / вывода / tool call
   */
  async logGuardrailBlocked(params: {
    kind: 'prompt' | 'output' | 'tool';
    reason?: string;
    riskType?: string;
    scenarioId?: string;
    executionId?: string;
    toolId?: string;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    const actionMap = {
      prompt: AuditAction.GUARDRAIL_PROMPT_BLOCKED,
      output: AuditAction.GUARDRAIL_OUTPUT_BLOCKED,
      tool: AuditAction.GUARDRAIL_TOOL_BLOCKED,
    };
    await this.log({
      action: actionMap[params.kind] as AuditActionType,
      resource: params.executionId ?? params.toolId ?? undefined,
      outcome: AuditOutcome.BLOCKED,
      severity: AuditSeverity.WARNING,
      message: params.reason ?? `${params.kind} blocked by guardrails`,
      details: {
        kind: params.kind,
        riskType: params.riskType,
        scenarioId: params.scenarioId,
        executionId: params.executionId,
        toolId: params.toolId,
      },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Tool: вызов разрешён / отклонён / ошибка
   */
  async logToolCall(params: {
    action: 'tool_call_started' | 'tool_call_completed' | 'tool_call_denied' | 'tool_call_failed';
    toolId: string;
    executionId: string;
    scenarioId: string;
    userId?: string;
    outcome?: AuditOutcomeType;
    message?: string;
    details?: Record<string, unknown>;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    const actionMap = {
      tool_call_started: AuditAction.TOOL_CALL_STARTED,
      tool_call_completed: AuditAction.TOOL_CALL_COMPLETED,
      tool_call_denied: AuditAction.TOOL_CALL_DENIED,
      tool_call_failed: AuditAction.TOOL_CALL_FAILED,
    };
    await this.log({
      action: actionMap[params.action] as AuditActionType,
      actor: params.userId,
      resource: params.toolId,
      outcome: params.outcome ?? (params.action === 'tool_call_denied' || params.action === 'tool_call_failed' ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS),
      severity: params.action === 'tool_call_denied' ? AuditSeverity.WARNING : params.action === 'tool_call_failed' ? AuditSeverity.ERROR : AuditSeverity.INFO,
      message: params.message,
      details: {
        executionId: params.executionId,
        scenarioId: params.scenarioId,
        toolId: params.toolId,
        ...params.details,
      },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  /**
   * Eval: кейс / сьют завершён
   */
  async logEvalCase(params: {
    caseId: string;
    passed: boolean;
    expectedResult: string;
    actualResult: string;
    duration?: number;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.EVAL_CASE_COMPLETED,
      resource: params.caseId,
      outcome: params.passed ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      severity: params.passed ? AuditSeverity.INFO : AuditSeverity.WARNING,
      message: `Eval case ${params.caseId}: ${params.actualResult} (expected ${params.expectedResult})`,
      details: {
        caseId: params.caseId,
        passed: params.passed,
        expectedResult: params.expectedResult,
        actualResult: params.actualResult,
        duration: params.duration,
      },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }

  async logEvalSuite(params: {
    suiteId: string;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    duration: number;
    traceId?: string;
    spanId?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.EVAL_SUITE_COMPLETED,
      resource: params.suiteId,
      outcome: params.failedCases === 0 ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      severity: params.failedCases === 0 ? AuditSeverity.INFO : AuditSeverity.WARNING,
      message: `Eval suite: ${params.passedCases}/${params.totalCases} passed`,
      details: {
        suiteId: params.suiteId,
        totalCases: params.totalCases,
        passedCases: params.passedCases,
        failedCases: params.failedCases,
        duration: params.duration,
      },
      traceId: params.traceId,
      spanId: params.spanId,
    });
  }
}
