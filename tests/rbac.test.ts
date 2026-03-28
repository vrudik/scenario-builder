import { describe, it, expect } from 'vitest';
import { ROLE_HIERARCHY, ROLE_SCOPES, roleRank, hasMinRole, scopesForRole } from '../src/web/rbac';

describe('RBAC', () => {
  describe('ROLE_HIERARCHY', () => {
    it('has 5 roles in correct order', () => {
      expect(ROLE_HIERARCHY).toEqual(['owner', 'admin', 'builder', 'operator', 'viewer']);
    });
  });

  describe('roleRank', () => {
    it('owner=0, viewer=4', () => {
      expect(roleRank('owner')).toBe(0);
      expect(roleRank('viewer')).toBe(4);
    });

    it('unknown role gets Infinity', () => {
      expect(roleRank('unknown')).toBe(Infinity);
    });
  });

  describe('hasMinRole', () => {
    it('owner has at least admin', () => {
      expect(hasMinRole('owner', 'admin')).toBe(true);
    });

    it('viewer does NOT have admin', () => {
      expect(hasMinRole('viewer', 'admin')).toBe(false);
    });

    it('builder has at least builder', () => {
      expect(hasMinRole('builder', 'builder')).toBe(true);
    });

    it('operator does NOT have builder', () => {
      expect(hasMinRole('operator', 'builder')).toBe(false);
    });
  });

  describe('scopesForRole', () => {
    it('owner has admin:write', () => {
      expect(scopesForRole('owner')).toContain('admin:write');
    });

    it('viewer does NOT have scenarios:write', () => {
      expect(scopesForRole('viewer')).not.toContain('scenarios:write');
    });

    it('viewer has scenarios:read', () => {
      expect(scopesForRole('viewer')).toContain('scenarios:read');
    });

    it('builder has agent:execute', () => {
      expect(scopesForRole('builder')).toContain('agent:execute');
    });

    it('unknown role gets viewer scopes', () => {
      expect(scopesForRole('random')).toEqual(scopesForRole('viewer'));
    });
  });

  describe('ROLE_SCOPES completeness', () => {
    it('every role in hierarchy has a scopes entry', () => {
      for (const role of ROLE_HIERARCHY) {
        expect(ROLE_SCOPES[role]).toBeDefined();
        expect(ROLE_SCOPES[role].length).toBeGreaterThan(0);
      }
    });
  });
});
