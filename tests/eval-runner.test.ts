/**
 * Тесты для Eval Runner
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EvalRunner, EvalRunnerConfig } from '../src/eval/eval-runner';
import { EvalCaseLibrary, EvalCategory, EvalSeverity } from '../src/eval/eval-cases';
import { AgentRuntime, LLMConfig } from '../src/agent/agent-runtime';
import { GuardrailsManager } from '../src/agent/guardrails';
import { ToolGateway } from '../src/gateway/tool-gateway';
import { ScenarioSpec } from '../src/spec/scenario-spec';

describe('EvalCaseLibrary', () => {
  let library: EvalCaseLibrary;

  beforeEach(() => {
    library = new EvalCaseLibrary();
  });

  it('should initialize with cases', () => {
    const cases = library.getAllCases();
    expect(cases.length).toBeGreaterThan(0);
  });

  it('should find cases by category', () => {
    const cases = library.getCasesByCategory(EvalCategory.PROMPT_INJECTION);
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every(c => c.category === EvalCategory.PROMPT_INJECTION)).toBe(true);
  });

  it('should find cases by tags', () => {
    const cases = library.getCasesByTags(['injection', 'basic']);
    expect(cases.length).toBeGreaterThan(0);
  });

  it('should search cases by name', () => {
    const cases = library.searchCases({ name: 'ignore' });
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every(c => c.name.toLowerCase().includes('ignore'))).toBe(true);
  });

  it('should get case by id', () => {
    const case_ = library.getCaseById('pi-001');
    expect(case_).toBeDefined();
    expect(case_?.id).toBe('pi-001');
  });
});

describe('EvalRunner', () => {
  let runner: EvalRunner;
  let agentRuntime: AgentRuntime;
  let guardrails: GuardrailsManager;

  beforeEach(() => {
    const gateway = new ToolGateway();
    const llmConfig: LLMConfig = {
      provider: 'ollama',
      model: 'llama3.2:1b',
      baseUrl: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 2000
    };
    agentRuntime = new AgentRuntime(gateway, llmConfig);
    guardrails = new GuardrailsManager();

    const scenarioSpec: ScenarioSpec = {
      version: '1.0',
      goal: { description: 'Test', kpis: [] },
      triggers: [],
      allowedActions: [],
      dataContract: { sources: [], quality: { required: [], optional: [] } },
      nonFunctional: {
        sla: { availability: 0.99, latency: { p50: 1000, p95: 5000, p99: 10000 } },
        cost: { tokenBudget: 10000, maxCost: 1.0 }
      },
      riskClass: 'low',
      observability: { enabled: true, logLevel: 'info' }
    };

    const config: EvalRunnerConfig = {
      agentRuntime,
      guardrails,
      scenarioSpec,
      scenarioId: 'test-scenario',
      userId: 'test-user',
      timeout: 5000
    };

    runner = new EvalRunner(config);
  });

  it('should get all cases', () => {
    const cases = runner.getAllCases();
    expect(cases.length).toBeGreaterThan(0);
  });

  it('should get cases by category', () => {
    const cases = runner.getCasesByCategory(EvalCategory.PROMPT_INJECTION);
    expect(cases.length).toBeGreaterThan(0);
  });

  it('should run a case and get result', async () => {
    // Используем безопасный кейс для теста
    const result = await runner.runCase('safe-001');
    
    expect(result).toBeDefined();
    expect(result.caseId).toBe('safe-001');
    expect(result.expectedResult).toBeDefined();
    expect(result.actualResult).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
    expect(result.timestamp).toBeInstanceOf(Date);
  }, 10000);

  it('should run a suite of cases', async () => {
    const suiteResult = await runner.runSuite({
      category: EvalCategory.PROMPT_INJECTION,
      maxCases: 3
    });

    expect(suiteResult).toBeDefined();
    expect(suiteResult.totalCases).toBeGreaterThan(0);
    expect(suiteResult.results.length).toBe(suiteResult.totalCases);
    expect(suiteResult.passedCases + suiteResult.failedCases).toBeLessThanOrEqual(suiteResult.totalCases);
    expect(suiteResult.duration).toBeGreaterThan(0);
  }, 30000);
});
