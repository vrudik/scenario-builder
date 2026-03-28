import { describe, it, expect } from 'vitest';
import { clearTenantCache } from '../src/web/tenant-resolver';

describe('tenant-resolver', () => {
  it('exports resolveTenant function', async () => {
    const mod = await import('../src/web/tenant-resolver');
    expect(typeof mod.resolveTenant).toBe('function');
  });

  it('clearTenantCache does not throw', () => {
    expect(() => clearTenantCache()).not.toThrow();
  });
});
