/**
 * Identity-bound tenant resolution.
 * Validates that a requested tenantId (from X-Tenant-ID header) belongs
 * to the authenticated identity's org. Falls back to 'default' when
 * AUTH_MODE=off.
 */

import { prisma } from '../db/index.js';

interface Identity {
  orgId?: string;
  tenantId: string;
}

interface TenantResult {
  tenantId: string;
  orgId: string | null;
}

/** Cache: orgId -> Set of allowed tenantIds. TTL 60s. */
const orgWorkspaceCache = new Map<string, { tenantIds: Set<string>; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getAllowedTenants(orgId: string): Promise<Set<string>> {
  const cached = orgWorkspaceCache.get(orgId);
  if (cached && Date.now() < cached.expiresAt) return cached.tenantIds;

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { orgId },
      select: { tenantId: true },
    });
    const tenantIds = new Set(workspaces.map(w => w.tenantId));
    orgWorkspaceCache.set(orgId, { tenantIds, expiresAt: Date.now() + CACHE_TTL_MS });
    return tenantIds;
  } catch {
    return new Set(['default']);
  }
}

/**
 * Resolve tenant from identity + optional header override.
 * Rules:
 *   1. If no identity or no orgId -> return identity.tenantId or 'default'
 *   2. If header tenantId provided and belongs to identity's org -> use it
 *   3. If header tenantId NOT in org -> reject (return null)
 *   4. If no header -> use identity.tenantId
 */
export async function resolveTenant(
  identity: Identity | null | undefined,
  headerTenantId: string | undefined,
): Promise<TenantResult | null> {
  if (!identity || !identity.orgId) {
    return { tenantId: identity?.tenantId ?? 'default', orgId: null };
  }

  const orgId = identity.orgId;
  const requestedTenant = headerTenantId?.trim() || identity.tenantId;

  const allowed = await getAllowedTenants(orgId);
  if (!allowed.has(requestedTenant)) {
    return null; // caller should return 403
  }

  return { tenantId: requestedTenant, orgId };
}

export function clearTenantCache(): void {
  orgWorkspaceCache.clear();
}
