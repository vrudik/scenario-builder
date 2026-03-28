import { describe, it, expect, afterEach } from 'vitest';
import { estimateToolCallCostUsd } from '../src/utils/tool-call-cost';
import type { RegisteredTool } from '../src/registry/tool-registry';
import { RiskClass } from '../src/spec/scenario-spec';

function minimalTool(overrides: Partial<RegisteredTool> = {}): RegisteredTool {
  return {
    id: 't1',
    name: 'T',
    version: '1.0.0',
    riskClass: RiskClass.LOW,
    requiresApproval: false,
    inputOutput: { inputs: {}, outputs: {} },
    sla: {
      availability: 0.99,
      latency: { p50: 1, p95: 2, p99: 3 },
      maxRetries: 1,
    },
    authorization: { scopes: [], roles: [], requiresApproval: false },
    idempotency: { supported: false },
    metadata: {
      version: '1.0.0',
      registeredAt: '',
      updatedAt: '',
      provider: 'test',
    },
    ...overrides,
  };
}

describe('estimateToolCallCostUsd', () => {
  const prev = process.env.EXECUTION_TOOL_COST_USD_DEFAULT;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.EXECUTION_TOOL_COST_USD_DEFAULT;
    } else {
      process.env.EXECUTION_TOOL_COST_USD_DEFAULT = prev;
    }
  });

  it('использует estimatedCostUsdPerCall на инструменте', () => {
    delete process.env.EXECUTION_TOOL_COST_USD_DEFAULT;
    expect(estimateToolCallCostUsd(minimalTool({ estimatedCostUsdPerCall: 0.42 }))).toBe(0.42);
  });

  it('fallback на EXECUTION_TOOL_COST_USD_DEFAULT', () => {
    process.env.EXECUTION_TOOL_COST_USD_DEFAULT = '0.01';
    expect(estimateToolCallCostUsd(minimalTool())).toBe(0.01);
  });

  it('по умолчанию 0', () => {
    delete process.env.EXECUTION_TOOL_COST_USD_DEFAULT;
    expect(estimateToolCallCostUsd(minimalTool())).toBe(0);
  });
});
