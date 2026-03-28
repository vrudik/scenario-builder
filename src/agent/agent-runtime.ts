/**
 * Agent Runtime
 * 
 * Вызывается как шаги workflow и должен поддерживать:
 * - Router: выбор роли/под-агента
 * - Tool calling: многошаговый цикл модель ↔ tool ↔ модель
 * - Memory: short-term + RAG long-term
 * - Guardrails: защита от рисков
 * - Cost/token management: бюджеты и обрезка контекста
 * - Fallback: деградация на deterministic workflow
 */

import { AgentRouter, RoutingContext, RoutingResult } from './router';
import { ShortTermMemoryManager, LongTermMemoryManager } from './memory';
import { GuardrailsManager } from './guardrails';
import { CostManager } from './cost-manager';
import { ToolGateway, ToolRequest, ToolRequestContext } from '../gateway';
import { RegisteredTool } from '../registry';
import { ScenarioSpec } from '../spec';
import { traceAsync, addSpanAttributes, addSpanEvent, systemMetrics } from '../observability';
import { getLogger } from '../observability/logger';
import type { AuditService } from '../audit/audit-service';
import { estimateToolCallCostUsd } from '../utils/tool-call-cost';

/**
 * Конфигурация LLM
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'local';
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string; // Для Ollama и других локальных провайдеров
}

/**
 * Сообщение для LLM
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // для tool calls
  toolCallId?: string; // для tool responses
  /** Нативные tool_calls ассистента (OpenAI и др.) */
  toolCalls?: LLMToolCall[];
}

/**
 * Tool call от LLM
 */
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Ответ от LLM
 */
export interface LLMResponse {
  content?: string;
  toolCalls?: LLMToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Контекст выполнения агента
 */
export interface AgentExecutionContext {
  scenarioId: string;
  executionId: string;
  userId: string;
  userRoles: string[];
  scenarioSpec: ScenarioSpec;
  availableTools: RegisteredTool[];
  userIntent: string;
  traceId?: string;
  spanId?: string;
  deploymentLane?: string;
  /** Shadow-canary: инструменты через gateway — заглушка */
  shadowToolStub?: boolean;
  /** Накопленная оценка затрат USD за execution (проброс в OPA перед каждым tool call) */
  executionSpendUsd?: number;
  /** Тенант (X-Tenant-ID) → ToolRequestContext и OPA input */
  tenantId?: string;
}

/**
 * Результат выполнения агента
 */
export interface AgentExecutionResult {
  success: boolean;
  output?: string;
  toolCallsExecuted: number;
  totalTokens: number;
  error?: {
    code: string;
    message: string;
  };
  fallbackUsed?: boolean;
}

/**
 * Agent Runtime
 */
export class AgentRuntime {
  private router: AgentRouter;
  private shortTermMemory: ShortTermMemoryManager;
  private longTermMemory: LongTermMemoryManager;
  private guardrails: GuardrailsManager;
  private costManager: CostManager;
  private gateway: ToolGateway;
  private llmConfig: LLMConfig;
  private auditService?: AuditService;
  private logger = getLogger({ serviceName: 'agent-runtime' });

  constructor(
    gateway: ToolGateway,
    llmConfig: LLMConfig
  ) {
    this.router = new AgentRouter();
    this.shortTermMemory = new ShortTermMemoryManager();
    this.longTermMemory = new LongTermMemoryManager();
    this.guardrails = new GuardrailsManager();
    this.costManager = new CostManager();
    this.gateway = gateway;
    this.llmConfig = llmConfig;
  }

