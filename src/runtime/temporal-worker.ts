/**
 * Temporal Worker: `temporal server start-dev` (или TEMPORAL_ADDRESS), затем:
 *   npm run temporal:worker
 * (после `tsc`: `node dist/runtime/temporal-worker.js`)
 */

import { join } from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { AgentRuntime } from '../agent/agent-runtime';
import { loadLlmConfigFromEnv } from '../agent/llm-config-from-env';
import * as activities from './temporal-activities';
import {
  initTemporalActivityEnv,
  resetTemporalActivityEnv,
  setTemporalAgentRuntime
} from './temporal-activities';
import { ToolGateway } from '../gateway/tool-gateway';
import { ToolRegistry } from '../registry/tool-registry';
import { registerAllTools } from '../tools';

const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';

async function main(): Promise<void> {
  resetTemporalActivityEnv();
  const gateway = new ToolGateway();
  const registry = new ToolRegistry();
  registerAllTools(registry, gateway);
  initTemporalActivityEnv(gateway, registry);

  if (process.env.TEMPORAL_ENABLE_AGENT === '1') {
    const llmConfig = loadLlmConfigFromEnv();
    setTemporalAgentRuntime(new AgentRuntime(gateway, llmConfig));
    console.log(
      `[Temporal worker] Agent Runtime enabled (${llmConfig.provider}, model=${llmConfig.model})`
    );
  } else {
    setTemporalAgentRuntime(null);
  }

  const connection = await NativeConnection.connect({ address });

  const workflowsPath = join(process.cwd(), 'dist/runtime/temporal-workflow.js');

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: 'scenario-execution',
    workflowsPath,
    activities
  });

  console.log(`[Temporal worker] listening taskQueue=scenario-execution, address=${address}`);
  await worker.run();
}

main().catch(err => {
  console.error('[Temporal worker] failed:', err);
  process.exit(1);
});
