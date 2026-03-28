import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowGraph } from '../src/builder/workflow-graph';
import { RiskClass, TriggerType, type ScenarioSpec } from '../src/spec/scenario-spec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const workflowsPath = join(repoRoot, 'dist', 'runtime', 'temporal-workflow.js');

const meta = (): WorkflowGraph['metadata'] => ({
  version: '1',
  compiledAt: new Date().toISOString(),
  specId: 'integration'
});

const traversal = (): WorkflowGraph['traversal'] => ({
  decision: 'first-match-else-default',
  parallel: 'all-matching',
  default: 'first-match'
});

function minimalScenarioSpec(): ScenarioSpec {
  return {
    version: '0.1.0',
    id: 'spec-integration',
    name: 'Temporal integration',
    goal: 'Smoke test',
    triggers: [{ type: TriggerType.MANUAL }],
    allowedActions: [
      {
        id: 'noop',
        name: 'noop',
        version: '1.0.0',
        riskClass: RiskClass.LOW,
        requiresApproval: false
      }
    ],
    riskClass: RiskClass.LOW
  };
}

const initialCtx = {
  executionId: 'e1',
  scenarioId: 's1',
  userId: 'u1',
  userRoles: ['admin']
};

describe.skipIf(
  process.env.SKIP_TEMPORAL_INTEGRATION === '1' || !existsSync(workflowsPath)
)('temporal scenarioWorkflow (integration)', { timeout: 180_000 }, () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('runs start → action → end with stubbed tool activity', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'st', type: 'start' },
        { id: 'ac', type: 'action', toolId: 'any_tool' },
        { id: 'en', type: 'end' }
      ],
      edges: [
        { from: 'st', to: 'ac' },
        { from: 'ac', to: 'en' }
      ],
      traversal: traversal(),
      metadata: meta()
    };

    const taskQueue = `scenario-test-${Date.now()}`;

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace ?? 'default',
      taskQueue,
      workflowsPath,
      activities: {
        executeNodeActivity: async (p: { toolId: string; inputs: Record<string, unknown> }) => ({
          success: true,
          outputs: { echoed: p.toolId, inputs: p.inputs }
        }),
        executeAgentNodeActivity: async () => ({
          success: true,
          outputs: { output: 'unused', toolCallsExecuted: 0, totalTokens: 0 }
        }),
        compensateNodeActivity: async () => {}
      }
    });
    await worker.runUntil(async () => {
      const result = await testEnv.client.workflow.execute('scenarioWorkflow', {
        taskQueue,
        workflowId: `wf-linear-${Date.now()}`,
        args: [graph, minimalScenarioSpec(), initialCtx]
      });
      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({ echoed: 'any_tool' });
      expect(result.nodeOutcomes?.ac?.ok).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });
  });

  it('runs start → agent → end with stubbed agent activity', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'st', type: 'start' },
        {
          id: 'ag',
          type: 'agent',
          agentConfig: { userIntent: 'say hello', allowedTools: ['noop'] }
        },
        { id: 'en', type: 'end' }
      ],
      edges: [
        { from: 'st', to: 'ag' },
        { from: 'ag', to: 'en' }
      ],
      traversal: traversal(),
      metadata: meta()
    };

    const taskQueue = `scenario-test-agent-${Date.now()}`;

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace ?? 'default',
      taskQueue,
      workflowsPath,
      activities: {
        executeNodeActivity: async () => {
          throw new Error('executeNodeActivity should not run');
        },
        executeAgentNodeActivity: async (p: { userIntent: string; allowedToolIds: string[] }) => {
          expect(p.userIntent).toBe('say hello');
          expect(p.allowedToolIds).toEqual(['noop']);
          return {
            success: true,
            outputs: { output: 'hello', toolCallsExecuted: 0, totalTokens: 0 }
          };
        },
        compensateNodeActivity: async () => {}
      }
    });
    await worker.runUntil(async () => {
      const result = await testEnv.client.workflow.execute('scenarioWorkflow', {
        taskQueue,
        workflowId: `wf-agent-${Date.now()}`,
        args: [graph, minimalScenarioSpec(), initialCtx]
      });
      expect(result.success).toBe(true);
      expect(result.result).toMatchObject({ output: 'hello' });
      expect(result.nodeOutcomes?.ag?.ok).toBe(true);
    });
  });
});
