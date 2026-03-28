/**
 * Локальная проверка доступа к инструменту (ExecutionPolicy + метаданные tool).
 * Совпадает с прежней логикой ToolGateway.checkAccess.
 */

import type { ExecutionPolicy } from '../builder/scenario-builder';

export interface ToolAccessContext {
  userId: string;
  userRoles: string[];
  scenarioId: string;
  executionId: string;
  deploymentLane?: string;
}

export interface ToolAccessAuthorization {
  requiresApproval: boolean;
  roles: string[];
}

export interface LocalToolAccessInput {
  policy?: ExecutionPolicy;
  toolId: string;
  toolAuthorization: ToolAccessAuthorization;
  context: ToolAccessContext;
}

export function evaluateLocalToolAccess(input: LocalToolAccessInput): boolean {
  const { policy, toolId, toolAuthorization, context } = input;
  if (!policy) {
    return true;
  }

  if (!policy.allowedTools.includes(toolId)) {
    return false;
  }

  if (
    context.deploymentLane === 'canary' &&
    policy.canaryAllowedTools &&
    policy.canaryAllowedTools.length > 0 &&
    !policy.canaryAllowedTools.includes(toolId)
  ) {
    return false;
  }

  if (
    context.deploymentLane === 'canary' &&
    policy.canaryBlockedToolIds &&
    policy.canaryBlockedToolIds.length > 0 &&
    policy.canaryBlockedToolIds.includes(toolId)
  ) {
    return false;
  }

  if (
    context.deploymentLane === 'stable' &&
    policy.stableBlockedToolIds &&
    policy.stableBlockedToolIds.length > 0 &&
    policy.stableBlockedToolIds.includes(toolId)
  ) {
    return false;
  }

  if (policy.forbiddenActions.includes(toolId)) {
    return false;
  }

  if (toolAuthorization.requiresApproval) {
    if (!policy.requiresApproval.includes(toolId)) {
      return false;
    }
  }

  if (toolAuthorization.roles.length > 0) {
    const hasRequiredRole = toolAuthorization.roles.some(role => context.userRoles.includes(role));
    if (!hasRequiredRole) {
      return false;
    }
  }

  return true;
}
