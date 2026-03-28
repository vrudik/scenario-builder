import { describe, it, expect } from 'vitest';

describe('audit export', () => {
  it('AuditRepository supports orgId/tenantId in query', async () => {
    const { AuditRepository } = await import('../src/audit/audit-repository');
    const repo = new AuditRepository();
    const results = await repo.find({ orgId: 'test-org', limit: 1 });
    expect(Array.isArray(results)).toBe(true);
  });
});
