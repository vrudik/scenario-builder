/**
 * Пример использования Agent Runtime
 */

import { AgentRuntime, LLMConfig } from '../src/agent';
import { ToolGateway } from '../src/gateway';
import { ToolRegistry, RegisteredTool } from '../src/registry';
import { ScenarioSpecValidator, TriggerType, RiskClass } from '../src/spec';

async function main() {
  console.log('=== Пример использования Agent Runtime ===\n');

  // 1. Создание Tool Registry и Gateway
  const registry = new ToolRegistry();
  const gateway = new ToolGateway();

  // Регистрация инструментов
  const tool1: RegisteredTool = {
    id: 'search-tool',
    name: 'Search Tool',
    version: '1.0.0',
    riskClass: RiskClass.LOW,
    requiresApproval: false,
    inputOutput: {
      inputs: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        }
      },
      outputs: {
        type: 'object',
        properties: {
          results: { type: 'array' }
        }
      }
    },
    sla: {
      availability: 0.99,
      latency: { p50: 100, p95: 500, p99: 1000 },
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
      provider: 'example-provider'
    }
  };

  registry.register(tool1);

  // 2. Создание Agent Runtime
  const llmConfig: LLMConfig = {
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000
  };

  const agentRuntime = new AgentRuntime(gateway, llmConfig);

  // 3. Настройка ролей агентов
  const router = agentRuntime.getRouter();
  router.registerRole({
    id: 'search-agent',
    name: 'Search Agent',
    description: 'Agent specialized in search tasks',
    capabilities: ['search', 'information-retrieval'],
    allowedTools: ['search-tool'],
    priority: 10
  });

  // 4. Настройка бюджета токенов
  const costManager = agentRuntime.getCostManager();
  costManager.setBudget('example-scenario', {
    maxPerExecution: 1000,
    maxPerDay: 10000,
    maxPerMonth: 100000
  });

  // 5. Создание спецификации сценария
  const validator = new ScenarioSpecValidator();
  const spec = validator.parse({
    version: '0.1.0',
    id: 'example-scenario',
    name: 'Example Scenario',
    goal: 'Search and retrieve information',
    triggers: [
      {
        type: TriggerType.EVENT,
        source: 'user.request'
      }
    ],
    allowedActions: [
      {
        id: 'search-tool',
        name: 'Search Tool',
        version: '1.0.0',
        riskClass: RiskClass.LOW,
        requiresApproval: false
      }
    ],
    riskClass: RiskClass.LOW
  });

  // 6. Выполнение агента
  console.log('Запуск агента...\n');

  const result = await agentRuntime.execute({
    scenarioId: 'example-scenario',
    executionId: 'exec-123',
    userId: 'user-123',
    userRoles: ['user'],
    scenarioSpec: spec,
    availableTools: [tool1],
    userIntent: 'Find information about TypeScript'
  });

  console.log('Результат выполнения:');
  console.log(`  Успешно: ${result.success}`);
  console.log(`  Вывод: ${result.output || 'N/A'}`);
  console.log(`  Tool calls выполнено: ${result.toolCallsExecuted}`);
  console.log(`  Всего токенов: ${result.totalTokens}`);
  if (result.error) {
    console.log(`  Ошибка: ${result.error.code} - ${result.error.message}`);
  }
  if (result.fallbackUsed) {
    console.log('  ⚠️  Использован fallback на deterministic workflow');
  }

  // 7. Проверка статистики использования
  console.log('\nСтатистика использования токенов:');
  const stats = costManager.getUsageStats('example-scenario');
  console.log(`  Выполнение: ${stats.execution}/${stats.limitExecution}`);
  console.log(`  День: ${stats.day}/${stats.limitDay}`);
  console.log(`  Месяц: ${stats.month}/${stats.limitMonth}`);
}

main().catch(console.error);
