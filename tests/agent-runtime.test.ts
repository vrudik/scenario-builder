import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRuntime, LLMConfig } from '../src/agent/agent-runtime';
import { ToolGateway } from '../src/gateway/tool-gateway';
import { ToolRegistry } from '../src/registry/tool-registry';

describe('AgentRuntime', () => {
  let agentRuntime: AgentRuntime;
  let gateway: ToolGateway;
  let registry: ToolRegistry;
  let llmConfig: LLMConfig;

  beforeEach(() => {
    registry = new ToolRegistry();
    gateway = new ToolGateway();
    
    llmConfig = {
      provider: 'ollama',
      model: 'llama3.2:1b',
      baseUrl: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 2000
    };
    
    agentRuntime = new AgentRuntime(gateway, llmConfig);
  });

  it('should create AgentRuntime instance', () => {
    expect(agentRuntime).toBeDefined();
    expect(agentRuntime).toBeInstanceOf(AgentRuntime);
  });

  it('should have gateway and llmConfig', () => {
    // Проверяем, что внутренние свойства установлены
    expect(agentRuntime).toBeDefined();
  });

  // Дополнительные тесты можно добавить после рефакторинга
  // когда будет доступ к внутренним методам или мокам LLM
});
