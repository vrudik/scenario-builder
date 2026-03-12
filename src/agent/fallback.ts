/**
 * Fallback механизм
 * 
 * Деградация на deterministic workflow при:
 * - Нарушении SLO
 * - Росте ошибок
 * - Превышении бюджета токенов
 * - Других критических ситуациях
 */

import { WorkflowGraph, WorkflowNode } from '../builder';
import { ScenarioSpec } from '../spec';

/**
 * Метрики для принятия решения о fallback
 */
export interface FallbackMetrics {
  errorRate: number; // доля ошибок (0-1)
  latency: number; // средняя задержка в мс
  tokenUsage: number; // использовано токенов
  tokenBudget: number; // бюджет токенов
  consecutiveErrors: number; // количество последовательных ошибок
}

/**
 * Решение о fallback
 */
export interface FallbackDecision {
  shouldFallback: boolean;
  reason?: string;
  fallbackWorkflow?: WorkflowGraph;
}

/**
 * Fallback Manager
 */
export class FallbackManager {
  private readonly errorRateThreshold: number = 0.3; // 30% ошибок
  private readonly latencyThreshold: number = 5000; // 5 секунд
  private readonly tokenUsageThreshold: number = 0.9; // 90% бюджета
  private readonly consecutiveErrorsThreshold: number = 3;

  /**
   * Принятие решения о fallback
   */
  shouldFallback(metrics: FallbackMetrics): FallbackDecision {
    const reasons: string[] = [];

    // Проверка error rate
    if (metrics.errorRate >= this.errorRateThreshold) {
      reasons.push(`Error rate ${(metrics.errorRate * 100).toFixed(1)}% exceeds threshold ${(this.errorRateThreshold * 100).toFixed(1)}%`);
    }

    // Проверка latency
    if (metrics.latency >= this.latencyThreshold) {
      reasons.push(`Latency ${metrics.latency}ms exceeds threshold ${this.latencyThreshold}ms`);
    }

    // Проверка token usage
    if (metrics.tokenUsage / metrics.tokenBudget >= this.tokenUsageThreshold) {
      reasons.push(`Token usage ${((metrics.tokenUsage / metrics.tokenBudget) * 100).toFixed(1)}% exceeds threshold ${(this.tokenUsageThreshold * 100).toFixed(1)}%`);
    }

    // Проверка последовательных ошибок
    if (metrics.consecutiveErrors >= this.consecutiveErrorsThreshold) {
      reasons.push(`${metrics.consecutiveErrors} consecutive errors exceeds threshold ${this.consecutiveErrorsThreshold}`);
    }

    if (reasons.length > 0) {
      return {
        shouldFallback: true,
        reason: reasons.join('; ')
      };
    }

    return {
      shouldFallback: false
    };
  }

  /**
   * Генерация deterministic workflow для fallback
   * 
   * Создает упрощенный workflow без использования LLM
   */
  generateFallbackWorkflow(spec: ScenarioSpec): WorkflowGraph {
    // Создаем простой последовательный workflow
    const nodes: WorkflowNode[] = [
      {
        id: 'start',
        type: 'start'
      }
    ];

    const edges: Array<{ from: string; to: string }> = [];

    // Добавляем узлы для каждого разрешенного действия
    spec.allowedActions.forEach((action, index) => {
      const nodeId = `action-${action.id}`;
      nodes.push({
        id: nodeId,
        type: 'action',
        toolId: action.id,
        timeout: 30000,
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 1000
        }
      });

      // Связываем узлы последовательно
      if (index === 0) {
        edges.push({ from: 'start', to: nodeId });
      } else {
        const prevNodeId = `action-${spec.allowedActions[index - 1].id}`;
        edges.push({ from: prevNodeId, to: nodeId });
      }
    });

    // Конечный узел
    nodes.push({
      id: 'end',
      type: 'end'
    });

    if (spec.allowedActions.length > 0) {
      const lastAction = spec.allowedActions[spec.allowedActions.length - 1];
      edges.push({ from: `action-${lastAction.id}`, to: 'end' });
    }

    return {
      nodes,
      edges,
      traversal: {
        decision: 'first-match-else-default',
        parallel: 'all-matching',
        default: 'first-match'
      },
      metadata: {
        version: '0.1.0',
        compiledAt: new Date().toISOString(),
        specId: spec.id
      }
    };
  }
}
