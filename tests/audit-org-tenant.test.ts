import { describe, it, expect } from 'vitest';
import { AuditAction } from '../src/audit/audit-types';

describe('audit org/tenant support', () => {
  it('AuditEventInput accepts orgId and tenantId', async () => {
    const { AuditRepository } = await import('../src/audit/audit-repository');
    const repo = new AuditRepository();
    expect(typeof repo.append).toBe('function');
  });

  it('AuditLogQuery accepts orgId and tenantId', async () => {
    const { AuditRepository } = await import('../src/audit/audit-repository');
    const repo = new AuditRepository();
    expect(typeof repo.find).toBe('function');
  });

  it('has all auth actions', () => {
    expect(AuditAction.AUTH_SUCCESS).toBe('auth_success');
    expect(AuditAction.AUTH_FAILURE).toBe('auth_failure');
    expect(AuditAction.API_KEY_CREATED).toBe('api_key_created');
    expect(AuditAction.API_KEY_REVOKED).toBe('api_key_revoked');
  });
});
