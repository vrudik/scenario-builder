/**
 * Ручной тест для проверки работы компонентов
 * Запуск: npx tsx test-manual.ts
 */

import { ScenarioSpecValidator } from './src/spec';
import { ScenarioBuilder } from './src/builder';
import { ToolRegistry, RegisteredTool } from './src/registry';
import { ToolGateway, ToolRequest, ToolRequestContext } from './src/gateway';
import { RiskClass, TriggerType } from './src/spec';

console.log('=== Ручное тестирование компонентов ===\n');

// Тест 1: Scenario Spec валидация
console.log('1. Тест Scenario Spec валидации...');
try {
  const validator = new ScenarioSpecValidator();
  
  const validSpec = {
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

  const validation = validator.validate(validSpec);
  if (validation.valid) {
    console.log('✓ Валидация прошла успешно');
    const parsed = validator.parse(validSpec);
    console.log(`✓ Спецификация распарсена: ${parsed.name} (${parsed.id})`);
  } else {
    console.error('✗ Ошибка валидации:', validation.errors);
    process.exit(1);
  }
} catch (error) {
  console.error('✗ Ошибка:', error);
  process.exit(1);
}

// Тест 2: Scenario Builder
console.log('\n2. Тест Scenario Builder...');
try {
  const builder = new ScenarioBuilder();
  const validator = new ScenarioSpecValidator();
  
  const spec = validator.parse({
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

  const graph = builder.compile(spec);
  console.log(`✓ Workflow граф создан: ${graph.nodes.length} узлов, ${graph.edges.length} рёбер`);
  
  const policy = builder.generateExecutionPolicy(spec);
  console.log(`✓ Политика исполнения: ${policy.allowedTools.length} инструментов`);
  
  const descriptor = builder.generateDeploymentDescriptor(spec);
  console.log(`✓ Deployment descriptor: стратегия ${descriptor.strategy}`);
} catch (error) {
  console.error('✗ Ошибка:', error);
  process.exit(1);
}

// Тест 3: Tool Registry
console.log('\n3. Тест Tool Registry...');
try {
  const registry = new ToolRegistry();
  
  const tool: RegisteredTool = {
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

  registry.register(tool);
  console.log(`✓ Инструмент зарегистрирован: ${tool.name}`);
  
  const retrieved = registry.get('test-tool');
  if (retrieved && retrieved.id === 'test-tool') {
    console.log('✓ Инструмент успешно получен из реестра');
  } else {
    throw new Error('Инструмент не найден');
  }
  
  const allTools = registry.getAll();
  console.log(`✓ Всего инструментов в реестре: ${allTools.length}`);
} catch (error) {
  console.error('✗ Ошибка:', error);
  process.exit(1);
}

// Тест 4: Tool Gateway
console.log('\n4. Тест Tool Gateway...');
try {
  const gateway = new ToolGateway();
  const registry = new ToolRegistry();
  
  const tool: RegisteredTool = {
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

  gateway.setSandboxMode(true);
  
  const context: ToolRequestContext = {
    scenarioId: 'test-scenario',
    executionId: 'test-exec',
    userId: 'test-user',
    userRoles: ['user']
  };

  const request: ToolRequest = {
    toolId: 'test-tool',
    inputs: { test: 'data' },
    context
  };

  const response = await gateway.execute(
    request,
    tool,
    async () => {
      throw new Error('Should not be called in sandbox mode');
    }
  );

  if (response.success) {
    console.log('✓ Запрос выполнен успешно (sandbox режим)');
  } else {
    throw new Error(`Запрос не выполнен: ${response.error?.message}`);
  }
} catch (error) {
  console.error('✗ Ошибка:', error);
  process.exit(1);
}

console.log('\n=== Все тесты пройдены успешно! ===');
