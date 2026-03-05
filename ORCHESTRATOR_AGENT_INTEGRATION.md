# Интеграция Agent Runtime с Runtime Orchestrator

## Обзор

Интеграция позволяет использовать Agent Runtime как узел в workflow, выполняемом через Runtime Orchestrator. Это обеспечивает полный цикл выполнения сценариев с поддержкой агентов.

## Архитектура

```
Scenario Spec → Scenario Builder → Workflow Graph
                                      ↓
                              Runtime Orchestrator
                                      ↓
                              ┌───────┴───────┐
                              │               │
                         Action Node    Agent Node
                              │               │
                         Tool Gateway   Agent Runtime
                              │               │
                         Real Tools     Tool Calling
```

## Компоненты

### 1. WorkflowNode с типом 'agent'

```typescript
{
  id: 'agent-node',
  type: 'agent',
  agentConfig: {
    userIntent: 'Find information about TypeScript',
    roleId: 'general-agent', // опционально
    allowedTools: ['web-search-tool', 'api-call-tool']
  },
  timeout: 60000,
  retry: {
    maxAttempts: 1,
    backoff: 'fixed',
    initialDelay: 1000
  }
}
```

### 2. Orchestrator.executeAgentNode()

Метод выполняет агента через Agent Runtime:
- Получает userIntent из конфигурации узла или из outputs предыдущих узлов
- Фильтрует доступные инструменты по allowedTools
- Создает контекст выполнения агента
- Выполняет агента через Agent Runtime
- Возвращает результат в формате NodeExecutionResult

### 3. Передача данных между узлами

- **От action к agent**: outputs предыдущего узла используются для формирования userIntent
- **От agent к следующему узлу**: outputs агента (output, toolCallsExecuted, totalTokens) доступны следующим узлам

## Использование

### Пример 1: Простой workflow с агентом

```typescript
import { Orchestrator } from './src/runtime/orchestrator';
import { AgentRuntime } from './src/agent/agent-runtime';
import { ToolGateway } from './src/gateway/tool-gateway';
import { ToolRegistry } from './src/registry/tool-registry';
import { registerAllTools } from './src/tools';

// Инициализация
const registry = new ToolRegistry();
const gateway = new ToolGateway();
registerAllTools(registry, gateway);

const agentRuntime = new AgentRuntime(gateway, llmConfig);
const orchestrator = new Orchestrator(gateway, agentRuntime, registry);

// Workflow с agent узлом
const workflowGraph = {
  nodes: [
    { id: 'start', type: 'start' },
    {
      id: 'agent-node',
      type: 'agent',
      agentConfig: {
        userIntent: 'Find information about TypeScript',
        allowedTools: ['web-search-tool']
      }
    },
    { id: 'end', type: 'end' }
  ],
  edges: [
    { from: 'start', to: 'agent-node' },
    { from: 'agent-node', to: 'end' }
  ]
};

// Выполнение
const executionId = await orchestrator.startExecution({
  scenarioId: 'test-scenario',
  executionId: 'exec-123',
  workflowGraph,
  spec,
  userId: 'user-1',
  userRoles: ['user'],
  traceId: 'trace-123',
  spanId: 'span-123',
  startedAt: new Date()
});
```

### Пример 2: Workflow с action → agent → action

```typescript
const workflowGraph = {
  nodes: [
    { id: 'start', type: 'start' },
    {
      id: 'search-action',
      type: 'action',
      toolId: 'web-search-tool'
    },
    {
      id: 'agent-node',
      type: 'agent',
      agentConfig: {
        // userIntent будет получен из outputs search-action
        allowedTools: ['api-call-tool']
      }
    },
    { id: 'end', type: 'end' }
  ],
  edges: [
    { from: 'start', to: 'search-action' },
    { from: 'search-action', to: 'agent-node' },
    { from: 'agent-node', to: 'end' }
  ]
};
```

## Особенности

1. **Автоматическое получение userIntent**: Если userIntent не указан в agentConfig, он извлекается из outputs предыдущего узла
2. **Фильтрация инструментов**: Агент получает только те инструменты, которые указаны в allowedTools или в spec.allowedActions
3. **Retry поддержка**: Агенты поддерживают retry механизм, хотя обычно не требуют его
4. **Компенсация**: Agent узлы добавляются в стек компенсации для saga pattern
5. **Трассировка**: Все выполнение агента трассируется через OpenTelemetry

## Ограничения

- Agent узлы требуют Agent Runtime в конструкторе Orchestrator
- Инструменты должны быть зарегистрированы в ToolRegistry
- userIntent должен быть строкой или извлекаться из предыдущих узлов

## Следующие шаги

1. Автоматическая генерация agent узлов в ScenarioBuilder на основе spec
2. Поддержка параллельного выполнения нескольких агентов
3. Интеграция с Temporal для durable execution
4. Поддержка условных переходов на основе результатов агента
