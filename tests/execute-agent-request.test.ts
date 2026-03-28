/**
 * Интеграционный сценарий для executeAgentRequest: мок БД (ScenarioRepository) + мок AgentRuntime без LLM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RiskClass, TriggerType } from '../src/spec/scenario-spec';
import type { ScenarioSpec } from '../src/spec';

const findByIdMock = vi.hoisted(() => vi.fn());
const agentExecuteMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    success: true,
    output: 'mocked',
    toolCallsExecuted: 0,
    totalTokens: 0,
  })
);

vi.mock('../src/db/repositories/scenario-repository', () => ({
  ScenarioRepository: vi.fn().mockImplementation(() => ({
    findById: findByIdMock,
  })),
}));

vi.mock('../src/agent/agent-runtime', () => ({
  AgentRuntime: vi.fn().mockImplementation(() => ({
    execute: agentExecuteMock,
    getRouter: () => ({
      registerRole: vi.fn(),
    }),
  })),
}));

import { executeAgentRequest } from '../src/web/agent-handler';
import { AgentRuntime } from '../src/agent/agent-runtime';
import { ScenarioRepository } from '../src/db/repositories/scenario-repository';

describe('executeAgentRequest (мок БД + мок агента)', () => {
  const prevDb = process.env.DATABASE_URL;
  const prevEnableDb = process.env.ENABLE_DB;

  const dbSpec: ScenarioSpec = {
    version: '0.1.0',
    id: 'from-db-spec',
    name: 'DB Scenario',
    goal: 'Test goal',
    triggers: [{ type: TriggerType.MANUAL }],
    allowedActions: [
      {
        id: 'web-search-tool',
        name: 'Web Search',
        version: '1.0.0',
        riskClass: RiskClass.LOW,
        requiresApproval: false,
      },
    ],
    riskClass: RiskClass.LOW,
    canaryAllowedTools: ['web-search-tool'],
    nonFunctional: {
      tokenBudget: { maxPerExecution: 999999 },
    },
  };

  beforeEach(() => {
    findByIdMock.mockReset();
    agentExecuteMock.mockClear();
    vi.mocked(ScenarioRepository).mockClear();
    vi.mocked(AgentRuntime).mockClear();
    process.env.DATABASE_URL = 'file:./test-agent-integration.db';
    delete process.env.ENABLE_DB;
  });

  afterEach(() => {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevEnableDb === undefined) delete process.env.ENABLE_DB;
    else process.env.ENABLE_DB = prevEnableDb;
  });

  it('загружает spec из репозитория и передаёт его в AgentRuntime.execute', async () => {
    findByIdMock.mockResolvedValue({
      id: 'row-uuid',
      name: 'n',
      spec: dbSpec,
      tenantId: 'acme',
    });

    const result = await executeAgentRequest('hello', 'scenario-row-id', { tenantId: 'acme' });

    expect(findByIdMock).toHaveBeenCalledWith('scenario-row-id', 'acme');
    expect(AgentRuntime).toHaveBeenCalled();
    expect(agentExecuteMock).toHaveBeenCalledTimes(1);
    const ctx = agentExecuteMock.mock.calls[0][0];
    expect(ctx.scenarioSpec.canaryAllowedTools).toEqual(['web-search-tool']);
    expect(ctx.scenarioSpec.allowedActions.map((a) => a.id)).toEqual(['web-search-tool']);
    expect(ctx.availableTools.every((t) => t.id === 'web-search-tool')).toBe(true);
    expect(result.success).toBe(true);
    expect(result.output).toBe('mocked');
  });

  it('при ENABLE_DB=false не обращается к репозиторию', async () => {
    process.env.ENABLE_DB = 'false';
    findByIdMock.mockResolvedValue({ spec: dbSpec });

    await executeAgentRequest('hello', 'any-id', { tenantId: 'acme' });

    expect(findByIdMock).not.toHaveBeenCalled();
    expect(agentExecuteMock).toHaveBeenCalled();
    const ctx = agentExecuteMock.mock.calls[0][0];
    expect(ctx.scenarioId).toBe('any-id');
    expect(ctx.scenarioSpec.allowedActions.length).toBeGreaterThan(0);
  });
});
