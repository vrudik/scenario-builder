/**
 * Ollama Provider для локальных LLM моделей
 * 
 * Использует Ollama для запуска локальных моделей, включая Qwen 2B
 */

import { LLMMessage, LLMResponse, LLMToolCall } from '../agent-runtime';
import { RegisteredTool } from '../../registry';

/**
 * Конфигурация Ollama провайдера
 */
export interface OllamaConfig {
  baseUrl?: string; // URL Ollama сервера (по умолчанию http://localhost:11434)
  model: string; // Название модели (например, 'qwen2.5:2b' или 'qwen2.5:2b-instruct')
  temperature?: number;
  maxTokens?: number;
}

/**
 * Ollama Provider
 */
export class OllamaProvider {
  private config: Required<OllamaConfig>;
  private baseUrl: string;

  constructor(config: OllamaConfig) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:11434',
      model: config.model,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2000
    };
    this.baseUrl = this.config.baseUrl;
  }

  /**
   * Вызов модели через Ollama API
   */
  async call(
    messages: LLMMessage[],
    availableTools?: RegisteredTool[]
  ): Promise<LLMResponse> {
    try {
      // Преобразуем сообщения в формат Ollama
      const ollamaMessages = this.convertMessages(messages, availableTools);

      // Формируем запрос к Ollama
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: ollamaMessages,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens
          },
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Парсим ответ
      return this.parseResponse(data);
    } catch (error) {
      throw new Error(`Failed to call Ollama: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Преобразование сообщений в формат Ollama
   */
  private convertMessages(
    messages: LLMMessage[],
    availableTools?: RegisteredTool[]
  ): Array<{ role: string; content: string }> {
    const ollamaMessages: Array<{ role: string; content: string }> = [];

    // Если есть инструменты, добавляем системное сообщение с их описанием
    if (availableTools && availableTools.length > 0) {
      const toolsDescription = this.formatToolsForPrompt(availableTools);
      ollamaMessages.push({
        role: 'system',
        content: `You are a helpful assistant with access to the following tools:\n\n${toolsDescription}\n\nWhen you need to use a tool, respond with JSON in the format: {"tool": "tool_name", "arguments": {...}}\n\nIMPORTANT: After using a tool and receiving results, you MUST provide a clear, helpful text response explaining what you found or did. Always give a natural language answer to the user's question, not just the tool call JSON.`
      });
    }

    // Преобразуем остальные сообщения
    for (const msg of messages) {
      if (msg.role === 'system') {
        ollamaMessages.push({
          role: 'system',
          content: msg.content
        });
      } else if (msg.role === 'user') {
        ollamaMessages.push({
          role: 'user',
          content: msg.content
        });
      } else if (msg.role === 'assistant') {
        ollamaMessages.push({
          role: 'assistant',
          content: msg.content
        });
      } else if (msg.role === 'tool') {
        // Ollama не поддерживает tool messages напрямую, добавляем как user message
        ollamaMessages.push({
          role: 'user',
          content: `Tool result (${msg.name}): ${msg.content}`
        });
      }
    }

    return ollamaMessages;
  }

  /**
   * Форматирование инструментов для промпта
   */
  private formatToolsForPrompt(tools: RegisteredTool[]): string {
    return tools.map(tool => {
      const inputs = JSON.stringify(tool.inputOutput.inputs, null, 2);
      return `- ${tool.id}: ${tool.name}\n  Inputs: ${inputs}`;
    }).join('\n\n');
  }

  /**
   * Парсинг ответа от Ollama
   */
  private parseResponse(data: any): LLMResponse {
    const content = data.message?.content || '';
    const toolCalls: LLMToolCall[] = [];

    // Попытка извлечь tool calls из ответа
    // Ищем JSON в формате {"tool": "...", "arguments": {...}}
    let cleanedContent = content;
    const toolCallMatch = content.match(/\{"tool":\s*"([^"]+)",\s*"arguments":\s*(\{[^}]+\})\}/);
    if (toolCallMatch) {
      const toolName = toolCallMatch[1];
      const argumentsStr = toolCallMatch[2];
      
      toolCalls.push({
        id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: argumentsStr
        }
      });
      
      // Удаляем tool call JSON из content, чтобы не показывать его пользователю
      cleanedContent = content.replace(/\{"tool":\s*"[^"]+",\s*"arguments":\s*\{[^}]+\}\}/, '').trim();
    }

    return {
      content: cleanedContent || undefined, // Если есть только tool call, content будет пустым
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : (data.done ? 'stop' : 'length'),
      usage: {
        promptTokens: this.estimateTokens(data.prompt || ''),
        completionTokens: this.estimateTokens(content),
        totalTokens: this.estimateTokens(data.prompt || '') + this.estimateTokens(content)
      }
    };
  }

  /**
   * Оценка количества токенов (упрощенная)
   */
  private estimateTokens(text: string): number {
    // Простая оценка: ~4 символа на токен
    return Math.ceil(text.length / 4);
  }

  /**
   * Проверка доступности Ollama сервера
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Получение списка доступных моделей
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      return data.models?.map((m) => m.name) || [];
    } catch (error) {
      throw new Error(`Failed to list models: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
