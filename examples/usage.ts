/**
 * Пример использования конструктора сценариев
 */

import { ScenarioSpecValidator, ScenarioBuilder } from '../src';
import { ToolRegistry, RegisteredTool } from '../src/registry';
import { ToolGateway, ToolRequest, ToolRequestContext } from '../src/gateway';
import { RiskClass } from '../src/spec';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== Пример использования конструктора сценариев ===\n');

  // 1. Загрузка и валидация спецификации
  console.log('1. Загрузка и валидация спецификации...');
  const specContent = fs.readFileSync(
    path.join(__dirname, 'simple-scenario.json'),
    'utf-8'
  );
  const specJson = JSON.parse(specContent);

  const validator = new ScenarioSpecValidator();
  const validation = validator.validate(specJson);

  if (!validation.valid) {
    console.error('Ошибка валидации:', validation.errors);
    return;
  }

  const spec = validator.parse(specJson);
  console.log(`✓ Спецификация валидна: ${spec.name} (${spec.id})\n`);

  // 2. Компиляция спецификации в workflow graph
  console.log('2. Компиляция спецификации...');
  const builder = new ScenarioBuilder();
  const workflowGraph = builder.compile(spec);
  const executionPolicy = builder.generateExecutionPolicy(spec);
  const deploymentDescriptor = builder.generateDeploymentDescriptor(spec);

  console.log(`✓ Workflow граф создан: ${workflowGraph.nodes.length} узлов, ${workflowGraph.edges.length} рёбер`);
  console.log(`✓ Политика исполнения: ${executionPolicy.allowedTools.length} разрешённых инструментов`);
  console.log(`✓ Стратегия деплоя: ${deploymentDescriptor.strategy}\n`);

  // 3. Регистрация инструментов
  console.log('3. Регистрация инструментов...');
  const registry = new ToolRegistry();

  spec.allowedActions.forEach(action => {
    const registeredTool: RegisteredTool = {
      ...action,
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
        requiresApproval: action.requiresApproval
      },
      idempotency: {
        supported: true,
        keyHeader: 'Idempotency-Key',
        ttl: 3600
      },
      metadata: {
        version: action.version,
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provider: 'example-provider'
      }
    };

    registry.register(registeredTool);
    console.log(`  ✓ Зарегистрирован: ${registeredTool.name} (${registeredTool.id})`);
  });

  console.log(`\n✓ Всего инструментов в реестре: ${registry.getAll().length}\n`);

  // 4. Настройка Tool Gateway
  console.log('4. Настройка Tool Gateway...');
  const gateway = new ToolGateway();
  gateway.setPolicy(executionPolicy);
  gateway.setSandboxMode(true); // Включен sandbox режим для примера

  console.log('✓ Gateway настроен (sandbox режим включен)\n');

  // 5. Пример выполнения запроса
  console.log('5. Пример выполнения запроса...');
  const context: ToolRequestContext = {
    scenarioId: spec.id,
    executionId: 'exec-123',
    userId: 'user-456',
    userRoles: ['user'],
    traceId: 'trace-789',
    spanId: 'span-101'
  };

  const toolRequest: ToolRequest = {
    toolId: 'send-notification',
    inputs: {
      message: 'Тестовое уведомление',
      recipient: 'user@example.com'
    },
    context
  };

  const tool = registry.get('send-notification');
  if (tool) {
    const response = await gateway.execute(
      toolRequest,
      tool,
      async (req) => {
        // В sandbox режиме это не будет вызвано
        return {
          success: true,
          outputs: { messageId: 'msg-123' },
          metadata: {
            latency: 100,
            timestamp: new Date().toISOString()
          }
        };
      }
    );

    console.log(`✓ Запрос выполнен: ${response.success ? 'успешно' : 'ошибка'}`);
    if (response.error) {
      console.log(`  Ошибка: ${response.error.message}`);
    }
  }

  console.log('\n=== Пример завершён ===');
}

main().catch(console.error);
