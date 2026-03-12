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

  /**
   * Установка политики исполнения
   */
  setPolicy(policy: ExecutionPolicy): void {
    this.policy = policy;
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
    tool: RegisteredTool,
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
        return {
          success: false,
          error: {
            code: 'EXECUTOR_NOT_FOUND',
            message: `No executor registered for tool: ${tool.id}`
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

    // Проверка политики доступа
    if (!this.checkAccess(request, tool)) {
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

    // Sandbox режим - возвращаем заглушку
    if (this.sandboxMode) {
      void this.auditService?.logToolCall({
        action: 'tool_call_completed',
        toolId: request.toolId,
        executionId: request.context.executionId,
        scenarioId: request.context.scenarioId,
        userId: request.context.userId,
        outcome: 'success',
        message: 'Sandbox mode',
        traceId: request.context.traceId,
        spanId: request.context.spanId,
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
          details: { latency: Date.now() - startTime },
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

  /**
   * Проверка доступа по политике
   */
  private checkAccess(request: ToolRequest, tool: RegisteredTool): boolean {
    if (!this.policy) {
      return true; // Если политика не установлена, разрешаем
    }

    // Проверка, разрешен ли инструмент
    if (!this.policy.allowedTools.includes(tool.id)) {
      return false;
    }

    // Проверка запрещенных действий
    if (this.policy.forbiddenActions.includes(tool.id)) {
      return false;
    }

    // Проверка требований авторизации
    if (tool.authorization.requiresApproval) {
      if (!this.policy.requiresApproval.includes(tool.id)) {
        // В реальной системе здесь должна быть проверка наличия одобрения
        return false;
      }
    }

    // Проверка ролей пользователя
    const hasRequiredRole = tool.authorization.roles.some(role =>
      request.context.userRoles.includes(role)
    );
    if (tool.authorization.roles.length > 0 && !hasRequiredRole) {
      return false;
    }

    return true;
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
