/**
 * Scenario Builder/Compiler
 * 
 * Функции:
 * 1. Определять подходящий шаблон (pattern selection) из Template Library
 * 2. Компилировать Spec → workflow graph (state machine/DAG) с таймаутами/retries/ветвлениями
 * 3. Генерировать "политику исполнения" (guardrails), которую будет применять runtime
 * 4. Генерировать набор тестов и eval-кейсов (smoke + edge cases)
 * 5. Генерировать deployment descriptor (как выкатывать: shadow/canary)
 */

import { ScenarioSpec, ScenarioSpecValidator } from '../spec';
import { WorkflowGraph, WorkflowNode, WorkflowEdge } from './workflow-graph';

/**
 * Политика исполнения (guardrails)
 */
export interface ExecutionPolicy {
  allowedTools: string[];
  forbiddenActions: string[];
  requiresApproval: string[];
  rateLimits: Record<string, number>;
  costLimits: {
    maxPerExecution?: number;
    maxPerDay?: number;
  };
  tokenLimits: {
    maxPerExecution?: number;
    maxPerDay?: number;
  };
}

/**
 * Deployment descriptor
 */
export interface DeploymentDescriptor {
  strategy: 'shadow' | 'canary' | 'blue-green' | 'all-at-once';
  canaryConfig?: {
    percentage: number;
    duration: number; // в секундах
    successCriteria: {
      errorRate: number;
      latency: number;
    };
  };
  shadowConfig?: {
    enabled: boolean;
    percentage: number;
  };
}

/**
 * Scenario Builder
 */
export class ScenarioBuilder {
  private validator: ScenarioSpecValidator;

  constructor() {
    this.validator = new ScenarioSpecValidator();
  }

  /**
   * Компиляция Spec → Workflow Graph
   */
  compile(spec: ScenarioSpec): WorkflowGraph {
    // Валидация спецификации
    const validation = this.validator.validate(spec);
    if (!validation.valid) {
      throw new Error(`Invalid scenario spec: ${validation.errors?.message}`);
    }

    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];

    // Создание стартового узла
    const startNode: WorkflowNode = {
      id: 'start',
      type: 'start'
    };
    nodes.push(startNode);

    // Создание узлов для каждого триггера
    const triggerNodeIds: string[] = [];
    spec.triggers.forEach((trigger, index) => {
      const triggerNode: WorkflowNode = {
        id: `trigger-${index}`,
        type: 'action',
        config: {
          triggerType: trigger.type,
          source: trigger.source,
          pattern: trigger.pattern
        }
      };
      nodes.push(triggerNode);
      triggerNodeIds.push(triggerNode.id);
      edges.push({
        from: 'start',
        to: triggerNode.id
      });
    });

    // Создание узлов для действий
    spec.allowedActions.forEach((action, index) => {
      const actionNode: WorkflowNode = {
        id: `action-${action.id}`,
        type: 'action',
        toolId: action.id,
        timeout: 30000, // 30 секунд по умолчанию
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelay: 1000
        }
      };
      nodes.push(actionNode);

      // Связывание с предыдущим узлом
      if (index === 0) {
        // Fan-in/fan-out: первый action доступен из любого trigger
        triggerNodeIds.forEach(triggerNodeId => {
          edges.push({
            from: triggerNodeId,
            to: actionNode.id
          });
        });
      } else {
        edges.push({
          from: `action-${spec.allowedActions[index - 1].id}`,
          to: actionNode.id
        });
      }
    });

    // Создание конечного узла
    const endNode: WorkflowNode = {
      id: 'end',
      type: 'end'
    };
    nodes.push(endNode);

    // Связывание последнего действия с конечным узлом
    if (spec.allowedActions.length > 0) {
      const lastAction = spec.allowedActions[spec.allowedActions.length - 1];
      edges.push({
        from: `action-${lastAction.id}`,
        to: 'end'
      });
    } else {
      // Пустой пайплайн действий: каждый trigger завершает workflow напрямую
      triggerNodeIds.forEach(triggerNodeId => {
        edges.push({
          from: triggerNodeId,
          to: 'end'
        });
      });
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

  /**
   * Генерация политики исполнения
   */
  generateExecutionPolicy(spec: ScenarioSpec): ExecutionPolicy {
    const allowedTools = spec.allowedActions.map(a => a.id);
    const forbiddenActions = spec.riskRules?.forbidden || [];
    const requiresApproval = spec.riskRules?.requiresApproval || [];

    const rateLimits: Record<string, number> = {};
    spec.allowedActions.forEach(action => {
      if (action.rateLimit) {
        rateLimits[action.id] = action.rateLimit;
      }
    });

    return {
      allowedTools,
      forbiddenActions,
      requiresApproval,
      rateLimits,
      costLimits: spec.nonFunctional?.cost || {},
      tokenLimits: spec.nonFunctional?.tokenBudget || {}
    };
  }

  /**
   * Генерация deployment descriptor
   */
  generateDeploymentDescriptor(spec: ScenarioSpec): DeploymentDescriptor {
    // По умолчанию используем canary для высокорисковых сценариев
    if (spec.riskClass === 'high' || spec.riskClass === 'critical') {
      return {
        strategy: 'canary',
        canaryConfig: {
          percentage: 10,
          duration: 3600, // 1 час
          successCriteria: {
            errorRate: 0.01, // 1%
            latency: 1000 // 1 секунда
          }
        }
      };
    }

    return {
      strategy: 'all-at-once'
    };
  }
}