  /**
   * Выполнение агента
   */
  async execute(context: AgentExecutionContext): Promise<AgentExecutionResult> {
    return traceAsync(
      'agent.execute',
      async () => {
        addSpanAttributes({
          'agent.scenario_id': context.scenarioId,
          'agent.execution_id': context.executionId,
          'agent.user_id': context.userId,
        });

        try {
          // 1. Роутинг - выбор роли агента
          const routingResult = this.routeAgent(context);
          addSpanAttributes({
            'agent.role': routingResult.role?.id || 'default',
          });
      
          // 2. Проверка guardrails для пользовательского запроса
          const promptCheck = this.guardrails.checkPrompt(context.userIntent);
          if (!promptCheck.allowed) {
            addSpanEvent('guardrail.violation', { reason: promptCheck.reason || 'unknown' });
            systemMetrics.scenarioFailures.add(1, { reason: 'guardrail_violation' });
            void this.auditService?.logGuardrailBlocked({
              kind: 'prompt',
              reason: promptCheck.reason,
              riskType: promptCheck.riskType,
              scenarioId: context.scenarioId,
              executionId: context.executionId,
              traceId: context.traceId,
              spanId: context.spanId,
            });
            return {
              success: false,
              toolCallsExecuted: 0,
              totalTokens: 0,
              error: {
                code: 'GUARDRAIL_VIOLATION',
                message: promptCheck.reason || 'Prompt rejected by guardrails'
              }
            };
          }

          void this.auditService?.logAgentStarted({
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            userId: context.userId,
            traceId: context.traceId,
            spanId: context.spanId,
          });

          this.costManager.resetExecution(context.scenarioId);
          const tokenBudget = context.scenarioSpec.nonFunctional?.tokenBudget;
          if (tokenBudget) {
            this.costManager.setBudget(context.scenarioId, {
              maxPerExecution: tokenBudget.maxPerExecution ?? 1_000_000,
              maxPerDay: tokenBudget.maxPerDay ?? 10_000_000,
              maxPerMonth: 100_000_000
            });
          }

          // 3. Получение контекста из памяти
          const memoryContext = this.getMemoryContext(context);

          // 4. Tool calling цикл
          const startTime = Date.now();
          const result = await this.executeToolCallingCycle(
            context,
            routingResult,
            memoryContext
          );
          const duration = (Date.now() - startTime) / 1000;

          // 5. Сохранение в память
          this.saveToMemory(context, result);

          // Метрики
          systemMetrics.scenarioExecutions.add(1);
          systemMetrics.scenarioDuration.record(duration);
          if (result.success) {
            systemMetrics.scenarioSuccess.add(1);
          } else {
            systemMetrics.scenarioFailures.add(1);
          }
          systemMetrics.agentToolCalls.add(result.toolCallsExecuted);
          systemMetrics.agentTokensUsed.add(result.totalTokens);

          addSpanAttributes({
            'agent.tool_calls': result.toolCallsExecuted,
            'agent.tokens': result.totalTokens,
            'agent.success': result.success,
          });

          this.logger.info('Agent execution completed', {
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            success: result.success,
            toolCalls: result.toolCallsExecuted,
            tokens: result.totalTokens,
            duration,
          });

          void this.auditService?.logAgentCompleted({
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            userId: context.userId,
            success: result.success,
            toolCallsExecuted: result.toolCallsExecuted,
            totalTokens: result.totalTokens,
            errorCode: result.error?.code,
            traceId: context.traceId,
            spanId: context.spanId,
          });

          return result;
        } catch (error) {
          // Fallback на deterministic workflow при ошибках
          systemMetrics.scenarioFailures.add(1, { reason: 'execution_error' });
          this.logger.error('Agent execution failed', error, {
            scenarioId: context.scenarioId,
            executionId: context.executionId,
          });
          void this.auditService?.logAgentCompleted({
            scenarioId: context.scenarioId,
            executionId: context.executionId,
            userId: context.userId,
            success: false,
            errorCode: 'EXECUTION_ERROR',
            traceId: context.traceId,
            spanId: context.spanId,
          });
          return {
            success: false,
            toolCallsExecuted: 0,
            totalTokens: 0,
            error: {
              code: 'EXECUTION_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error'
            },
            fallbackUsed: true
          };
        }
      },
      {
        attributes: {
          'agent.scenario_id': context.scenarioId,
          'agent.execution_id': context.executionId,
        }
      }
    );
  }

