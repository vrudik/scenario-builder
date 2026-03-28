import { describe, it, expect } from 'vitest';
import { evaluateLocalToolAccess } from '../src/policy/local-tool-policy';
import type { ExecutionPolicy } from '../src/builder/scenario-builder';

const basePolicy = (): ExecutionPolicy => ({
  allowedTools: ['a', 'b'],
  forbiddenActions: [],
  requiresApproval: [],
  rateLimits: {},
  costLimits: {},
  tokenLimits: {}
});

const ctx = () => ({
  userId: 'u1',
  userRoles: ['user'],
  scenarioId: 's',
  executionId: 'e'
});

describe('evaluateLocalToolAccess', () => {
  it('allows when policy undefined', () => {
    expect(
      evaluateLocalToolAccess({
        policy: undefined,
        toolId: 'x',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: ctx()
      })
    ).toBe(true);
  });

  it('denies when tool not in allowedTools', () => {
    expect(
      evaluateLocalToolAccess({
        policy: basePolicy(),
        toolId: 'z',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: ctx()
      })
    ).toBe(false);
  });

  it('denies forbiddenActions', () => {
    const policy = { ...basePolicy(), forbiddenActions: ['b'] };
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: ctx()
      })
    ).toBe(false);
  });

  it('denies when tool requires approval but not in policy.requiresApproval', () => {
    expect(
      evaluateLocalToolAccess({
        policy: basePolicy(),
        toolId: 'a',
        toolAuthorization: { requiresApproval: true, roles: [] },
        context: ctx()
      })
    ).toBe(false);
  });

  it('denies tool on canary lane when not in canaryAllowedTools', () => {
    const policy: ExecutionPolicy = {
      ...basePolicy(),
      canaryAllowedTools: ['a']
    };
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'canary' }
      })
    ).toBe(false);
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'a',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'canary' }
      })
    ).toBe(true);
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'stable' }
      })
    ).toBe(true);
  });

  it('denies tool on canary when in canaryBlockedToolIds', () => {
    const policy: ExecutionPolicy = {
      ...basePolicy(),
      canaryBlockedToolIds: ['b']
    };
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'canary' }
      })
    ).toBe(false);
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'stable' }
      })
    ).toBe(true);
  });

  it('denies tool on stable when in stableBlockedToolIds', () => {
    const policy: ExecutionPolicy = {
      ...basePolicy(),
      stableBlockedToolIds: ['b']
    };
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'stable' }
      })
    ).toBe(false);
    expect(
      evaluateLocalToolAccess({
        policy,
        toolId: 'b',
        toolAuthorization: { requiresApproval: false, roles: [] },
        context: { ...ctx(), deploymentLane: 'canary' }
      })
    ).toBe(true);
  });

  it('requires role when tool lists roles', () => {
    expect(
      evaluateLocalToolAccess({
        policy: basePolicy(),
        toolId: 'a',
        toolAuthorization: { requiresApproval: false, roles: ['admin'] },
        context: { ...ctx(), userRoles: ['user'] }
      })
    ).toBe(false);
    expect(
      evaluateLocalToolAccess({
        policy: basePolicy(),
        toolId: 'a',
        toolAuthorization: { requiresApproval: false, roles: ['admin'] },
        context: { ...ctx(), userRoles: ['admin'] }
      })
    ).toBe(true);
  });
});
