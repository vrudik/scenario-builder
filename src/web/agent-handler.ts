/**
 * Обработчик запросов Agent Runtime для веб-сервера
 */

import { AgentRuntime, LLMConfig } from '../agent/agent-runtime';
import { ToolGateway } from '../gateway/tool-gateway';
import { ToolRegistry, RegisteredTool } from '../registry/tool-registry';
import { ScenarioSpecValidator, TriggerType, RiskClass } from '../spec/scenario-spec';
import { getLogger } from '../observability/logger';
import { registerAllTools } from '../tools';

const logger = getLogger({ serviceName: 'agent-handler' });

// Глобальные экземпляры для переиспользования
let globalRegistry: ToolRegistry | null = null;
let globalGateway: ToolGateway | null = null;

/**
 * Создание Agent Runtime с настройками по умолчанию
 */
export function createAgentRuntime(): AgentRuntime {
  // Используем глобальные экземпляры для переиспользования зарегистрированных инструментов
  if (!globalRegistry || !globalGateway) {
    globalRegistry = new ToolRegistry();
    globalGateway = new ToolGateway();
    
    // Регистрация всех реальных инструментов
    registerAllTools(globalRegistry, globalGateway);
  }

  // Конфигурация LLM с Ollama
  const llmConfig: LLMConfig = {
    provider: 'ollama',
    model: 'llama3.2:1b',
    baseUrl: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2000
  };

  const agentRuntime = new AgentRuntime(globalGateway, llmConfig);

  // Настройка ролей
  const router = agentRuntime.getRouter();
  router.registerRole({
    id: 'general-agent',
    name: 'General Agent',
    description: 'General purpose agent',
    capabilities: ['general', 'information'],
    allowedTools: ['web-search-tool', 'database-query-tool', 'api-call-tool'],
    priority: 10
  });

  return agentRuntime;
}

/**
 * Получение глобального registry (для использования в executeAgentRequest)
 */
export function getGlobalRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
    globalGateway = new ToolGateway();
    registerAllTools(globalRegistry, globalGateway);
  }
  return globalRegistry;
}

/**
 * Выполнение запроса через Agent Runtime
 */
export async function executeAgentRequest(
  userIntent: string,
  scenarioId: string = 'web-scenario'
): Promise<{
  success: boolean;
  output?: string;
  toolCallsExecuted: number;
  totalTokens: number;
  error?: { code: string; message: string };
  fallbackUsed?: boolean;
}> {
  try {
    const agentRuntime = createAgentRuntime();
    const registry = getGlobalRegistry();

    // Создание спецификации сценария с новыми инструментами
    const validator = new ScenarioSpecValidator();
    const allTools = registry.getAll();
    const spec = validator.parse({
      version: '0.1.0',
      id: scenarioId,
      name: 'Web Scenario',
      goal: 'Process user request',
      triggers: [
        {
          type: TriggerType.EVENT,
          source: 'user.request'
        }
      ],
      allowedActions: allTools.map(tool => ({
        id: tool.id,
        name: tool.name,
        version: tool.version,
        riskClass: tool.riskClass,
        requiresApproval: tool.requiresApproval
      })),
      riskClass: RiskClass.LOW
    });

    // Выполнение агента с реальными инструментами
    const result = await agentRuntime.execute({
      scenarioId,
      executionId: `exec-${Date.now()}`,
      userId: 'web-user',
      userRoles: ['user'],
      scenarioSpec: spec,
      availableTools: allTools,
      userIntent
    });

    return {
      success: result.success,
      output: result.output,
      toolCallsExecuted: result.toolCallsExecuted,
      totalTokens: result.totalTokens,
      error: result.error,
      fallbackUsed: result.fallbackUsed
    };
  } catch (error) {
    return {
      success: false,
      toolCallsExecuted: 0,
      totalTokens: 0,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}
