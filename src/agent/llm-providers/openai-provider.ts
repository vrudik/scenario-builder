/**
 * OpenAI Chat Completions (tools) для Agent Runtime.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { LLMMessage, LLMResponse, LLMToolCall } from '../agent-runtime';
import { RegisteredTool } from '../../registry';

export interface OpenAIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

function inputsToParametersSchema(inputs: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties:
      inputs && typeof inputs === 'object' && !Array.isArray(inputs)
        ? (inputs as Record<string, unknown>)
        : {},
    additionalProperties: true
  };
}

function buildTools(availableTools?: RegisteredTool[]): ChatCompletionTool[] | undefined {
  if (!availableTools?.length) return undefined;
  return availableTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.id,
      description: t.name || t.id,
      parameters: inputsToParametersSchema(t.inputOutput.inputs)
    }
  }));
}

function toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: m.content });
      continue;
    }
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
      continue;
    }
    if (m.role === 'tool') {
      if (!m.toolCallId) continue;
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content
      });
      continue;
    }
    if (m.role === 'assistant') {
      const tc = m.toolCalls;
      if (tc && tc.length > 0) {
        out.push({
          role: 'assistant',
          content: m.content?.trim() ? m.content : null,
          tool_calls: tc.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: {
              name: c.function.name,
              arguments: c.function.arguments
            }
          }))
        });
      } else {
        out.push({ role: 'assistant', content: m.content });
      }
    }
  }
  return out;
}

export class OpenAIProvider {
  private client: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: OpenAIProviderConfig) {
    const key = config.apiKey ?? process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      throw new Error('OpenAI: set OPENAI_API_KEY or pass apiKey in OpenAIProviderConfig');
    }
    this.client = new OpenAI({
      apiKey: key,
      baseURL: config.baseUrl?.trim() || undefined
    });
    this.model = config.model;
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2000;
  }

  async call(
    messages: LLMMessage[],
    availableTools?: RegisteredTool[]
  ): Promise<LLMResponse> {
    const tools = buildTools(availableTools);
    const openaiMessages = toOpenAIMessages(messages);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
      temperature: this.temperature,
      max_tokens: this.maxTokens
    });

    const choice = completion.choices[0];
    const msg = choice?.message;
    const toolCalls: LLMToolCall[] = [];
    if (msg?.tool_calls?.length) {
      for (const c of msg.tool_calls) {
        if (c.type !== 'function') continue;
        toolCalls.push({
          id: c.id,
          type: 'function',
          function: {
            name: c.function.name,
            arguments: c.function.arguments || '{}'
          }
        });
      }
    }

    const content = msg?.content?.trim() ? msg.content : undefined;
    const finishReason = choice?.finish_reason;

    let mappedFinish: LLMResponse['finishReason'] = 'stop';
    if (finishReason === 'length') mappedFinish = 'length';
    else if (finishReason === 'tool_calls' || toolCalls.length > 0) mappedFinish = 'tool_calls';

    const u = completion.usage;
    const usage = u
      ? {
          promptTokens: u.prompt_tokens,
          completionTokens: u.completion_tokens,
          totalTokens: u.total_tokens
        }
      : undefined;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: mappedFinish,
      usage
    };
  }
}
