/**
 * Пример использования Runtime Orchestrator
 */

import { ScenarioSpecValidator, ScenarioBuilder } from '../src';
import { ToolRegistry, RegisteredTool } from '../src/registry';
import { ToolGateway } from '../src/gateway';
import { Orchestrator, ExecutionContext } from '../src/runtime';
import { RiskClass } from '../src/spec';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('=== Пример использования Runtime Orchestrator ===\n');

  // 1. Загрузка и компиляция спецификации
  console.log('1. Загрузка и компиляция спецификации...');
  const specContent = fs.readFileSync(
    path.join(__dirname, 'simple-scenario.json'),
    'utf-8'
  );
  const specJson = JSON.parse(specContent);

  const validator = new ScenarioSpecValidator();
  const spec = validator.parse(specJson);
  console.log(`✓ Спецификация загружена: ${spec.name}\n`);

  const builder = new ScenarioBuilder();
  const workflowGraph = builder.compile(spec);
  const executionPolicy = builder.generateExecutionPolicy(spec);
  console.log(`✓ Workflow граф скомпилирован: ${workflowGraph.nodes.length} узлов\n`);

  // 2. Настройка Tool Registry и Gateway
  console.log('2. Настройка Tool Registry и Gateway...');
  const registry = new ToolRegistry();
  const gateway = new ToolGateway();
  gateway.setPolicy(executionPolicy);
  gateway.setSandboxMode(true); // Sandbox режим для примера

  // Регистрация инструментов
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
        supported: true
      },
      metadata: {
        version: action.version,
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provider: 'example-provider'
      }
    };

    registry.register(registeredTool);
  });
  console.log(`✓ Инструменты зарегистрированы: ${registry.getAll().length}\n`);

  // 3. Создание Orchestrator
  console.log('3. Создание и запуск Orchestrator...');
  const orchestrator = new Orchestrator(gateway);

  // 4. Создание контекста выполнения
  const executionId = `exec-${Date.now()}`;
  const context: ExecutionContext = {
    scenarioId: spec.id,
    executionId,
    workflowGraph,
    spec,
    userId: 'user-123',
    userRoles: ['user'],
    traceId: `trace-${Date.now()}`,
    spanId: `span-${Date.now()}`,
    startedAt: new Date()
  };

  // 5. Запуск выполнения
  console.log(`4. Запуск выполнения сценария (ID: ${executionId})...`);
  await orchestrator.startExecution(context);

  // 6. Проверка состояния выполнения
  const state = orchestrator.getExecutionState(executionId);
  if (state) {
    console.log(`\n✓ Выполнение завершено:`);
    console.log(`  - Статус: ${state.completed ? 'завершено' : state.failed ? 'ошибка' : 'в процессе'}`);
    console.log(`  - Выполнено узлов: ${state.nodeResults.size}`);
    console.log(`  - Компенсировано узлов: ${state.compensationStack.length}`);
  }

  // 7. Получение истории событий
  const history = orchestrator.getEventHistory(executionId);
  console.log(`\n✓ История событий: ${history.length} событий`);
  history.forEach((event, index) => {
    console.log(`  ${index + 1}. ${event.type}${event.nodeId ? ` (node: ${event.nodeId})` : ''} - ${event.timestamp.toISOString()}`);
  });

  console.log('\n=== Пример завершён ===');
}

main().catch(console.error);
