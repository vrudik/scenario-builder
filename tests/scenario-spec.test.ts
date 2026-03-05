/**
 * Тесты для Scenario Spec
 */

import { describe, it, expect } from 'vitest';
import { ScenarioSpecValidator, ScenarioSpec, RiskClass, TriggerType } from '../src/spec';

describe('ScenarioSpecValidator', () => {
  const validator = new ScenarioSpecValidator();

  it('должен валидировать корректную спецификацию', () => {
    const validSpec: ScenarioSpec = {
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
          id: 'test-tool',
          name: 'Test Tool',
          version: '1.0.0',
          riskClass: RiskClass.LOW,
          requiresApproval: false
        }
      ],
      riskClass: RiskClass.LOW
    };

    const result = validator.validate(validSpec);
    expect(result.valid).toBe(true);
  });

  it('должен отклонять некорректную спецификацию', () => {
    const invalidSpec = {
      id: 'test-scenario'
      // отсутствуют обязательные поля
    };

    const result = validator.validate(invalidSpec);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('должен парсить валидную спецификацию', () => {
    const spec = {
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
          id: 'test-tool',
          name: 'Test Tool',
          version: '1.0.0',
          riskClass: RiskClass.LOW,
          requiresApproval: false
        }
      ],
      riskClass: RiskClass.LOW
    };

    const parsed = validator.parse(spec);
    expect(parsed.id).toBe('test-scenario');
    expect(parsed.name).toBe('Test Scenario');
    expect(parsed.triggers).toHaveLength(1);
    expect(parsed.allowedActions).toHaveLength(1);
  });
});
