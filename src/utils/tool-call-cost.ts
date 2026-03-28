/**
 * Оценка стоимости вызова инструмента в USD (для OPA input.executionSpendUsd).
 * Приоритет: поле на инструменте → EXECUTION_TOOL_COST_USD_DEFAULT → 0.
 */
import type { RegisteredTool } from '../registry/tool-registry';

export function estimateToolCallCostUsd(tool: RegisteredTool): number {
  if (typeof tool.estimatedCostUsdPerCall === 'number' && tool.estimatedCostUsdPerCall >= 0) {
    return tool.estimatedCostUsdPerCall;
  }
  const raw = process.env.EXECUTION_TOOL_COST_USD_DEFAULT?.trim();
  if (!raw) {
    return 0;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
