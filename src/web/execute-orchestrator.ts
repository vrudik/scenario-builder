/**
 * Скрипт для выполнения Orchestrator из командной строки
 * Используется server.cjs для выполнения запросов
 */

import { Orchestrator, ExecutionContext } from '../runtime/orchestrator';
import { AgentRuntime, LLMConfig } from '../agent/agent-runtime';
import { ToolGateway } from '../gateway/tool-gateway';
import { ToolRegistry } from '../registry/tool-registry';
import { ScenarioBuilder } from '../builder/scenario-builder';
import { ScenarioSpecValidator, TriggerType, RiskClass } from '../spec/scenario-spec';
import { WorkflowNode } from '../builder/workflow-graph';
import { registerAllTools } from '../tools';
import { KafkaEventBus, IEventBus } from '../events';
import { ExecutionRepository, NodeExecutionRepository } from '../db/repositories';
import * as fs from 'fs';

// Перенаправляем все логи в stderr

console.log = (...args: any[]) => {
  process.stderr.write('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.warn = (...args: any[]) => {
  process.stderr.write('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.error = (...args: any[]) => {
  process.stderr.write('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.info = (...args: any[]) => {
  process.stderr.write('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

async function main() {
  try {
    // Читаем данные запроса из файла
    const requestFile = process.argv[2];
    if (!requestFile) {
      throw new Error('Request file not provided');
    }
    
    const requestData = JSON.parse(fs.readFileSync(requestFile, 'utf-8'));
    const { scenarioId, userIntent, workflowType = 'agent-only' } = requestData;
    
    if (!scenarioId || !userIntent) {
      throw new Error('scenarioId and userIntent are required');
    }
    
    // Инициализация компонентов
    const registry = new ToolRegistry();
    const gateway = new ToolGateway();
    registerAllTools(registry, gateway);
    
    // Создание Agent Runtime
    const llmConfig: LLMConfig = {
      provider: 'ollama',
      model: 'llama3.2:1b',
      baseUrl: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 2000
    };
    const agentRuntime = new AgentRuntime(gateway, llmConfig);
    
    // Создание Event Bus (опционально, если Kafka настроен)
    let eventBus: IEventBus | undefined;
    const kafkaBrokers = process.env.KAFKA_BROKERS || 'localhost:9092';
    const enableEventBus = process.env.ENABLE_EVENT_BUS !== 'false'; // По умолчанию включен, если не отключен явно
    
    if (enableEventBus) {
      try {
        eventBus = new KafkaEventBus({
          brokers: kafkaBrokers.split(','),
          clientId: 'scenario-builder-orchestrator',
          groupId: 'orchestrator-consumer',
          enableIdempotence: true
        });
        await eventBus.connect();
        console.log(`[Orchestrator] Event Bus connected to Kafka: ${kafkaBrokers}`);
      } catch (error) {
        console.warn(`[Orchestrator] Failed to connect to Event Bus (Kafka). Continuing without event bus:`, error instanceof Error ? error.message : String(error));
        // Продолжаем выполнение без Event Bus
        eventBus = undefined;
      }
    }
    
    // Инициализация репозиториев БД (опционально)
    let executionRepository: ExecutionRepository | undefined;
    let nodeExecutionRepository: NodeExecutionRepository | undefined;
    
    try {
      // Проверяем доступность БД через переменную окружения
      if (process.env.DATABASE_URL || process.env.ENABLE_DB !== 'false') {
        executionRepository = new ExecutionRepository();
        nodeExecutionRepository = new NodeExecutionRepository();
        console.log('[Orchestrator] Database repositories initialized');
      }
    } catch (error) {
      console.warn(`[Orchestrator] Failed to initialize database repositories. Continuing without DB:`, error instanceof Error ? error.message : String(error));
      // Продолжаем выполнение без БД
    }
    
    // Создание Orchestrator
    const orchestrator = new Orchestrator(
      gateway,
      agentRuntime,
      registry,
      eventBus,
      executionRepository,
      nodeExecutionRepository
    );
    
    // Создание спецификации сценария
    const validator = new ScenarioSpecValidator();
    const spec = validator.parse({
      version: '0.1.0',
      id: scenarioId,
      name: 'Orchestrator Test Scenario',
      goal: 'Process user request using orchestrator',
      triggers: [
        {
          type: TriggerType.EVENT,
          source: 'user.request'
        }
      ],
      allowedActions: [
        {
          id: 'web-search-tool',
          name: 'Web Search Tool',
          version: '1.0.0',
          riskClass: RiskClass.LOW,
          requiresApproval: false
        },
        {
          id: 'api-call-tool',
          name: 'API Call Tool',
          version: '1.0.0',
          riskClass: RiskClass.MEDIUM,
          requiresApproval: false
        }
      ],
      riskClass: RiskClass.LOW
    });
    
    // Компиляция Spec → Workflow Graph
    const builder = new ScenarioBuilder();
    let workflowGraph = builder.compile(spec);
    
    // Добавляем agent узел в зависимости от типа workflow
    const agentNode: WorkflowNode = {
      id: 'agent-node',
      type: 'agent',
      agentConfig: {
        userIntent,
        allowedTools: ['web-search-tool', 'api-call-tool']
      },
      timeout: 60000,
      retry: {
        maxAttempts: 1,
        backoff: 'fixed',
        initialDelay: 1000
      }
    };
    
    // Модифицируем workflow в зависимости от типа
    if (workflowType === 'agent-only') {
      // Простой workflow: start → agent → end
      workflowGraph.nodes.push(agentNode);
      workflowGraph.edges = [
        { from: 'start', to: 'agent-node' },
        { from: 'agent-node', to: 'end' }
      ];
    } else if (workflowType === 'action-agent') {
      // Action → Agent
      // Создаем action узел с web-search-tool
      const actionNode: WorkflowNode = {
        id: 'action-web-search',
        type: 'action',
        toolId: 'web-search-tool',
        timeout: 30000,
        retry: {
          maxAttempts: 2,
          backoff: 'exponential',
          initialDelay: 1000
        }
      };
      workflowGraph.nodes.push(actionNode);
      workflowGraph.nodes.push(agentNode);
      workflowGraph.edges = [
        { from: 'start', to: 'action-web-search' },
        { from: 'action-web-search', to: 'agent-node' },
        { from: 'agent-node', to: 'end' }
      ];
    } else if (workflowType === 'agent-action') {
      // Agent → Action
      // Создаем action узел с api-call-tool
      const actionNode: WorkflowNode = {
        id: 'action-api-call',
        type: 'action',
        toolId: 'api-call-tool',
        timeout: 30000,
        retry: {
          maxAttempts: 2,
          backoff: 'exponential',
          initialDelay: 1000
        }
      };
      workflowGraph.nodes.push(agentNode);
      workflowGraph.nodes.push(actionNode);
      workflowGraph.edges = [
        { from: 'start', to: 'agent-node' },
        { from: 'agent-node', to: 'action-api-call' },
        { from: 'action-api-call', to: 'end' }
      ];
    } else if (workflowType === 'full') {
      // Полный workflow: Action → Agent → Action
      const actionNode1: WorkflowNode = {
        id: 'action-web-search',
        type: 'action',
        toolId: 'web-search-tool',
        timeout: 30000,
        retry: {
          maxAttempts: 2,
          backoff: 'exponential',
          initialDelay: 1000
        }
      };
      const actionNode2: WorkflowNode = {
        id: 'action-api-call',
        type: 'action',
        toolId: 'api-call-tool',
        timeout: 30000,
        retry: {
          maxAttempts: 2,
          backoff: 'exponential',
          initialDelay: 1000
        }
      };
      workflowGraph.nodes.push(actionNode1);
      workflowGraph.nodes.push(agentNode);
      workflowGraph.nodes.push(actionNode2);
      workflowGraph.edges = [
        { from: 'start', to: 'action-web-search' },
        { from: 'action-web-search', to: 'agent-node' },
        { from: 'agent-node', to: 'action-api-call' },
        { from: 'action-api-call', to: 'end' }
      ];
    }
    
    // Создание контекста выполнения
    const executionContext: ExecutionContext = {
      scenarioId: spec.id,
      executionId: `exec-${Date.now()}`,
      workflowGraph,
      spec,
      userId: 'web-user',
      userRoles: ['user'],
      traceId: `trace-${Date.now()}`,
      spanId: `span-${Date.now()}`,
      startedAt: new Date()
    };
    
    // Выполнение workflow
    const executionId = await orchestrator.startExecution(executionContext);
    
    // Получение состояния выполнения
    const state = orchestrator.getExecutionState(executionId);
    const eventHistory = orchestrator.getEventHistory(executionId);
    
    // Формируем результат
    const result = {
      success: state ? state.completed : false,
      executionId,
      currentNodeId: state?.currentNodeId || 'unknown',
      completed: state?.completed || false,
      failed: state?.failed || false,
      error: state?.error,
      nodeResults: state ? Array.from(state.nodeResults.values()).map(nr => ({
        nodeId: nr.nodeId,
        state: nr.state,
        outputs: nr.outputs,
        error: nr.error,
        startedAt: nr.startedAt.toISOString(),
        completedAt: nr.completedAt?.toISOString()
      })) : [],
      eventHistory: eventHistory.map(e => ({
        type: e.type,
        nodeId: e.nodeId,
        data: e.data,
        timestamp: e.timestamp.toISOString()
      })),
      eventBusEnabled: eventBus ? eventBus.isConnected() : false
    };
    
    // Отключаем Event Bus перед завершением
    if (eventBus && eventBus.isConnected()) {
      try {
        await eventBus.disconnect();
      } catch (error) {
        console.warn(`[Orchestrator] Error disconnecting Event Bus:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    // Выводим результат в stdout
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const errorResult = {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    };
    process.stdout.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

main().catch((error) => {
  const errorResult = {
    success: false,
    error: {
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
  };
  process.stdout.write(JSON.stringify(errorResult) + '\n');
  process.exit(1);
});
