/**
 * Temporal Client для запуска и управления workflow
 */

import { Connection, Client } from '@temporalio/client';
import { scenarioWorkflow } from './temporal-workflow';

/**
 * Temporal Client wrapper
 */
export class TemporalClient {
  private client: Client | null = null;

  /**
   * Подключение к Temporal
   */
  async connect(address: string = 'localhost:7233'): Promise<void> {
    const connection = await Connection.connect({
      address
    });

    this.client = new Client({
      connection,
      namespace: 'default'
    });
  }

  /**
   * Запуск workflow сценария
   */
  async startScenarioWorkflow(
    workflowId: string,
    workflowGraph: unknown,
    scenarioSpec: unknown,
    initialContext: unknown
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const handle = await this.client.workflow.start(scenarioWorkflow, {
      taskQueue: 'scenario-execution',
      workflowId,
      args: [workflowGraph, scenarioSpec, initialContext]
    });

    return handle.workflowId;
  }

  /**
   * Получение результата workflow
   */
  async getWorkflowResult(workflowId: string): Promise<unknown> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    return await handle.result();
  }

  /**
   * Отмена workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    await handle.cancel();
  }

  /**
   * Закрытие соединения
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.connection.close();
      this.client = null;
    }
  }
}