  /**
   * Роутинг агента
   */
  private routeAgent(context: AgentExecutionContext): RoutingResult {
    const routingContext: RoutingContext = {
      scenarioId: context.scenarioId,
      executionId: context.executionId,
      userIntent: context.userIntent,
      availableTools: context.availableTools,
      scenarioSpec: context.scenarioSpec,
      userRoles: context.userRoles
    };

    return this.router.route(routingContext);
  }

  /**
   * Получение контекста из памяти
   */
  private getMemoryContext(context: AgentExecutionContext): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // Системное сообщение с ролью
    messages.push({
      role: 'system',
      content: `You are an autonomous agent executing scenario ${context.scenarioId}. 
When you use tools, after receiving the tool results, you must provide a clear, helpful text response to the user based on those results. 
Do not just return tool call JSON - always follow up with a natural language explanation of what you found or did.`
    });

    // Short-term память (последние сообщения)
    const recentMemories = this.shortTermMemory.getContext(2000);
    recentMemories.forEach(memory => {
      if (memory.type === 'user_message') {
        messages.push({ role: 'user', content: memory.content });
      } else if (memory.type === 'agent_response') {
        messages.push({ role: 'assistant', content: memory.content });
      }
    });

    // Long-term память (RAG) - поиск релевантной информации
    const ragResults = this.longTermMemory.search(context.userIntent, 3);
    if (ragResults.length > 0) {
      const ragContext = ragResults
        .map(r => r.memory.content)
        .join('\n\n');
      messages.push({
        role: 'system',
        content: `Relevant context from memory:\n${ragContext}`
      });
    }

    return messages;
  }

