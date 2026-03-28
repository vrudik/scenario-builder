import { describe, expect, it } from 'vitest';
import {
  buildTemporalActivityDedupKey,
  buildTenantScopedActivityDedupKey
} from '../src/runtime/temporal-activity-dedup-key';

describe('buildTemporalActivityDedupKey', () => {
  it('joins workflow run and activity id', () => {
    expect(
      buildTemporalActivityDedupKey({
        workflowExecution: { workflowId: 'exec-1', runId: 'run-a' },
        activityId: 'act-7',
      })
    ).toBe('temporal|exec-1|run-a|act-7');
  });
});

describe('buildTenantScopedActivityDedupKey', () => {
  it('prefixes normalized tenant', () => {
    expect(
      buildTenantScopedActivityDedupKey('acme', 'temporal|e|r|a')
    ).toBe('acme|temporal|e|r|a');
  });

  it('uses default when tenant missing', () => {
    expect(buildTenantScopedActivityDedupKey(undefined, 'k')).toBe('default|k');
  });
});
