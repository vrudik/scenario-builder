/**
 * Маскирование идентификаторов во входе OPA (внешняя политика не должна получать сырой PII при высокой классификации).
 */

export type ScenarioPiiLevel = 'none' | 'low' | 'medium' | 'high' | undefined;

function redactMediumId(value: string): string {
  if (value.length <= 2) {
    return '***';
  }
  return `${value.slice(0, 2)}…(len:${value.length})`;
}

/**
 * Копия объекта для OPA с ослабленными идентификаторами при medium/high PII сценария.
 */
export function redactOpaScenarioInput<T extends Record<string, unknown>>(
  input: T,
  pii: ScenarioPiiLevel
): T {
  if (!pii || pii === 'none' || pii === 'low') {
    return input;
  }
  const next = { ...input } as Record<string, unknown>;
  if (pii === 'medium') {
    if (typeof next.userId === 'string') {
      next.userId = redactMediumId(next.userId);
    }
    if (typeof next.executionId === 'string') {
      next.executionId = redactMediumId(next.executionId);
    }
  } else if (pii === 'high') {
    if (typeof next.userId === 'string') {
      next.userId = '[REDACTED]';
    }
    if (typeof next.executionId === 'string') {
      next.executionId = '[REDACTED]';
    }
    if (typeof next.scenarioId === 'string' && next.scenarioId.length > 24) {
      next.scenarioId = redactMediumId(next.scenarioId);
    }
  }
  return next as T;
}
