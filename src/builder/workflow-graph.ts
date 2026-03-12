/**
 * Workflow Graph типы
 */

export interface WorkflowNode {
  id: string;
  type: 'start' | 'action' | 'agent' | 'decision' | 'parallel' | 'compensation' | 'end';
  toolId?: string; // Для action узлов
  agentConfig?: { // Для agent узлов
    userIntent?: string; // Может быть из предыдущих узлов
    roleId?: string; // Специфическая роль агента
    allowedTools?: string[]; // Ограничение доступных инструментов
  };
  config?: Record<string, unknown>;
  timeout?: number;
  retry?: {
    maxAttempts: number;
    backoff: 'exponential' | 'linear' | 'fixed';
    initialDelay: number;
  };
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /**
   * Условие перехода.
   *
   * Поддерживаемые формы в runtime:
   * - "true" / "false"
   * - "field" (truthy проверка поля в outputs текущего узла)
   * - "field == value" / "field != value"
   */
  condition?: string;
}

export interface WorkflowTraversalStrategy {
  /**
   * Для decision узла выбирается первый подходящий edge,
   * иначе fallback edge без condition.
   */
  decision: 'first-match-else-default';
  /**
   * Для parallel узла запускаются все подходящие edge.
   */
  parallel: 'all-matching';
  /**
   * Для остальных узлов без специальных правил:
   * для совместимости берется первый подходящий edge.
   */
  default: 'first-match';
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /**
   * Контракт обхода графа.
   * Runtime должен читать эту стратегию и выбирать следующий узел
   * согласно типу текущего узла.
   */
  traversal: WorkflowTraversalStrategy;
  metadata: {
    version: string;
    compiledAt: string;
    specId: string;
  };
}
