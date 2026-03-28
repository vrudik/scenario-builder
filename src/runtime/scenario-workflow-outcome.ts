/**
 * Результат `scenarioWorkflow` (Temporal) — общий контракт с ответом in-memory оркестратора.
 */

export interface ScenarioWorkflowNodeOutcome {
  ok: boolean;
  code?: string;
  error?: string;
  outputs?: Record<string, unknown>;
}

export interface ScenarioWorkflowOutcome {
  success: boolean;
  result?: unknown;
  /** Заполняется только на стороне TemporalClient после start+result (не из workflow JSON) */
  temporalRunId?: string;
  temporalWorkflowId?: string;
  /** Сообщение об ошибке (краткое, для логов и API) */
  error?: string;
  /** Код ошибки верхнего уровня или кода упавшего узла */
  errorCode?: string;
  /** Узел, на котором остановились при ошибке */
  terminalNodeId?: string;
  /** Сводка по узлам (паритет с `WorkflowExecutionState.nodeResults`) */
  nodeOutcomes?: Record<string, ScenarioWorkflowNodeOutcome>;
}
