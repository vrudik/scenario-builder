/**
 * Role-Based Access Control (RBAC) module.
 * Defines role hierarchy, default scopes per role, and scope-checking helpers.
 */

/** Ordered role hierarchy (most privileged first). */
export const ROLE_HIERARCHY = ['owner', 'admin', 'builder', 'operator', 'viewer'] as const;
export type Role = (typeof ROLE_HIERARCHY)[number];

/** Default scopes assigned to each role. */
export const ROLE_SCOPES: Record<Role, string[]> = {
  owner: [
    'scenarios:read', 'scenarios:write',
    'executions:read', 'executions:write',
    'templates:read', 'templates:write',
    'queues:read', 'queues:write',
    'audit:read', 'audit:export',
    'config:read', 'config:write',
    'agent:execute',
    'admin:write',
    'org:read', 'org:write', 'org:billing',
  ],
  admin: [
    'scenarios:read', 'scenarios:write',
    'executions:read', 'executions:write',
    'templates:read', 'templates:write',
    'queues:read', 'queues:write',
    'audit:read', 'audit:export',
    'config:read', 'config:write',
    'agent:execute',
    'admin:write',
    'org:read', 'org:write',
  ],
  builder: [
    'scenarios:read', 'scenarios:write',
    'executions:read', 'executions:write',
    'templates:read', 'templates:write',
    'queues:read',
    'audit:read',
    'config:read',
    'agent:execute',
    'org:read',
  ],
  operator: [
    'scenarios:read',
    'executions:read', 'executions:write',
    'templates:read',
    'queues:read', 'queues:write',
    'audit:read',
    'config:read',
    'agent:execute',
    'org:read',
  ],
  viewer: [
    'scenarios:read',
    'executions:read',
    'templates:read',
    'queues:read',
    'audit:read',
    'org:read',
  ],
};

/**
 * Get the numeric rank of a role (0 = owner, 4 = viewer).
 * Unknown roles get rank Infinity (least privileged).
 */
export function roleRank(role: string): number {
  const idx = ROLE_HIERARCHY.indexOf(role as Role);
  return idx === -1 ? Infinity : idx;
}

/**
 * Check if `role` is at least as privileged as `minRole`.
 */
export function hasMinRole(role: string, minRole: Role): boolean {
  return roleRank(role) <= roleRank(minRole);
}

/**
 * Get default scopes for a role. Unknown roles get viewer scopes.
 */
export function scopesForRole(role: string): string[] {
  return ROLE_SCOPES[role as Role] ?? ROLE_SCOPES.viewer;
}
