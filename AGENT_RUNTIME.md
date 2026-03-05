# Agent Runtime

Agent Runtime - это компонент для выполнения автономных агентов с поддержкой tool calling, памяти и guardrails.

## Компоненты

### 1. Router (`router.ts`)
Выбор роли/под-агента на основе контекста и доступных инструментов.

**Основные функции:**
- Регистрация ролей агентов
- Автоматический выбор роли на основе контекста
- Приоритизация ролей

**Пример:**
```typescript
const router = new AgentRouter();
router.registerRole({
  id: 'search-agent',
  name: 'Search Agent',
  capabilities: ['search'],
  allowedTools: ['search-tool'],
  priority: 10
});

const result = router.route(context);
```

### 2. Memory (`memory.ts`)
Система памяти для агентов:
- **Short-term memory**: текущий контекст разговора
- **Long-term memory**: RAG для долгосрочного хранения

**Пример:**
```typescript
const shortTerm = new ShortTermMemoryManager();
shortTerm.add({
  type: 'user_message',
  content: 'Hello'
});

const longTerm = new LongTermMemoryManager();
longTerm.add({
  content: 'Important information',
  metadata: { scenarioId: 'scenario-1' }
});

const results = longTerm.search('information', 5);
```

### 3. Guardrails (`guardrails.ts`)
Защита от рисков LLM-приложений:
- Prompt injection
- Insecure output handling
- Excessive agency
- Unauthorized code execution

**Пример:**
```typescript
const guardrails = new GuardrailsManager();
const result = guardrails.checkPrompt(userInput);
if (!result.allowed) {
  // Отклонить запрос
}
```

### 4. Cost Manager (`cost-manager.ts`)
Управление бюджетами токенов и обрезка контекста.

**Пример:**
```typescript
const costManager = new CostManager();
costManager.setBudget('scenario-1', {
  maxPerExecution: 1000,
  maxPerDay: 10000
});

if (costManager.canUseTokens('scenario-1', 500)) {
  // Использовать токены
}
```

### 5. Agent Runtime (`agent-runtime.ts`)
Основной компонент, объединяющий все части.

**Основные функции:**
- Выполнение агента с tool calling циклом
- Интеграция с памятью (short-term + RAG)
- Проверка guardrails
- Управление токенами
- Fallback на deterministic workflow

**Пример:**
```typescript
const agentRuntime = new AgentRuntime(gateway, llmConfig);

const result = await agentRuntime.execute({
  scenarioId: 'scenario-1',
  executionId: 'exec-123',
  userId: 'user-123',
  userRoles: ['user'],
  scenarioSpec: spec,
  availableTools: tools,
  userIntent: 'Find information'
});
```

### 6. Fallback (`fallback.ts`)
Механизм деградации на deterministic workflow при проблемах.

**Пример:**
```typescript
const fallback = new FallbackManager();
const decision = fallback.shouldFallback({
  errorRate: 0.4,
  latency: 6000,
  tokenUsage: 900,
  tokenBudget: 1000,
  consecutiveErrors: 3
});

if (decision.shouldFallback) {
  const fallbackWorkflow = fallback.generateFallbackWorkflow(spec);
}
```

## Использование

См. `examples/agent-example.ts` для полного примера.

## Интеграция с LLM

Текущая реализация содержит заглушку для вызова LLM. Для интеграции с реальным провайдером (OpenAI, Anthropic и т.д.) необходимо реализовать метод `callLLM` в `agent-runtime.ts`.

## Следующие шаги

1. Интеграция с OpenAI API
2. Улучшение RAG (векторизация, semantic search)
3. Расширение guardrails
4. Метрики и мониторинг
