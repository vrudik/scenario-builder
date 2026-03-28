import { describe, it, expect } from 'vitest';

function classifyExecutionError(execution: any) {
  if (!execution) return { category: 'unknown', message: 'Execution not found', actions: [] };
  if (execution.status !== 'failed' && execution.status !== 'compensated') {
    return { category: 'none', message: 'Execution is not in error state', actions: [] };
  }

  const err = (execution.errorMessage || execution.error || '').toLowerCase();
  const code = (execution.errorCode || '').toLowerCase();

  let category = 'unknown';
  let message = execution.errorMessage || 'Unknown error';
  let actions: string[] = ['retry'];

  if (code.includes('config') || err.includes('configuration') || err.includes('missing') || err.includes('invalid spec')) {
    category = 'config';
    actions = ['edit_scenario', 'view_spec'];
  } else if (code.includes('policy') || err.includes('denied') || err.includes('opa') || err.includes('blocked')) {
    category = 'policy';
    actions = ['view_opa_decision', 'edit_scenario'];
  } else if (code.includes('tool') || err.includes('tool') || err.includes('timeout') || err.includes('api call')) {
    category = 'tool';
    actions = ['retry', 'view_trace'];
  } else if (code.includes('agent') || err.includes('llm') || err.includes('model') || err.includes('token')) {
    category = 'agent';
    actions = ['retry', 'view_trace'];
  } else if (err.includes('connect') || err.includes('network') || err.includes('econnrefused') || err.includes('unavailable')) {
    category = 'infrastructure';
    actions = ['retry', 'check_health'];
  }

  return { category, message, actions };
}

describe('execution diagnosis', () => {
  it('classifies config errors', () => {
    const result = classifyExecutionError({ status: 'failed', errorMessage: 'Missing configuration for tool X' });
    expect(result.category).toBe('config');
  });

  it('classifies policy errors', () => {
    const result = classifyExecutionError({ status: 'failed', errorMessage: 'OPA policy denied tool call' });
    expect(result.category).toBe('policy');
  });

  it('classifies tool errors', () => {
    const result = classifyExecutionError({ status: 'failed', errorMessage: 'Tool call timeout after 30s' });
    expect(result.category).toBe('tool');
  });

  it('classifies agent errors', () => {
    const result = classifyExecutionError({ status: 'failed', errorMessage: 'LLM token limit exceeded' });
    expect(result.category).toBe('agent');
  });

  it('classifies infra errors', () => {
    const result = classifyExecutionError({ status: 'failed', errorMessage: 'ECONNREFUSED localhost:11434' });
    expect(result.category).toBe('infrastructure');
  });

  it('returns none for non-failed execution', () => {
    const result = classifyExecutionError({ status: 'completed' });
    expect(result.category).toBe('none');
  });

  it('returns unknown for null', () => {
    const result = classifyExecutionError(null);
    expect(result.category).toBe('unknown');
  });
});
