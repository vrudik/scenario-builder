import { describe, it, expect } from 'vitest';
import { AuditAction, AuditOutcome, AuditSeverity } from '../src/audit/audit-types';

describe('auth audit types', () => {
  it('has AUTH_SUCCESS action', () => {
    expect(AuditAction.AUTH_SUCCESS).toBe('auth_success');
  });

  it('has AUTH_FAILURE action', () => {
    expect(AuditAction.AUTH_FAILURE).toBe('auth_failure');
  });

  it('has API_KEY_CREATED action', () => {
    expect(AuditAction.API_KEY_CREATED).toBe('api_key_created');
  });

  it('has API_KEY_REVOKED action', () => {
    expect(AuditAction.API_KEY_REVOKED).toBe('api_key_revoked');
  });

  it('AuditService.logAuthEvent method exists', async () => {
    const { AuditService } = await import('../src/audit/audit-service');
    const svc = new AuditService();
    expect(typeof svc.logAuthEvent).toBe('function');
  });
});
