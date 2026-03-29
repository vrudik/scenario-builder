import { describe, it, expect, vi } from 'vitest';
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

describe('AuditService.logAuthEvent writes correct records', () => {
  it('logs auth_success with default outcome/severity', async () => {
    const { AuditService } = await import('../src/audit/audit-service');
    const logged: unknown[] = [];
    const fakeRepo = { append: async (e: unknown) => { logged.push(e); return { id: '1', ...e } as any; } } as any;
    const svc = new AuditService(fakeRepo);

    await svc.logAuthEvent({ action: AuditAction.AUTH_SUCCESS, actor: 'key-123', tenantId: 'tenant-1' });

    expect(logged).toHaveLength(1);
    const record = logged[0] as Record<string, unknown>;
    expect(record.action).toBe('auth_success');
    expect(record.outcome).toBe(AuditOutcome.SUCCESS);
    expect(record.severity).toBe(AuditSeverity.INFO);
    expect(record.actor).toBe('key-123');
    expect(record.tenantId).toBe('tenant-1');
  });

  it('logs auth_failure with warning severity', async () => {
    const { AuditService } = await import('../src/audit/audit-service');
    const logged: unknown[] = [];
    const fakeRepo = { append: async (e: unknown) => { logged.push(e); return { id: '2', ...e } as any; } } as any;
    const svc = new AuditService(fakeRepo);

    await svc.logAuthEvent({ action: AuditAction.AUTH_FAILURE, actor: 'anonymous' });

    expect(logged).toHaveLength(1);
    const record = logged[0] as Record<string, unknown>;
    expect(record.action).toBe('auth_failure');
    expect(record.outcome).toBe(AuditOutcome.FAILURE);
    expect(record.severity).toBe(AuditSeverity.WARNING);
  });

  it('logs api_key_created with key details', async () => {
    const { AuditService } = await import('../src/audit/audit-service');
    const logged: unknown[] = [];
    const fakeRepo = { append: async (e: unknown) => { logged.push(e); return { id: '3', ...e } as any; } } as any;
    const svc = new AuditService(fakeRepo);

    await svc.logAuthEvent({
      action: AuditAction.API_KEY_CREATED,
      actor: 'api',
      details: { keyId: 'k1', name: 'My key' },
      tenantId: 't1',
    });

    expect(logged).toHaveLength(1);
    const record = logged[0] as Record<string, unknown>;
    expect(record.action).toBe('api_key_created');
    expect(record.outcome).toBe(AuditOutcome.SUCCESS);
    expect((record.details as Record<string, unknown>).keyId).toBe('k1');
  });

  it('logs api_key_revoked', async () => {
    const { AuditService } = await import('../src/audit/audit-service');
    const logged: unknown[] = [];
    const fakeRepo = { append: async (e: unknown) => { logged.push(e); return { id: '4', ...e } as any; } } as any;
    const svc = new AuditService(fakeRepo);

    await svc.logAuthEvent({
      action: AuditAction.API_KEY_REVOKED,
      actor: 'system',
      details: { keyId: 'k2' },
    });

    expect(logged).toHaveLength(1);
    const record = logged[0] as Record<string, unknown>;
    expect(record.action).toBe('api_key_revoked');
    expect(record.outcome).toBe(AuditOutcome.SUCCESS);
    expect((record.details as Record<string, unknown>).keyId).toBe('k2');
  });
});

describe('webhook dispatch module', () => {
  it('dispatchWebhooks is exported and callable', async () => {
    const { dispatchWebhooks } = await import('../src/runtime/webhook-dispatch');
    expect(typeof dispatchWebhooks).toBe('function');
  });
});

describe('orchestrator imports dispatchWebhooks', () => {
  it('orchestrator module loads without error', async () => {
    const mod = await import('../src/runtime/orchestrator');
    expect(mod.Orchestrator).toBeDefined();
  });
});
