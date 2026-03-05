/**
 * Тесты для Scenario Builder
 */

import { describe, it, expect } from 'vitest';
import { ScenarioBuilder, ScenarioSpecValidator } from '../src';
import { ScenarioSpec, RiskClass, TriggerType } from '../src/spec';

describe('ScenarioBuilder', () => {
  const validator = new ScenarioSpecValidator();
  const builder = new ScenarioBuilder();

  const createTestSpec = (): ScenarioSpec => ({
    version: '0.1.0',
    id: 'test-scenario',
    name: 'Test Scenario',
    goal: 'Test goal',
    triggers: [
      {
        type: TriggerType.EVENT,
        source: 'test.events'
      }
    ],
    allowedActions: [
      {
        id: 'tool-1',
        name: 'Tool 1',
        version: '1.0.0',
        riskClass: RiskClass.LOW,
        requiresApproval: false
      },
      {
        id: 'tool-2',
        name: 'Tool 2',
        version: '1.0.0',
        riskClass: RiskClass.LOW,
        requiresApproval: false
      }
    ],
    riskClass: RiskClass.LOW
  });

  it('должен компилировать spec в workflow graph', () => {
    const spec = createTestSpec();
    const graph = builder.compile(spec);

    expect(graph).toBeDefined();
    expect(graph.nodes).toBeDefined();
    expect(graph.edges).toBeDefined();
    expect(graph.metadata).toBeDefined();
    expect(graph.metadata.specId).toBe(spec.id);
  });

  it('должен создавать правильную структуру workflow graph', () => {
    const spec = createTestSpec();
    const graph = builder.compile(spec);

    // Должен быть стартовый узел
    const startNode = graph.nodes.find(n => n.id === 'start');
    expect(startNode).toBeDefined();
    expect(startNode?.type).toBe('start');

    // Должен быть конечный узел
    const endNode = graph.nodes.find(n => n.id === 'end');
    expect(endNode).toBeDefined();
    expect(endNode?.type).toBe('end');

    // Должны быть узлы для действий
    const actionNodes = graph.nodes.filter(n => n.type === 'action');
    expect(actionNodes.length).toBeGreaterThan(0);
  });

  it('должен генерировать политику исполнения', () => {
    const spec = createTestSpec();
    const policy = builder.generateExecutionPolicy(spec);

    expect(policy).toBeDefined();
    expect(policy.allowedTools).toContain('tool-1');
    expect(policy.allowedTools).toContain('tool-2');
    expect(Array.isArray(policy.forbiddenActions)).toBe(true);
    expect(Array.isArray(policy.requiresApproval)).toBe(true);
  });

  it('должен генерировать deployment descriptor', () => {
    const spec = createTestSpec();
    const descriptor = builder.generateDeploymentDescriptor(spec);

    expect(descriptor).toBeDefined();
    expect(descriptor.strategy).toBeDefined();
    expect(['shadow', 'canary', 'blue-green', 'all-at-once']).toContain(descriptor.strategy);
  });

  it('должен использовать canary для высокорисковых сценариев', () => {
    const spec = createTestSpec();
    spec.riskClass = RiskClass.HIGH;
    
    const descriptor = builder.generateDeploymentDescriptor(spec);
    expect(descriptor.strategy).toBe('canary');
    expect(descriptor.canaryConfig).toBeDefined();
  });
});
