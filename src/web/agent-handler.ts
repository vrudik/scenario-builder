/**
 * Обработчик запросов Agent Runtime для веб-сервера
 */

import { AgentRuntime } from '../agent/agent-runtime';
import { loadLlmConfigFromEnv } from '../agent/llm-config-from-env';
import { ToolGateway } from '../gateway/tool-gateway';
import { ToolRegistry } from '../registry/tool-registry';
import { ScenarioBuilder } from '../builder/scenario-builder';
import { ScenarioSpecValidator, TriggerType, RiskClass } from '../spec/scenario-spec';
import type { ScenarioSpec } from '../spec';
import type { RegisteredTool } from '../registry';
import { registerAllTools } from '../tools';
import { OpaHttpClient } from '../policy/opa-http-client';
import { ScenarioRepository } from '../db/repositories/scenario-repository';
import { normalizeTenantId } from '../utils/tenant-id';
import { getUsageMeter } from '../services/usage-meter.js';
import { checkQuota, resolveOrgIdForTenant } from '../services/quota-enforcer.js';

export interface ExecuteAgentOptions {
  tenantId?: string;
  /** From API key; avoids extra DB lookup when set */
  orgId?: string | null;
}

function attachOpa(gateway: ToolGateway): void {
  const opaUrl = process.env.OPA_URL?.trim();
  if (!opaUrl) {
    return;
  }
  gateway.setOpaClient(
    new OpaHttpClient(opaUrl, {
      failOpen: process.env.OPA_FAIL_OPEN !== 'false',
      timeoutMs: Number.parseInt(process.env.OPA_TIMEOUT_MS || '2500', 10) || 2500
    })
  );
}

async function tryLoadScenarioSpec(
  scenarioId: string,
  tenantId: string
): Promise<ScenarioSpec | null> {
  if (process.env.ENABLE_DB === 'false') {
    return null;
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return null;
  }
  try {
    const repo = new ScenarioRepository();
    const row = await repo.findById(scenarioId, tenantId);
    return row?.spec ?? null;
  } catch {
    return null;
  }
}

function buildFallbackSpec(scenarioId: string, tools: RegisteredTool[]): ScenarioSpec {
  const validator = new ScenarioSpecValidator();
  return validator.parse({
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
    allowedActions: tools.map(tool => ({
      id: tool.id,
      name: tool.name,
      version: tool.version,
      riskClass: tool.riskClass,
      requiresApproval: tool.requiresApproval
    })),
    riskClass: RiskClass.LOW
  });
}

function filterToolsBySpec(allTools: RegisteredTool[], spec: ScenarioSpec): RegisteredTool[] {
  const allowed = new Set(spec.allowedActions.map(a => a.id));
  const picked = allTools.filter(t => allowed.has(t.id));
  return picked.length > 0 ? picked : allTools;
}

function registerDefaultAgentRole(agentRuntime: AgentRuntime, toolIds: string[]): void {
  const router = agentRuntime.getRouter();
  router.registerRole({
    id: 'general-agent',
    name: 'General Agent',
    description: 'General purpose agent',
    capabilities: ['general', 'information'],
    allowedTools: toolIds.length > 0 ? toolIds : ['web-search-tool', 'database-query-tool', 'api-call-tool'],
    priority: 10
  });
}

/**
 * Создание Agent Runtime (отдельный gateway + реестр на вызов; политика — в executeAgentRequest).
 */
export function createAgentRuntime(): AgentRuntime {
  const registry = new ToolRegistry();
  const gateway = new ToolGateway();
  registerAllTools(registry, gateway);
  attachOpa(gateway);
  const agentRuntime = new AgentRuntime(gateway, loadLlmConfigFromEnv());
  registerDefaultAgentRole(
    agentRuntime,
    registry.getAll().map(t => t.id)
  );
  return agentRuntime;
}

/**
 * Получение registry с зарегистрированными инструментами (без привязки к политике сценария).
 */
export function getGlobalRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  const gateway = new ToolGateway();
  registerAllTools(registry, gateway);
  return registry;
}

/**
 * Выполнение запроса через Agent Runtime
 */
export async function executeAgentRequest(
  userIntent: string,
  scenarioId: string = 'web-scenario',
  options?: ExecuteAgentOptions
): Promise<{
  success: boolean;
  output?: string;
  toolCallsExecuted: number;
  totalTokens: number;
  error?: { code: string; message: string };
  fallbackUsed?: boolean;
}> {
  try {
    const tenantId = normalizeTenantId(options?.tenantId);

    // Quota check before execution
    try {
      const quotaResult = await checkQuota(tenantId, 'agent_calls');
      if (!quotaResult.allowed) {
        return {
          success: false,
          toolCallsExecuted: 0,
          totalTokens: 0,
          error: { code: 'QUOTA_EXCEEDED', message: `Quota exceeded for agent_calls (limit: ${quotaResult.limit}, current: ${quotaResult.current})` }
        };
      }
    } catch (_) { /* quota check is best-effort */ }

    const registry = new ToolRegistry();
    const gateway = new ToolGateway();
    registerAllTools(registry, gateway);
    attachOpa(gateway);

    const validator = new ScenarioSpecValidator();
    const allTools = registry.getAll();
    const loaded = await tryLoadScenarioSpec(scenarioId, tenantId);

    let spec: ScenarioSpec;
    if (loaded) {
      const v = validator.validate(loaded);
      spec = v.valid ? validator.parse(loaded) : buildFallbackSpec(scenarioId, allTools);
    } else {
      spec = buildFallbackSpec(scenarioId, allTools);
    }

    const builder = new ScenarioBuilder();
    gateway.setPolicy(builder.generateExecutionPolicy(spec));
    const availableTools = filterToolsBySpec(allTools, spec);

    if (availableTools.length === 0) {
      return {
        success: false,
        toolCallsExecuted: 0,
        totalTokens: 0,
        error: {
          code: 'NO_TOOLS',
          message: 'Нет инструментов, разрешённых спецификацией сценария'
        }
      };
    }

    const agentRuntime = new AgentRuntime(gateway, loadLlmConfigFromEnv());
    registerDefaultAgentRole(
      agentRuntime,
      availableTools.map(t => t.id)
    );

    const result = await agentRuntime.execute({
      scenarioId,
      executionId: `exec-${Date.now()}`,
      userId: 'web-user',
      userRoles: ['user'],
      scenarioSpec: spec,
      availableTools,
      userIntent,
      tenantId
    });

    try {
      const orgId =
        options?.orgId && String(options.orgId).trim() !== ''
          ? String(options.orgId).trim()
          : await resolveOrgIdForTenant(tenantId);
      const meter = getUsageMeter();
      meter.track(orgId, tenantId, 'agent_calls', 1);
      if (result.toolCallsExecuted > 0) {
        meter.track(orgId, tenantId, 'tool_calls', result.toolCallsExecuted);
      }
      if (result.totalTokens > 0) {
        meter.track(orgId, tenantId, 'llm_tokens', result.totalTokens);
      }
    } catch (_) { /* best-effort */ }

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
