/**
 * Тесты для Tool Gateway
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolGateway, ToolRequest, ToolRequestContext } from '../src/gateway';
import { ExecutionPolicy } from '../src/builder';
import { RegisteredTool } from '../src/registry';
import { RiskClass } from '../src/spec';

describe('ToolGateway', () => {
  let gateway: ToolGateway;
  let testTool: RegisteredTool;

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
