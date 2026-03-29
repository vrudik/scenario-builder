/**
 * Тесты для Tool Gateway
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolGateway, ToolRequest, ToolRequestContext } from '../src/gateway';
import { ExecutionPolicy } from '../src/builder';
import { RegisteredTool } from '../src/registry';
import { RiskClass } from '../src/spec';
import { OpaHttpClient } from '../src/policy/opa-http-client';
import { systemMetrics } from '../src/observability/metrics';

describe('ToolGateway', () => {
  let gateway: ToolGateway;
  let testTool: RegisteredTool;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    gateway = new ToolGateway();
    
    testTool = {
      id: 'test-tool',
      name: 'Test Tool',
      version: '1.0.0',
      riskClass: RiskClass.LOW,
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
    };
  });

  it('должен выполнять запрос в sandbox режиме', async () => {
    gateway.setSandboxMode(true);

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user']
    };

    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context
    };

    const response = await gateway.execute(
      request,
      testTool,
      async () => {
        throw new Error('Should not be called in sandbox mode');
      }
    );

    expect(response.success).toBe(true);
    expect(response.outputs).toBeDefined();
  });

  it('должен отклонять запрос для запрещенного инструмента', async () => {
    const policy: ExecutionPolicy = {
      allowedTools: ['other-tool'],
      forbiddenActions: ['test-tool'],
      requiresApproval: [],
      rateLimits: {},
      costLimits: {},
      tokenLimits: {}
    };

    gateway.setPolicy(policy);
    gateway.setSandboxMode(false);

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user']
    };

    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context
    };

    const response = await gateway.execute(
      request,
      testTool,
      async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
    );

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('ACCESS_DENIED');
  });

  it('должен отдавать mockToolConfig без вызова executor', async () => {
    gateway.setSandboxMode(false);

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user'],
      mockToolConfig: {
        'test-tool': { response: { hello: 'mocked' } },
      },
    };

    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: { q: 'x' },
      context,
    };

    const response = await gateway.execute(
      request,
      testTool,
      async () => {
        throw new Error('executor should not run when mockToolConfig matches');
      },
    );

    expect(response.success).toBe(true);
    expect(response.outputs).toEqual({ hello: 'mocked' });
  });

  it('метрики: local policy denial с deployment_lane', async () => {
    const spyDeny = vi.spyOn(systemMetrics.gatewayPolicyDenials, 'add');
    const policy: ExecutionPolicy = {
      allowedTools: ['other-tool'],
      forbiddenActions: [],
      requiresApproval: [],
      rateLimits: {},
      costLimits: {},
      tokenLimits: {}
    };
    gateway.setPolicy(policy);
    gateway.setSandboxMode(false);

    await gateway.execute(
      {
        toolId: 'test-tool',
        inputs: {},
        context: {
          scenarioId: 's',
          executionId: 'e',
          userId: 'u',
          userRoles: ['user'],
          deploymentLane: 'canary'
        }
      },
      testTool,
      async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
    );

    expect(spyDeny).toHaveBeenCalledWith(1, { layer: 'local', deployment_lane: 'canary' });
    spyDeny.mockRestore();
  });

  it('должен возвращать ошибку EXECUTOR_NOT_FOUND если executor не найден', async () => {
    gateway.setSandboxMode(false);

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user']
    };

    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context
    };

    await expect(gateway.execute(request, testTool)).resolves.toMatchObject({
      success: false,
      error: {
        code: 'EXECUTOR_NOT_FOUND',
        message: 'No executor registered for tool: test-tool'
      }
    });
  });

  it('OPA может отклонить вызов после успешной локальной политики', async () => {
    const policy: ExecutionPolicy = {
      allowedTools: ['test-tool'],
      forbiddenActions: [],
      requiresApproval: [],
      rateLimits: {},
      costLimits: {},
      tokenLimits: {}
    };
    gateway.setPolicy(policy);
    gateway.setSandboxMode(false);
    gateway.setOpaClient(new OpaHttpClient('http://127.0.0.1:8181', { failOpen: false }));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
    );

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user']
    };
    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context
    };

    const response = await gateway.execute(
      request,
      testTool,
      async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
    );

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('ACCESS_DENIED');
  });

  it('метрики: OPA deny увеличивает gateway_opa_decisions и gateway_policy_denials', async () => {
    const spyDeny = vi.spyOn(systemMetrics.gatewayPolicyDenials, 'add');
    const spyOpa = vi.spyOn(systemMetrics.gatewayOpaDecisions, 'add');
    const policy: ExecutionPolicy = {
      allowedTools: ['test-tool'],
      forbiddenActions: [],
      requiresApproval: [],
      rateLimits: {},
      costLimits: {},
      tokenLimits: {}
    };
    gateway.setPolicy(policy);
    gateway.setSandboxMode(false);
    gateway.setOpaClient(new OpaHttpClient('http://127.0.0.1:8181', { failOpen: false }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
    );

    await gateway.execute(
      {
        toolId: 'test-tool',
        inputs: {},
        context: {
          scenarioId: 'test-scenario',
          executionId: 'test-exec',
          userId: 'test-user',
          userRoles: ['user'],
          deploymentLane: 'stable'
        }
      },
      testTool,
      async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
    );

    expect(spyOpa).toHaveBeenCalledWith(1, { result: 'deny', deployment_lane: 'stable' });
    expect(spyDeny).toHaveBeenCalledWith(1, { layer: 'opa', deployment_lane: 'stable' });
    spyDeny.mockRestore();
    spyOpa.mockRestore();
  });

  it('OPA input содержит PII, risk, лимиты и cost_guard_exceeded', async () => {
    const policy: ExecutionPolicy = {
      allowedTools: ['test-tool'],
      forbiddenActions: [],
      requiresApproval: [],
      rateLimits: {},
      costLimits: { maxPerExecution: 10 },
      tokenLimits: { maxPerExecution: 1000 },
      scenarioPiiClassification: 'medium',
      scenarioRiskClass: 'low',
      canaryAllowedTools: ['test-tool'],
      canaryBlockedToolIds: ['prod-delete'],
      stableBlockedToolIds: ['beta-integration']
    };
    gateway.setPolicy(policy);
    gateway.setSandboxMode(false);
    gateway.setOpaClient(new OpaHttpClient('http://127.0.0.1:8181', { failOpen: false }));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user'],
      costGuardExceeded: true
    };
    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context
    };

    await gateway.execute(
      request,
      testTool,
      async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
    );

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { input: Record<string, unknown> };
    expect(body.input.scenarioPiiClassification).toBe('medium');
    expect(body.input.scenarioRiskClass).toBe('low');
    expect(body.input.toolRiskClass).toBe('low');
    expect(body.input.costLimits).toEqual({ maxPerExecution: 10 });
    expect(body.input.tokenLimits).toEqual({ maxPerExecution: 1000 });
    expect(body.input.cost_guard_exceeded).toBe(true);
    expect(body.input.canaryAllowedTools).toEqual(['test-tool']);
    expect(body.input.canaryBlockedToolIds).toEqual(['prod-delete']);
    expect(body.input.stableBlockedToolIds).toEqual(['beta-integration']);
  });

  it('OPA input: при high PII userId и executionId маскируются', async () => {
    const policy: ExecutionPolicy = {
      allowedTools: ['test-tool'],
      forbiddenActions: [],
      requiresApproval: [],
      rateLimits: {},
      costLimits: {},
      tokenLimits: {},
      scenarioPiiClassification: 'high',
      scenarioRiskClass: 'low'
    };
    gateway.setPolicy(policy);
    gateway.setSandboxMode(false);
    gateway.setOpaClient(new OpaHttpClient('http://127.0.0.1:8181', { failOpen: false }));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context: {
        scenarioId: 'test-scenario',
        executionId: 'secret-exec-id',
        userId: 'secret-user',
        userRoles: ['user'],
        tenantId: 'corp-tenant'
      }
    };

    await gateway.execute(
      request,
      testTool,
      async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { input: Record<string, string> };
    expect(body.input.userId).toBe('[REDACTED]');
    expect(body.input.executionId).toBe('[REDACTED]');
    expect(body.input.scenarioPiiClassification).toBe('high');
    expect(body.input.tenantId).toBe('corp-tenant');
  });

  it('должен применять rate limiting', async () => {
    gateway.setSandboxMode(false);

    const context: ToolRequestContext = {
      scenarioId: 'test-scenario',
      executionId: 'test-exec',
      userId: 'test-user',
      userRoles: ['user']
    };

    const request: ToolRequest = {
      toolId: 'test-tool',
      inputs: {},
      context
    };

    // Делаем много запросов подряд
    const responses = await Promise.all(
      Array.from({ length: 150 }, () =>
        gateway.execute(
          request,
          testTool,
          async () => ({ success: true, outputs: {}, metadata: { latency: 0, timestamp: new Date().toISOString() } })
        )
      )
    );

    // Некоторые запросы должны быть отклонены из-за rate limit
    const rateLimited = responses.filter(r => r.error?.code === 'RATE_LIMIT_EXCEEDED');
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
