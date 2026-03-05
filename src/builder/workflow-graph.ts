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
  condition?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: {
    version: string;
    compiledAt: string;
    specId: string;
  };
}
