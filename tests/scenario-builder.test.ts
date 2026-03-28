/**
 * Тесты для Scenario Builder
 */

import { describe, it, expect } from 'vitest';
import { ScenarioBuilder } from '../src/builder/scenario-builder';
import { ScenarioSpecValidator } from '../src/spec/scenario-spec';
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
    expect(graph.traversal.default).toBe('first-match');
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

  it('должен строить fan-out от start к нескольким trigger и fan-in к первому action', () => {
    const spec = createTestSpec();
    spec.triggers = [
      { type: TriggerType.EVENT, source: 'events.a' },
      { type: TriggerType.WEBHOOK, source: 'webhook.b' }
    ];

    const graph = builder.compile(spec);

    const triggerNodes = graph.nodes.filter(node => node.id.startsWith('trigger-'));
    expect(triggerNodes).toHaveLength(2);

    const startToTriggers = graph.edges.filter(edge => edge.from === 'start' && edge.to.startsWith('trigger-'));
    expect(startToTriggers).toHaveLength(2);

    const triggerToFirstAction = graph.edges.filter(edge => edge.to === 'action-tool-1' && edge.from.startsWith('trigger-'));
    expect(triggerToFirstAction).toHaveLength(2);
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

  it('должен прокидывать canaryAllowedTools в ExecutionPolicy', () => {
    const spec = createTestSpec();
    spec.canaryAllowedTools = ['tool-1'];
    const policy = builder.generateExecutionPolicy(spec);
    expect(policy.canaryAllowedTools).toEqual(['tool-1']);
  });

  it('должен прокидывать canaryBlockedToolIds в ExecutionPolicy', () => {
    const spec = createTestSpec();
    spec.canaryBlockedToolIds = ['danger-tool'];
    const policy = builder.generateExecutionPolicy(spec);
    expect(policy.canaryBlockedToolIds).toEqual(['danger-tool']);
  });

  it('должен прокидывать stableBlockedToolIds в ExecutionPolicy', () => {
    const spec = createTestSpec();
    spec.stableBlockedToolIds = ['new-api-tool'];
    const policy = builder.generateExecutionPolicy(spec);
    expect(policy.stableBlockedToolIds).toEqual(['new-api-tool']);
  });

  it('должен прокидывать PII и risk class в ExecutionPolicy для OPA', () => {
    const spec = createTestSpec();
    spec.dataContract = {
      sources: ['crm'],
      quality: { required: true },
      piiClassification: 'high'
    };
    spec.riskClass = RiskClass.MEDIUM;
    const policy = builder.generateExecutionPolicy(spec);
    expect(policy.scenarioPiiClassification).toBe('high');
    expect(policy.scenarioRiskClass).toBe('medium');
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

  it('должен использовать shadow для среднего риска', () => {
    const spec = createTestSpec();
    spec.riskClass = RiskClass.MEDIUM;
    const descriptor = builder.generateDeploymentDescriptor(spec);
    expect(descriptor.strategy).toBe('shadow');
    expect(descriptor.shadowConfig?.enabled).toBe(true);
    expect(descriptor.shadowConfig?.percentage).toBe(10);
  });

  it('deployment в spec переопределяет эвристику по riskClass', () => {
    const spec = createTestSpec();
    spec.riskClass = RiskClass.MEDIUM;
    spec.deployment = { strategy: 'all-at-once' };
    const descriptor = builder.generateDeploymentDescriptor(spec);
    expect(descriptor.strategy).toBe('all-at-once');
  });

  it('deployment.canaryPercentage задаёт долю canary', () => {
    const spec = createTestSpec();
    spec.deployment = { strategy: 'canary', canaryPercentage: 25 };
    const descriptor = builder.generateDeploymentDescriptor(spec);
    expect(descriptor.strategy).toBe('canary');
    expect(descriptor.canaryConfig?.percentage).toBe(25);
  });
});
