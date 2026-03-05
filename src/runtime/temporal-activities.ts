/**
 * Temporal Activities для выполнения действий workflow
 * 
 * Activities выполняют реальную работу (вызовы инструментов),
 * в то время как Workflow координирует выполнение.
 * 
 * Примечание: В реальной реализации здесь будут использоваться
 * ToolGateway и ToolRegistry через dependency injection.
 */

/**
 * Параметры выполнения узла
 */
export interface ExecuteNodeParams {
  nodeId: string;
  toolId: string;
  inputs: Record<string, unknown>;
  context: {
    scenarioId: string;
    executionId: string;
    userId: string;
    userRoles: string[];
    traceId?: string;
    spanId?: string;
  };
}

/**
 * Результат выполнения узла
 */
export interface ExecuteNodeResult {
  success: boolean;
  outputs?: Record<string, unknown>;
  error?: string;
}

/**
 * Параметры компенсации
 */
export interface CompensateNodeParams {
  nodeId: string;
  reason?: string;
}

/**
 * Activity: выполнение узла workflow
 * 
 * Примечание: В реальной реализации gateway и tool будут передаваться через dependency injection
 * или получаться из контекста. Здесь показана упрощенная версия.
 */
export async function executeNodeActivity(
  params: ExecuteNodeParams
): Promise<ExecuteNodeResult> {
  // В реальной системе здесь будет получение gateway и tool из контекста
  // Для примера используем заглушку
  // В реальной системе здесь будет:
  // 1. Получение gateway и tool из контекста/dependency injection
  // 2. Создание ToolRequest
  // 3. Выполнение через gateway.execute()
  
  // Для примера возвращаем успешный результат
  return {
    success: true,
    outputs: { result: 'success', nodeId: params.nodeId }
  };
}

/**
 * Activity: компенсация узла
 */
export async function compensateNodeActivity(
  params: CompensateNodeParams
): Promise<void> {
  // В реальной системе здесь будет выполнение компенсирующего действия
  console.log(`Compensating node ${params.nodeId}, reason: ${params.reason || 'unknown'}`);
}
