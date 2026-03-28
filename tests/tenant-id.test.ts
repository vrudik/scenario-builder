import { describe, it, expect } from 'vitest';
import { normalizeTenantId } from '../src/utils/tenant-id';

describe('normalizeTenantId', () => {
  it('returns default for empty or invalid', () => {
    expect(normalizeTenantId(undefined)).toBe('default');
    expect(normalizeTenantId('')).toBe('default');
    expect(normalizeTenantId('bad tenant')).toBe('default');
    expect(normalizeTenantId('x'.repeat(65))).toBe('default');
  });

  it('accepts safe slugs', () => {
    expect(normalizeTenantId('acme')).toBe('acme');
    expect(normalizeTenantId('  team_b  ')).toBe('team_b');
    expect(normalizeTenantId('a.b-1')).toBe('a.b-1');
  });
});
