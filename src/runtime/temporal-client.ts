/**
 * Temporal Client для запуска и управления workflow
 */

import { Connection, Client } from '@temporalio/client';
import type { WorkflowGraph } from '../builder/workflow-graph';
import { WorkflowNotFoundError } from '@temporalio/common';
import { historyToJSON } from '@temporalio/common/lib/proto-utils';
import type { ScenarioWorkflowOutcome } from './scenario-workflow-outcome.js';
import {
  mapWorkflowDescribeToSnapshot,
  type ScenarioWorkflowStatusSnapshot
} from './temporal-workflow-status.js';
import { scenarioWorkflow, type ScenarioWorkflowInitialContext } from './temporal-workflow';

/** Результат `start` (workflowId = executionId в нашем контуре) */
export interface TemporalWorkflowStartInfo {
  workflowId: string;
  runId: string;
}

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
    workflowGraph: WorkflowGraph,
    scenarioSpec: unknown,
    initialContext: ScenarioWorkflowInitialContext
  ): Promise<TemporalWorkflowStartInfo> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const handle = await this.client.workflow.start(scenarioWorkflow, {
      taskQueue: 'scenario-execution',
      workflowId,
      args: [workflowGraph, scenarioSpec, initialContext]
    });

    return {
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId
    };
  }

  /**
   * Запуск workflow и ожидание завершения (как in-memory `startExecution` + полный проход графа).
   */
  async runScenarioWorkflow(
    workflowId: string,
    workflowGraph: WorkflowGraph,
    scenarioSpec: unknown,
    initialContext: ScenarioWorkflowInitialContext
  ): Promise<ScenarioWorkflowOutcome> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const handle = await this.client.workflow.start(scenarioWorkflow, {
      taskQueue: 'scenario-execution',
      workflowId,
      args: [workflowGraph, scenarioSpec, initialContext]
    });

    const runId = handle.firstExecutionRunId;
    const raw = (await handle.result()) as ScenarioWorkflowOutcome;
    return {
      ...raw,
      temporalRunId: runId,
      temporalWorkflowId: workflowId
    };
  }

  /**
   * Текущий статус исполнения (DescribeWorkflowExecution), без ожидания завершения.
   * Если workflow не найден — `null`.
   */
  /**
   * Полная история исполнения в JSON (как у CLI Temporal), для отладки / экспорта.
   * Может быть объёмной; не вызывать в горячем пути.
   */
  async fetchScenarioWorkflowHistoryJson(workflowId: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      const history = await handle.fetchHistory();
      return historyToJSON(history);
    } catch (e) {
      if (e instanceof WorkflowNotFoundError) {
        return null;
      }
      throw e;
    }
  }

  async describeScenarioWorkflow(workflowId: string): Promise<ScenarioWorkflowStatusSnapshot | null> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      const d = await handle.describe();
      return mapWorkflowDescribeToSnapshot(d);
    } catch (e) {
      if (e instanceof WorkflowNotFoundError) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Получение результата workflow
   */
  async getWorkflowResult(workflowId: string): Promise<ScenarioWorkflowOutcome> {
    if (!this.client) {
      throw new Error('Client not connected. Call connect() first.');
    }

    const handle = this.client.workflow.getHandle(workflowId);
    return (await handle.result()) as ScenarioWorkflowOutcome;
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
