import { describe, it, expect } from 'vitest';

describe('quota enforcer', () => {
  it('checkQuota function exists', async () => {
    const { checkQuota } = await import('../src/services/quota-enforcer');
    expect(typeof checkQuota).toBe('function');
  });
});
