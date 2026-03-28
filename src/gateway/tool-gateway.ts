/**
 * Tool Gateway
 * 
 * Обязан:
 * - применять политики доступа (least privilege, object-level checks)
 * - логировать вход/выход, коррелировать с trace/span
 * - обеспечивать rate limiting и circuit breaking
 * - поддерживать sandbox/stub режим для симуляций и shadow
 */

import { RegisteredTool } from '../registry';
import { ExecutionPolicy } from '../builder';
import type { AuditService } from '../audit/audit-service';
import { evaluateLocalToolAccess } from '../policy/local-tool-policy';
import type { OpaHttpClient } from '../policy/opa-http-client';
import { redactOpaScenarioInput } from './opa-input-pii';
import { systemMetrics } from '../observability/metrics';

function prometheusDeploymentLane(lane?: string): 'stable' | 'canary' | 'unset' {
  if (lane === 'stable' || lane === 'canary') {
    return lane;
  }
  return 'unset';
}

/**
 * Контекст запроса к инструменту
 */
export interface ToolRequestContext {
  scenarioId: string;
  executionId: string;
  userId: string;
  userRoles: string[];
  traceId?: string;
  spanId?: string;
  idempotencyKey?: string;
  /** Полоса деплоя (canary / stable) для метрик и аудита */
  deploymentLane?: string;
  /** Проброс в OPA input.cost_guard_exceeded (рантайм cost-manager / оркестратор) */
  costGuardExceeded?: boolean;
  /** Токены уже израсходованы в этом execution (OPA: сравнение с tokenLimits.maxPerExecution) */
  tokensUsedSoFar?: number;
  /** Фактические затраты в USD за выполнение, если рантайм их считает (OPA vs costLimits.maxPerExecution) */
  executionSpendUsd?: number;
  /**
   * Shadow-canary прогон: после политик не вызывать реальный executor (как sandbox), только метрики/аудит.
   */
  shadowToolStub?: boolean;
  /** Тенант API (как X-Tenant-ID); в OPA input как tenantId для правил по организации */
  tenantId?: string;
  /** Organization ID for OPA policy evaluation */
  orgId?: string;
  /** Deployment environment (e.g. 'production', 'staging', 'development') */
  environment?: string;
}

/**
 * Запрос к инструменту
 */
export interface ToolRequest {
  toolId: string;
  inputs: Record<string, unknown>;
  context: ToolRequestContext;
}

/**
 * Ответ от инструмента
 */
export interface ToolResponse {
  success: boolean;
  outputs?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    latency: number;
    timestamp: string;
    traceId?: string;
    spanId?: string;
  };
}

/**
 * Статус circuit breaker
 */
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

/**
 * Circuit breaker для инструмента
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime?: Date;
  private readonly failureThreshold: number;
  private readonly timeout: number; // в миллисекундах

  constructor(failureThreshold: number = 5, timeout: number = 60000) {
    this.failureThreshold = failureThreshold;
    this.timeout = timeout;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.failures >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  canAttempt(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Проверяем, прошло ли достаточно времени для попытки восстановления
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime.getTime() > this.timeout
      ) {
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }

    // HALF_OPEN - разрешаем одну попытку
    return true;
  }

  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Rate limiter
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowSize: number; // в миллисекундах
  private readonly maxRequests: number;

  constructor(maxRequests: number, windowSizeMs: number) {
    this.maxRequests = maxRequests;
    this.windowSize = windowSizeMs;
  }

  canProceed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Удаляем старые запросы вне окна
    const recentRequests = requests.filter(
      time => now - time < this.windowSize
    );

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }
}

/**
 * Tool Gateway
 */
export class ToolGateway {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private policy?: ExecutionPolicy;
  private sandboxMode: boolean = false;
  private toolExecutors: Map<string, (req: ToolRequest) => Promise<ToolResponse>> = new Map();
  private auditService?: AuditService;
  private opaClient?: OpaHttpClient;

  /**
   * Установка политики исполнения
   */
  setPolicy(policy: ExecutionPolicy): void {
    this.policy = policy;
  }

  /**
   * OPA Data API (например opa run --server). Правило: package scenario, boolean allow.
   */
  setOpaClient(client: OpaHttpClient | undefined): void {
    this.opaClient = client;
  }

  /**
   * Установка сервиса аудита для логирования вызовов инструментов
   */
  setAuditService(service: AuditService): void {
    this.auditService = service;
  }

  /**
   * Включение/выключение sandbox режима
   */
  setSandboxMode(enabled: boolean): void {
    this.sandboxMode = enabled;
  }

  /**
   * Регистрация инструмента с executor функцией
   */
  registerTool(
    toolId: string,
    _tool: RegisteredTool,
    executor: (req: ToolRequest) => Promise<ToolResponse>
  ): void {
    this.toolExecutors.set(toolId, executor);
  }

