/**
 * Маршрутизация выполнения по deployment descriptor (canary / stable).
 * Доля canary детерминирована по executionId (стабильная повторяемость).
 */

import type { DeploymentDescriptor } from '../builder/scenario-builder';

export type DeploymentLane = 'stable' | 'canary';

/**
 * Хэш executionId в диапазон [0, 99]
 */
export function executionBucket(executionId: string): number {
  let h = 0;
  for (let i = 0; i < executionId.length; i++) {
    h = (h * 31 + executionId.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

/**
 * Назначить полосу выполнения. Для canary — по проценту из дескриптора (по умолчанию 10%).
 * shadow / blue-green / all-at-once: пользовательский трафик в stable; shadow-дубли — отдельный запуск с lane canary.
 */
export function assignExecutionLane(
  descriptor: DeploymentDescriptor,
  executionId: string
): DeploymentLane {
  if (descriptor.strategy === 'canary') {
    const pct = Math.min(100, Math.max(0, descriptor.canaryConfig?.percentage ?? 10));
    return executionBucket(executionId) < pct ? 'canary' : 'stable';
  }
  return 'stable';
}

/**
 * Для strategy `shadow`: дублировать прогон на полосе canary (доля от primary executionId), без влияния на ответ пользователю.
 * `shadowConfig.enabled === false` — не дублировать.
 */
export function shouldRunShadowCanaryDuplicate(
  descriptor: DeploymentDescriptor,
  executionId: string
): boolean {
  if (descriptor.strategy !== 'shadow') {
    return false;
  }
  if (descriptor.shadowConfig?.enabled === false) {
    return false;
  }
  const pct = Math.min(100, Math.max(0, descriptor.shadowConfig?.percentage ?? 10));
  return executionBucket(executionId) < pct;
}
