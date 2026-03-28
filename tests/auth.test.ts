import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashKey, generateApiKey, cacheClear, hasScope, hasAllScopes, SCOPES, type AuthIdentity } from '../src/web/auth';

describe('auth utilities', () => {
  describe('hashKey', () => {
    it('produces deterministic SHA-256 hex digest', () => {
      const h1 = hashKey('sb_live_abc123');
      const h2 = hashKey('sb_live_abc123');
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('different inputs produce different hashes', () => {
      expect(hashKey('sb_live_aaa')).not.toBe(hashKey('sb_live_bbb'));
    });
  });

  describe('generateApiKey', () => {
    it('generates valid live key', () => {
      const { plaintext, prefix, hash } = generateApiKey('live');
      expect(plaintext).toMatch(/^sb_live_[a-f0-9]{64}$/);
      expect(prefix).toBe(plaintext.slice(0, 12));
      expect(hash).toBe(hashKey(plaintext));
    });

    it('generates valid test key', () => {
      const { plaintext } = generateApiKey('test');
      expect(plaintext).toMatch(/^sb_test_[a-f0-9]{64}$/);
    });

    it('generates unique keys each time', () => {
      const a = generateApiKey('live');
      const b = generateApiKey('live');
      expect(a.plaintext).not.toBe(b.plaintext);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe('cacheClear', () => {
    it('does not throw', () => {
      expect(() => cacheClear()).not.toThrow();
    });
  });

  describe('SCOPES', () => {
    it('exports all expected scope constants', () => {
      expect(SCOPES.SCENARIOS_READ).toBe('scenarios:read');
      expect(SCOPES.SCENARIOS_WRITE).toBe('scenarios:write');
      expect(SCOPES.ADMIN_WRITE).toBe('admin:write');
      expect(SCOPES.AGENT_EXECUTE).toBe('agent:execute');
      expect(Object.keys(SCOPES).length).toBeGreaterThanOrEqual(17);
    });
  });

  describe('hasScope', () => {
    const admin: AuthIdentity = { method: 'admin_password', tenantId: 'default', roles: ['admin'], scopes: null };
    const limited: AuthIdentity = { method: 'api_key', tenantId: 't1', roles: ['user'], scopes: ['scenarios:read', 'templates:read'] };

    it('null scopes (superuser) passes any scope', () => {
      expect(hasScope(admin, SCOPES.SCENARIOS_WRITE)).toBe(true);
      expect(hasScope(admin, SCOPES.ADMIN_WRITE)).toBe(true);
    });

    it('limited scopes pass only included scopes', () => {
      expect(hasScope(limited, SCOPES.SCENARIOS_READ)).toBe(true);
      expect(hasScope(limited, SCOPES.TEMPLATES_READ)).toBe(true);
      expect(hasScope(limited, SCOPES.SCENARIOS_WRITE)).toBe(false);
      expect(hasScope(limited, SCOPES.ADMIN_WRITE)).toBe(false);
    });

    it('null/undefined identity returns false', () => {
      expect(hasScope(null, SCOPES.SCENARIOS_READ)).toBe(false);
      expect(hasScope(undefined, SCOPES.SCENARIOS_READ)).toBe(false);
    });
  });

  describe('hasAllScopes', () => {
    const admin: AuthIdentity = { method: 'admin_password', tenantId: 'default', roles: ['admin'], scopes: null };
    const limited: AuthIdentity = { method: 'api_key', tenantId: 't1', roles: ['user'], scopes: ['scenarios:read', 'templates:read'] };

    it('superuser passes any combination', () => {
      expect(hasAllScopes(admin, [SCOPES.SCENARIOS_WRITE, SCOPES.ADMIN_WRITE])).toBe(true);
    });

    it('limited user fails if any scope missing', () => {
      expect(hasAllScopes(limited, [SCOPES.SCENARIOS_READ, SCOPES.TEMPLATES_READ])).toBe(true);
      expect(hasAllScopes(limited, [SCOPES.SCENARIOS_READ, SCOPES.SCENARIOS_WRITE])).toBe(false);
    });
  });
});