  /**
   * Получение executor для инструмента
   */
  private getExecutor(toolId: string): ((req: ToolRequest) => Promise<ToolResponse>) | undefined {
    return this.toolExecutors.get(toolId);
  }

  /**
   * Выполнение запроса к инструменту
   */
  async execute(
    request: ToolRequest,
    tool: RegisteredTool,
    executor?: (req: ToolRequest) => Promise<ToolResponse>
  ): Promise<ToolResponse> {
    const startTime = Date.now();

    // Если executor не передан, пытаемся получить из зарегистрированных
    if (!executor) {
      executor = this.getExecutor(tool.id);
      if (!executor) {
        const latency = Date.now() - startTime;
        return {
          success: false,
          error: {
            code: 'EXECUTOR_NOT_FOUND',
            message: `No executor registered for tool: ${tool.id}`
          },
          metadata: {
            latency,
            timestamp: new Date().toISOString(),
            traceId: request.context.traceId,
            spanId: request.context.spanId
          }
        };
      }
    }

    // Проверка политики доступа (локальная ExecutionPolicy + опционально OPA)
    if (!(await this.resolvePolicyAccess(request, tool))) {
      void this.auditService?.logToolCall({
        action: 'tool_call_denied',
        toolId: request.toolId,
        executionId: request.context.executionId,
        scenarioId: request.context.scenarioId,
        userId: request.context.userId,
        outcome: 'failure',
        message: 'Access denied by policy',
        traceId: request.context.traceId,
        spanId: request.context.spanId,
        details: request.context.deploymentLane
          ? { deploymentLane: request.context.deploymentLane }
          : undefined
      });
      return {
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied by policy'
        },
        metadata: {
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          traceId: request.context.traceId,
          spanId: request.context.spanId
        }
      };
    }

