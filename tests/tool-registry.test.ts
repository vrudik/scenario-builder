/**
 * Тесты для Tool Registry
 */

import { describe, it, expect } from 'vitest';
import { ToolRegistry, RegisteredTool } from '../src/registry';
import { RiskClass } from '../src/spec';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  
  beforeEach(() => {
    registry = new ToolRegistry();
  });

  const createTestTool = (id: string, riskClass: RiskClass = RiskClass.LOW): RegisteredTool => ({
    id,
    name: `Tool ${id}`,
    version: '1.0.0',
    riskClass,
    requiresApproval: false,
    inputOutput: {
      inputs: {},
      outputs: {}
    },
    sla: {
      availability: 0.99,
      latency: {
        p50: 100,
        p95: 500,
        p99: 1000
      },
      maxRetries: 3
    },
    authorization: {
      scopes: [],
      roles: [],
      requiresApproval: false
    },
    idempotency: {
      supported: true
    },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'test-provider'
    }
  });

  it('должен регистрировать инструмент', () => {
    const tool = createTestTool('test-tool-1');
    registry.register(tool);

    expect(registry.has('test-tool-1')).toBe(true);
    expect(registry.get('test-tool-1')).toEqual(tool);
  });

  it('должен возвращать все инструменты', () => {
    registry.register(createTestTool('tool-1'));
    registry.register(createTestTool('tool-2'));

    const allTools = registry.getAll();
    expect(allTools.length).toBeGreaterThanOrEqual(2);
  });

  it('должен фильтровать инструменты по риск-классу', () => {
    registry.register(createTestTool('low-tool', RiskClass.LOW));
    registry.register(createTestTool('high-tool', RiskClass.HIGH));

    const lowRiskTools = registry.getByRiskClass(RiskClass.LOW);
    expect(lowRiskTools.length).toBeGreaterThan(0);
    expect(lowRiskTools.every(t => t.riskClass === RiskClass.LOW)).toBe(true);
  });

  it('должен удалять инструмент', () => {
    const tool = createTestTool('tool-to-remove');
    registry.register(tool);
    
    expect(registry.has('tool-to-remove')).toBe(true);
    
    const removed = registry.unregister('tool-to-remove');
    expect(removed).toBe(true);
    expect(registry.has('tool-to-remove')).toBe(false);
  });

  it('должен искать инструменты по запросу', () => {
    registry.register(createTestTool('searchable-tool'));
    
    const results = registry.search('searchable');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(t => t.id === 'searchable-tool')).toBe(true);
  });
});
