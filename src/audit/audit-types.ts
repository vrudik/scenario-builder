/**
 * Типы для модуля аудита
 * Единый формат событий для Orchestrator, AgentRuntime, ToolGateway, EvalRunner
 */

export const AuditAction = {
  // Сценарии
  SCENARIO_STARTED: 'scenario_started',
  SCENARIO_COMPLETED: 'scenario_completed',
  SCENARIO_FAILED: 'scenario_failed',
  SCENARIO_COMPENSATED: 'scenario_compensated',
  NODE_STARTED: 'node_started',
  NODE_COMPLETED: 'node_completed',
  NODE_FAILED: 'node_failed',
  // Агент
  AGENT_EXECUTION_STARTED: 'agent_execution_started',
  AGENT_EXECUTION_COMPLETED: 'agent_execution_completed',
  AGENT_EXECUTION_FAILED: 'agent_execution_failed',
  // Guardrails
  GUARDRAIL_PROMPT_BLOCKED: 'guardrail_prompt_blocked',
  GUARDRAIL_OUTPUT_BLOCKED: 'guardrail_output_blocked',
  GUARDRAIL_TOOL_BLOCKED: 'guardrail_tool_blocked',
  // Инструменты
  TOOL_CALL_STARTED: 'tool_call_started',
  TOOL_CALL_COMPLETED: 'tool_call_completed',
  TOOL_CALL_DENIED: 'tool_call_denied',
  TOOL_CALL_FAILED: 'tool_call_failed',
  // Eval
  EVAL_CASE_STARTED: 'eval_case_started',
  EVAL_CASE_COMPLETED: 'eval_case_completed',
  EVAL_SUITE_COMPLETED: 'eval_suite_completed',
  // Auth
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILURE: 'auth_failure',
  API_KEY_CREATED: 'api_key_created',
  API_KEY_REVOKED: 'api_key_revoked',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditOutcome = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  BLOCKED: 'blocked',
  MODIFIED: 'modified',
} as const;

export type AuditOutcomeType = (typeof AuditOutcome)[keyof typeof AuditOutcome];

export const AuditSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;

export type AuditSeverityType = (typeof AuditSeverity)[keyof typeof AuditSeverity];

export interface AuditEventInput {
  action: AuditActionType;
  actor?: string;
  resource?: string;
  outcome?: AuditOutcomeType;
  severity?: AuditSeverityType;
  message?: string;
  details?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  orgId?: string;
  tenantId?: string;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  actor: string | null;
  resource: string | null;
  outcome: string;
  severity: string;
  message: string | null;
  details: Record<string, unknown> | null;
  traceId: string | null;
  spanId: string | null;
  orgId: string | null;
  tenantId: string | null;
  timestamp: Date;
}
