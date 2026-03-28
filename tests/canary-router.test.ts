import { describe, it, expect } from 'vitest';
import {
  assignExecutionLane,
  executionBucket,
  shouldRunShadowCanaryDuplicate
} from '../src/runtime/canary-router';
import type { DeploymentDescriptor } from '../src/builder/scenario-builder';

describe('canary-router', () => {
  it('executionBucket is stable for same id', () => {
    expect(executionBucket('exec-abc')).toBe(executionBucket('exec-abc'));
  });

  it('assignExecutionLane: all-at-once is stable', () => {
    const d: DeploymentDescriptor = { strategy: 'all-at-once' };
    expect(assignExecutionLane(d, 'any')).toBe('stable');
  });

  it('assignExecutionLane: 100% canary is always canary', () => {
    const d: DeploymentDescriptor = {
      strategy: 'canary',
      canaryConfig: {
        percentage: 100,
        duration: 1,
        successCriteria: { errorRate: 0.01, latency: 1000 }
      }
    };
    expect(assignExecutionLane(d, 'x')).toBe('canary');
    expect(assignExecutionLane(d, 'y')).toBe('canary');
  });

  it('assignExecutionLane: 0% canary is always stable', () => {
    const d: DeploymentDescriptor = {
      strategy: 'canary',
      canaryConfig: {
        percentage: 0,
        duration: 1,
        successCriteria: { errorRate: 0.01, latency: 1000 }
      }
    };
    expect(assignExecutionLane(d, 'x')).toBe('stable');
  });

  it('assignExecutionLane: shadow is stable for user traffic', () => {
    const d: DeploymentDescriptor = {
      strategy: 'shadow',
      shadowConfig: { enabled: true, percentage: 100 }
    };
    expect(assignExecutionLane(d, 'any-id')).toBe('stable');
  });

  it('shouldRunShadowCanaryDuplicate respects percentage and enabled', () => {
    const d100: DeploymentDescriptor = {
      strategy: 'shadow',
      shadowConfig: { enabled: true, percentage: 100 }
    };
    expect(shouldRunShadowCanaryDuplicate(d100, 'x')).toBe(true);

    const d0: DeploymentDescriptor = {
      strategy: 'shadow',
      shadowConfig: { enabled: true, percentage: 0 }
    };
    expect(shouldRunShadowCanaryDuplicate(d0, 'x')).toBe(false);

    const off: DeploymentDescriptor = {
      strategy: 'shadow',
      shadowConfig: { enabled: false, percentage: 100 }
    };
    expect(shouldRunShadowCanaryDuplicate(off, 'x')).toBe(false);
  });
});