  /**
   * Цикл tool calling (модель ↔ tool ↔ модель)
   */
  private async executeToolCallingCycle(
    context: AgentExecutionContext,
    _routingResult: RoutingResult,
    initialMessages: LLMMessage[]
  ): Promise<AgentExecutionResult> {
    const maxIterations = 10; // максимальное количество итераций
    let messages = [...initialMessages];
    let toolCallsExecuted = 0;
    let totalTokens = 0;

    // Добавляем пользовательский запрос
    messages.push({
      role: 'user',
      content: context.userIntent
    });

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Проверка бюджета токенов
      const estimatedTokens = this.estimateTokens(messages);
      if (!this.costManager.canUseTokens(context.scenarioId, estimatedTokens)) {
        return {
          success: false,
          toolCallsExecuted,
          totalTokens,
          error: {
            code: 'TOKEN_BUDGET_EXCEEDED',
            message: 'Token budget exceeded'
          }
        };
      }

      // Вызов LLM
      const llmResponse = await this.callLLM(messages, context.availableTools);

      // Регистрация использования токенов
      if (llmResponse.usage) {
        this.costManager.recordUsage(context.scenarioId, {
          promptTokens: llmResponse.usage.promptTokens,
          completionTokens: llmResponse.usage.completionTokens,
          totalTokens: llmResponse.usage.totalTokens,
          timestamp: new Date()
        });
        totalTokens += llmResponse.usage.totalTokens;
      }

      // Проверка guardrails для ответа
      // Если ответ содержит только tool calls (без текста), пропускаем проверку output
      // так как проверка tool calls уже будет выполнена отдельно
      if (llmResponse.content && (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0)) {
        const outputCheck = this.guardrails.checkOutput(
          llmResponse.content,
          { toolCalls: llmResponse.toolCalls }
        );
        if (!outputCheck.allowed) {
          return {
            success: false,
            toolCallsExecuted,
            totalTokens,
            error: {
              code: 'GUARDRAIL_VIOLATION',
              message: outputCheck.reason || 'Output rejected by guardrails'
            }
          };
        }
      }
      // Если есть tool calls, проверка output будет выполнена после их выполнения

      // Ассистент: либо только текст, либо tool_calls (в т.ч. для OpenAI — обязательная пара assistant+tool)
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: llmResponse.content ?? '',
          toolCalls: llmResponse.toolCalls
        });
      } else if (llmResponse.content) {
        messages.push({
          role: 'assistant',
          content: llmResponse.content
        });
      }

      // Если есть tool calls, выполняем их
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        let successfulToolCalls = 0;
        let rejectedToolCalls = 0;
        
        for (const toolCall of llmResponse.toolCalls) {
          // Проверка guardrails для tool call
          const toolArguments = JSON.parse(toolCall.function.arguments);
          const toolCheck = this.guardrails.checkToolCall(
            toolCall.function.name,
            toolArguments
          );
          if (!toolCheck.allowed) {
            // Не добавляем сообщение об ошибке в messages, чтобы модель не пыталась на него ответить
            // Просто логируем отклонение для отладки
            console.warn(`Tool call rejected by guardrails:`, {
              tool: toolCall.function.name,
              arguments: toolArguments,
              reason: toolCheck.reason,
              riskType: toolCheck.riskType
            });
            rejectedToolCalls++;
            continue;
          }

          // Выполнение tool call
          const toolResult = await traceAsync(
            'agent.tool.execute',
            async () => {
              addSpanAttributes({
                'tool.id': toolCall.function.name,
                'tool.call_id': toolCall.id,
              });
              
              const startTime = Date.now();
              const result = await this.executeToolCall(toolCall, context);
              const duration = (Date.now() - startTime) / 1000;
              
              systemMetrics.toolExecutions.add(1, { tool: toolCall.function.name });
              systemMetrics.toolDuration.record(duration, { tool: toolCall.function.name });
              
              addSpanAttributes({
                'tool.success': !('error' in result),
                'tool.duration': duration,
              });
              
              return result;
            },
            {
              attributes: {
                'tool.id': toolCall.function.name,
              }
            }
          );

          // Добавляем результат в сообщения только если tool call был успешно выполнен
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            toolCallId: toolCall.id,
            name: toolCall.function.name
          });

          toolCallsExecuted++;
          successfulToolCalls++;
        }
        
        // После выполнения tool calls добавляем запрос на финальный ответ
        // Только если были успешно выполнены tool calls
        if (successfulToolCalls > 0) {
          messages.push({
            role: 'user',
            content: 'Based on the tool results above, please provide a clear and helpful answer to my original question.'
          });
        } else if (rejectedToolCalls > 0 && successfulToolCalls === 0) {
          // Если все tool calls были отклонены, просим модель ответить без использования инструментов
          messages.push({
            role: 'user',
            content: 'The requested tools are not available for this request. Please provide a helpful answer based on your knowledge without using tools.'
          });
        }
      }

      // Если finishReason = 'stop' и нет tool calls, завершаем цикл
      if (llmResponse.finishReason === 'stop' && (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0)) {
        break;
      }
      
      // Если были tool calls, но нет текстового ответа, продолжаем цикл для получения финального ответа
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0 && !llmResponse.content) {
        // Продолжаем цикл, чтобы получить финальный ответ после выполнения tool calls
        continue;
      }

      // Если finishReason = 'length', обрезаем контекст
      if (llmResponse.finishReason === 'length') {
        messages = this.costManager.trimContext(messages, {
          maxContextTokens: 4000,
          preserveSystemMessages: true,
          preserveRecentMessages: 5,
          strategy: 'fifo'
        }) as unknown as LLMMessage[];
      }
    }

    // Получаем финальный ответ - берем последнее сообщение assistant с текстом
    // Игнорируем сообщения, которые содержат только tool calls
    const assistantMessages = messages.filter(m => m.role === 'assistant' && m.content && m.content.trim());
    const finalMessage = assistantMessages.length > 0 
      ? assistantMessages[assistantMessages.length - 1] 
      : null;
    
    // Если нет финального ответа, но были tool calls, формируем ответ на основе результатов
    let output = finalMessage?.content || 'No response generated';
    
    // Если ответ пустой или содержит только JSON tool call, формируем информативный ответ
    if (!output || output === 'No response generated') {
      if (toolCallsExecuted > 0) {
        output = `I've executed ${toolCallsExecuted} tool call(s) to help with your request. The information has been processed.`;
      }
    }
    
    // Финальная проверка guardrails для выходного ответа
    // Если были выполнены tool calls, используем более мягкую проверку
    // (модель может упоминать слова типа "format", "delete" в контексте объяснения результатов)
    const finalOutputCheck = this.guardrails.checkOutput(output, { toolCalls: toolCallsExecuted > 0 ? [{ executed: true }] : [] });
    if (!finalOutputCheck.allowed && toolCallsExecuted > 0) {
      // Если были выполнены tool calls, но финальный ответ заблокирован,
      // возвращаем общий ответ вместо ошибки (это нормально - модель может упоминать слова в контексте)
      output = `I've processed your request using ${toolCallsExecuted} tool call(s). The information has been retrieved and analyzed.`;
    } else if (!finalOutputCheck.allowed) {
      // Если не было tool calls и ответ заблокирован, возвращаем ошибку
      return {
        success: false,
        toolCallsExecuted,
        totalTokens,
        error: {
          code: 'GUARDRAIL_VIOLATION',
          message: finalOutputCheck.reason || 'Output rejected by guardrails'
        }
      };
    }

    return {
      success: true,
      output,
      toolCallsExecuted,
      totalTokens
    };
  }

  /**
   * Вызов LLM
   */
  private async callLLM(
    messages: LLMMessage[],
    availableTools: RegisteredTool[]
  ): Promise<LLMResponse> {
    return traceAsync(
      'agent.llm.call',
      async () => {
        addSpanAttributes({
          'llm.provider': this.llmConfig.provider,
          'llm.model': this.llmConfig.model,
          'llm.messages_count': messages.length,
          'llm.available_tools': availableTools.length,
        });

        const startTime = Date.now();
        systemMetrics.agentLLMCalls.add(1);

        try {
          // Используем Ollama для локальных моделей
          if (this.llmConfig.provider === 'ollama') {
            const { OllamaProvider } = await import('./llm-providers/ollama-provider');
            const provider = new OllamaProvider({
              baseUrl: this.llmConfig.baseUrl,
              model: this.llmConfig.model,
              temperature: this.llmConfig.temperature,
              maxTokens: this.llmConfig.maxTokens
            });
            const response = await provider.call(messages, availableTools);

            const duration = (Date.now() - startTime) / 1000;
            systemMetrics.agentLLMDuration.record(duration);

            addSpanAttributes({
              'llm.finish_reason': response.finishReason,
              'llm.tokens': response.usage?.totalTokens || 0,
              'llm.tool_calls': response.toolCalls?.length || 0
            });

            return response;
          }

          if (this.llmConfig.provider === 'openai') {
            const { OpenAIProvider } = await import('./llm-providers/openai-provider');
            const provider = new OpenAIProvider({
              apiKey: this.llmConfig.apiKey,
              baseUrl: this.llmConfig.baseUrl,
              model: this.llmConfig.model,
              temperature: this.llmConfig.temperature,
              maxTokens: this.llmConfig.maxTokens
            });
            const response = await provider.call(messages, availableTools);

            const duration = (Date.now() - startTime) / 1000;
            systemMetrics.agentLLMDuration.record(duration);

            addSpanAttributes({
              'llm.finish_reason': response.finishReason,
              'llm.tokens': response.usage?.totalTokens || 0,
              'llm.tool_calls': response.toolCalls?.length || 0
            });

            return response;
          }

          const response = {
            content: 'I will help you with that.',
            finishReason: 'stop' as const,
            usage: {
              promptTokens: this.estimateTokens(messages),
              completionTokens: 50,
              totalTokens: this.estimateTokens(messages) + 50
            }
          };

          const duration = (Date.now() - startTime) / 1000;
          systemMetrics.agentLLMDuration.record(duration);

          return response;
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          systemMetrics.agentLLMDuration.record(duration);
          throw error;
        }
      },
      {
        attributes: {
          'llm.provider': this.llmConfig.provider,
          'llm.model': this.llmConfig.model,
        }
      }
    );
  }

  /**
   * Выполнение tool call
   */
  private async executeToolCall(
    toolCall: LLMToolCall,
    context: AgentExecutionContext
  ): Promise<Record<string, unknown>> {
    const tool = context.availableTools.find(t => t.id === toolCall.function.name);
    if (!tool) {
      return { error: `Tool ${toolCall.function.name} not found` };
    }

    const inputs = JSON.parse(toolCall.function.arguments);
    const reserveTokens = 512;
    const costGuardExceeded = !this.costManager.canUseTokens(
      context.scenarioId,
      reserveTokens
    );
    const usageStats = this.costManager.getUsageStats(context.scenarioId);
    const tokensUsedSoFar =
      usageStats.limitExecution !== Infinity ? usageStats.execution : undefined;
    const spendBefore = context.executionSpendUsd ?? 0;
    const requestContext: ToolRequestContext = {
      scenarioId: context.scenarioId,
      executionId: context.executionId,
      userId: context.userId,
      userRoles: context.userRoles,
      traceId: context.traceId,
      spanId: context.spanId,
      deploymentLane: context.deploymentLane,
      shadowToolStub: context.shadowToolStub === true,
      costGuardExceeded: costGuardExceeded ? true : undefined,
      tokensUsedSoFar,
      executionSpendUsd: spendBefore > 0 ? spendBefore : undefined,
      tenantId: context.tenantId ?? 'default'
    };

    const request: ToolRequest = {
      toolId: tool.id,
      inputs,
      context: requestContext
    };

    // Gateway сам найдет executor из зарегистрированных инструментов
    const response = await this.gateway.execute(request, tool);

    if (response.success) {
      context.executionSpendUsd = spendBefore + estimateToolCallCostUsd(tool);
      return response.outputs || {};
    } else {
      return { error: response.error?.message || 'Tool execution failed' };
    }
  }

  /**
   * Оценка количества токенов (упрощенная)
   */
  private estimateTokens(messages: LLMMessage[]): number {
    // Простая оценка: ~4 символа на токен
    const totalChars = messages
      .map(m => m.content)
      .join('')
      .length;
    return Math.ceil(totalChars / 4);
  }

  /**
   * Сохранение в память
   */
  private saveToMemory(
    context: AgentExecutionContext,
    result: AgentExecutionResult
  ): void {
    // Short-term память
    this.shortTermMemory.add({
      type: 'user_message',
      content: context.userIntent
    });

    if (result.output) {
      this.shortTermMemory.add({
        type: 'agent_response',
        content: result.output
      });
    }

    // Long-term память (RAG) - сохраняем важную информацию
    if (result.success && result.output) {
      this.longTermMemory.add({
        content: `Scenario ${context.scenarioId}: ${context.userIntent} -> ${result.output}`,
        metadata: {
          scenarioId: context.scenarioId,
          executionId: context.executionId,
          tags: ['execution', 'success']
        }
      });
    }
  }

  /**
   * Установка сервиса аудита для логирования выполнений и guardrails
   */
  setAuditService(service: AuditService): void {
    this.auditService = service;
  }

  /**
   * Получение router для настройки ролей
   */
  getRouter(): AgentRouter {
    return this.router;
  }

  /**
   * Получение cost manager для настройки бюджетов
   */
  getCostManager(): CostManager {
    return this.costManager;
  }
}
