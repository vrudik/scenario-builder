import { describe, it, expect } from 'vitest';
import { getRetentionDays } from '../src/services/audit-retention';

describe('audit retention', () => {
  it('returns default 90 days when env not set', () => {
    delete process.env.AUDIT_RETENTION_DAYS;
    expect(getRetentionDays()).toBe(90);
  });

  it('reads from AUDIT_RETENTION_DAYS env', () => {
    process.env.AUDIT_RETENTION_DAYS = '30';
    expect(getRetentionDays()).toBe(30);
    delete process.env.AUDIT_RETENTION_DAYS;
  });

  it('falls back to 90 for invalid env', () => {
    process.env.AUDIT_RETENTION_DAYS = 'abc';
    expect(getRetentionDays()).toBe(90);
    delete process.env.AUDIT_RETENTION_DAYS;
  });
});
