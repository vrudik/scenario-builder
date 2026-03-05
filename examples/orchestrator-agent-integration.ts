/**
 * Пример интеграции Agent Runtime с Runtime Orchestrator
 * 
 * Демонстрирует полный цикл выполнения сценария с использованием агентов
 */

import { Orchestrator, ExecutionContext } from '../src/runtime/orchestrator';
import { AgentRuntime, LLMConfig } from '../src/agent/agent-runtime';
import { ToolGateway } from '../src/gateway/tool-gateway';
import { ToolRegistry } from '../src/registry/tool-registry';
import { ScenarioBuilder } from '../src/builder/scenario-builder';
import { ScenarioSpecValidator, TriggerType, RiskClass } from '../src/spec/scenario-spec';
import { registerAllTools } from '../src/tools';
import { traceAsync } from '../src/observability';

async function main() {
  console.log('🚀 Пример интеграции Agent Runtime с Runtime Orchestrator\n');

  // Инициализация компонентов
  const registry = new ToolRegistry();
  const gateway = new ToolGateway();
  
  // Регистрация всех инструментов
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

  // Создание Orchestrator с Agent Runtime
  const orchestrator = new Orchestrator(gateway, agentRuntime);

  // Создание спецификации сценария с agent узлом
  const validator = new ScenarioSpecValidator();
  const spec = validator.parse({
    version: '0.1.0',
    id: 'agent-workflow-scenario',
    name: 'Agent Workflow Scenario',
    goal: 'Process user request using agent',
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
  const workflowGraph = builder.compile(spec);

  // Добавляем agent узел в workflow
  // В реальной системе это будет делаться автоматически на основе spec
  const agentNode = {
    id: 'agent-node',
    type: 'agent' as const,
    agentConfig: {
      userIntent: 'Find information about TypeScript and create a summary',
      allowedTools: ['web-search-tool', 'api-call-tool']
    },
    timeout: 60000, // 60 секунд для агента
    retry: {
      maxAttempts: 1,
      backoff: 'fixed' as const,
      initialDelay: 1000
    }
  };

  // Добавляем agent узел после первого action узла
  workflowGraph.nodes.push(agentNode);
  workflowGraph.edges.push({
    from: workflowGraph.nodes.find(n => n.type === 'action')?.id || 'start',
    to: 'agent-node'
  });
  
  // Связываем agent узел с end
  workflowGraph.edges.push({
    from: 'agent-node',
    to: 'end'
  });

  // Создание контекста выполнения
  const executionContext: ExecutionContext = {
    scenarioId: spec.id,
    executionId: `exec-${Date.now()}`,
    workflowGraph,
    spec,
    userId: 'test-user',
    userRoles: ['user'],
    traceId: `trace-${Date.now()}`,
    spanId: `span-${Date.now()}`,
    startedAt: new Date()
  };

  // Выполнение workflow
  console.log('📋 Запуск выполнения workflow...\n');
  
  await traceAsync('orchestrator.execute', async (span) => {
    const executionId = await orchestrator.startExecution(executionContext);
    
    console.log(`✅ Workflow запущен: ${executionId}\n`);
    
    // Получение состояния выполнения
    const state = orchestrator.getExecutionState(executionId);
    
    if (state) {
      console.log('📊 Состояние выполнения:');
      console.log(`   Текущий узел: ${state.currentNodeId}`);
      console.log(`   Завершено: ${state.completed}`);
      console.log(`   Ошибка: ${state.failed}`);
      
      if (state.nodeResults.size > 0) {
        console.log('\n📝 Результаты узлов:');
        for (const [nodeId, nodeResult] of state.nodeResults.entries()) {
          console.log(`   ${nodeId}: ${nodeResult.state}`);
          if (nodeResult.outputs) {
            console.log(`      Outputs: ${JSON.stringify(nodeResult.outputs).substring(0, 100)}...`);
          }
        }
      }
      
      // Получение истории событий
      const history = orchestrator.getEventHistory(executionId);
      console.log(`\n📜 История событий: ${history.length} событий`);
    }
  });

  console.log('\n✅ Пример завершен!');
}

main().catch((error) => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
});