    // Проверка rate limiting
    if (!this.checkRateLimit(request.toolId, request.context.userId)) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded'
        },
        metadata: {
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          traceId: request.context.traceId,
          spanId: request.context.spanId
        }
      };
    }

    // Проверка circuit breaker
    const circuitBreaker = this.getCircuitBreaker(request.toolId);
    if (!circuitBreaker.canAttempt()) {
      return {
        success: false,
        error: {
          code: 'CIRCUIT_OPEN',
          message: 'Circuit breaker is open'
        },
        metadata: {
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          traceId: request.context.traceId,
          spanId: request.context.spanId
        }
      };
    }

    // Sandbox / shadow-canary — заглушка без вызова executor
    if (this.sandboxMode || request.context.shadowToolStub) {
      const stubKind = this.sandboxMode ? 'sandbox' : 'shadow_stub';
      void this.auditService?.logToolCall({
        action: 'tool_call_completed',
        toolId: request.toolId,
        executionId: request.context.executionId,
        scenarioId: request.context.scenarioId,
        userId: request.context.userId,
        outcome: 'success',
        message: this.sandboxMode ? 'Sandbox mode' : 'Shadow canary stub',
        traceId: request.context.traceId,
        spanId: request.context.spanId,
        details: request.context.deploymentLane
          ? { deploymentLane: request.context.deploymentLane, [stubKind]: true }
          : { [stubKind]: true }
      });
      return {
        success: true,
        outputs: {},
        metadata: {
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          traceId: request.context.traceId,
          spanId: request.context.spanId
        }
      };
    }

    void this.auditService?.logToolCall({
      action: 'tool_call_started',
      toolId: request.toolId,
      executionId: request.context.executionId,
      scenarioId: request.context.scenarioId,
      userId: request.context.userId,
      traceId: request.context.traceId,
      spanId: request.context.spanId,
      details: request.context.deploymentLane
        ? { deploymentLane: request.context.deploymentLane }
        : undefined
    });

    // Выполнение запроса
    try {
      const response = await executor(request);

      if (response.success) {
        circuitBreaker.recordSuccess();
        void this.auditService?.logToolCall({
          action: 'tool_call_completed',
          toolId: request.toolId,
          executionId: request.context.executionId,
          scenarioId: request.context.scenarioId,
          userId: request.context.userId,
          outcome: 'success',
          details: {
            latency: Date.now() - startTime,
            ...(request.context.deploymentLane
              ? { deploymentLane: request.context.deploymentLane }
              : {})
          },
          traceId: request.context.traceId,
          spanId: request.context.spanId,
        });
      } else {
        circuitBreaker.recordFailure();
        void this.auditService?.logToolCall({
          action: 'tool_call_failed',
          toolId: request.toolId,
          executionId: request.context.executionId,
          scenarioId: request.context.scenarioId,
          userId: request.context.userId,
          outcome: 'failure',
          message: response.error?.message,
          traceId: request.context.traceId,
          spanId: request.context.spanId,
          details: request.context.deploymentLane
            ? { deploymentLane: request.context.deploymentLane }
            : undefined
        });
      }

      return {
        ...response,
        metadata: {
          ...response.metadata,
          latency: Date.now() - startTime,
          traceId: request.context.traceId,
          spanId: request.context.spanId
        }
      };
    } catch (error) {
      circuitBreaker.recordFailure();
      void this.auditService?.logToolCall({
        action: 'tool_call_failed',
        toolId: request.toolId,
        executionId: request.context.executionId,
        scenarioId: request.context.scenarioId,
        userId: request.context.userId,
        outcome: 'failure',
        message: error instanceof Error ? error.message : 'Unknown error',
        traceId: request.context.traceId,
        spanId: request.context.spanId,
        details: request.context.deploymentLane
          ? { deploymentLane: request.context.deploymentLane }
          : undefined
      });
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        },
        metadata: {
          latency: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          traceId: request.context.traceId,
          spanId: request.context.spanId
        }
      };
    }
  }

  private async resolvePolicyAccess(request: ToolRequest, tool: RegisteredTool): Promise<boolean> {
    const localOk = evaluateLocalToolAccess({
      policy: this.policy,
      toolId: tool.id,
      toolAuthorization: {
        requiresApproval: tool.authorization.requiresApproval,
        roles: tool.authorization.roles
      },
      context: {
        userId: request.context.userId,
        userRoles: request.context.userRoles,
        scenarioId: request.context.scenarioId,
        executionId: request.context.executionId,
        deploymentLane: request.context.deploymentLane
      }
    });
    if (!localOk) {
      systemMetrics.gatewayPolicyDenials.add(1, {
        layer: 'local',
        deployment_lane: prometheusDeploymentLane(request.context.deploymentLane)
      });
      return false;
    }
    if (!this.opaClient) {
      return true;
    }
    const opaInput = redactOpaScenarioInput(
      {
        toolId: tool.id,
        tenantId: request.context.tenantId ?? 'default',
        orgId: request.context.orgId ?? null,
        environment: request.context.environment ?? 'production',
        userId: request.context.userId,
        userRoles: request.context.userRoles,
        scenarioId: request.context.scenarioId,
        executionId: request.context.executionId,
        deploymentLane: request.context.deploymentLane,
        allowedTools: this.policy?.allowedTools ?? [],
        forbiddenActions: this.policy?.forbiddenActions ?? [],
        requiresApproval: this.policy?.requiresApproval ?? [],
        scenarioPiiClassification: this.policy?.scenarioPiiClassification,
        scenarioRiskClass: this.policy?.scenarioRiskClass,
        toolRiskClass: tool.riskClass,
        costLimits: this.policy?.costLimits ?? {},
        tokenLimits: this.policy?.tokenLimits ?? {},
        tokensUsedSoFar: request.context.tokensUsedSoFar,
        executionSpendUsd: request.context.executionSpendUsd,
        cost_guard_exceeded: request.context.costGuardExceeded === true,
        canaryAllowedTools: this.policy?.canaryAllowedTools ?? [],
        canaryBlockedToolIds: this.policy?.canaryBlockedToolIds ?? [],
        stableBlockedToolIds: this.policy?.stableBlockedToolIds ?? []
      },
      this.policy?.scenarioPiiClassification
    );
    const lane = prometheusDeploymentLane(request.context.deploymentLane);
    const allowed = await this.opaClient.queryAllow('scenario/allow', opaInput);
    systemMetrics.gatewayOpaDecisions.add(1, {
      result: allowed ? 'allow' : 'deny',
      deployment_lane: lane
    });
    if (!allowed) {
      systemMetrics.gatewayPolicyDenials.add(1, { layer: 'opa', deployment_lane: lane });
    }
    return allowed;
  }

  /**
   * Проверка rate limit
   */
  private checkRateLimit(toolId: string, userId: string): boolean {
    const key = `${toolId}:${userId}`;
    let limiter = this.rateLimiters.get(key);

    if (!limiter) {
      // Создаем новый rate limiter (100 запросов в минуту по умолчанию)
      limiter = new RateLimiter(100, 60000);
      this.rateLimiters.set(key, limiter);
    }

    return limiter.canProceed(key);
  }

  /**
   * Получение или создание circuit breaker для инструмента
   */
  private getCircuitBreaker(toolId: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(toolId);

    if (!breaker) {
      breaker = new CircuitBreaker(5, 60000); // 5 ошибок, 60 секунд timeout
      this.circuitBreakers.set(toolId, breaker);
    }

    return breaker;
  }
}
