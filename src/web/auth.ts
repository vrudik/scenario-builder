/**
 * API authentication module.
 *
 * Supports three AUTH_MODE values (env: AUTH_MODE):
 *   off      — no auth required (default, backward-compat)
 *   optional — auth checked if Authorization header present; anonymous allowed
 *   required — every /api/* request must authenticate
 *
 * Auth methods:
 *   1. API Key — `Authorization: Bearer sb_live_<key>` / `sb_test_<key>`
 *   2. Admin password — `Authorization: Bearer <ADMIN_PASSWORD>` (session-less, dev/single-admin)
 */

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthMode = 'off' | 'optional' | 'required';

export interface AuthIdentity {
  method: 'api_key' | 'admin_password' | 'anonymous';
  keyId?: string;
  orgId?: string;
  tenantId: string;
  roles: string[];
  scopes: string[] | null; // null = all
}

export interface AuthResult {
  ok: boolean;
  identity: AuthIdentity | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export const SCOPES = {
  SCENARIOS_READ: 'scenarios:read',
  SCENARIOS_WRITE: 'scenarios:write',
  EXECUTIONS_READ: 'executions:read',
  EXECUTIONS_WRITE: 'executions:write',
  TEMPLATES_READ: 'templates:read',
  TEMPLATES_WRITE: 'templates:write',
  QUEUES_READ: 'queues:read',
  QUEUES_WRITE: 'queues:write',
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  CONFIG_READ: 'config:read',
  CONFIG_WRITE: 'config:write',
  AGENT_EXECUTE: 'agent:execute',
  ADMIN_WRITE: 'admin:write',
  ORG_READ: 'org:read',
  ORG_WRITE: 'org:write',
  ORG_BILLING: 'org:billing',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/**
 * Check if an identity has a given scope.
 * `scopes: null` means "all scopes" (superuser).
 */
export function hasScope(identity: AuthIdentity | null | undefined, scope: Scope): boolean {
  if (!identity) return false;
  if (identity.scopes === null) return true; // null = all scopes
  return identity.scopes.includes(scope);
}

/**
 * Check if an identity has ALL of the given scopes.
 */
export function hasAllScopes(identity: AuthIdentity | null | undefined, scopes: Scope[]): boolean {
  return scopes.every(s => hasScope(identity, s));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEY_PREFIX_RE = /^sb_(live|test)_[a-f0-9]{64}$/;

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey(env: 'live' | 'test' = 'live'): {
  plaintext: string;
  prefix: string;
  hash: string;
} {
  const random = randomBytes(32).toString('hex');
  const plaintext = `sb_${env}_${random}`;
  const prefix = plaintext.slice(0, 12);
  const hash = hashKey(plaintext);
  return { plaintext, prefix, hash };
}

// ---------------------------------------------------------------------------
// In-memory key cache (avoids DB hit on every request)
// TTL-based; entries expire after 60 s.
// ---------------------------------------------------------------------------

interface CacheEntry {
  identity: AuthIdentity;
  expiresAt: number;
}

const KEY_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheGet(hash: string): AuthIdentity | null {
  const entry = KEY_CACHE.get(hash);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    KEY_CACHE.delete(hash);
    return null;
  }
  return entry.identity;
}

function cacheSet(hash: string, identity: AuthIdentity): void {
  KEY_CACHE.set(hash, { identity, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function cacheClear(): void {
  KEY_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Core: resolve auth from raw Authorization header value
// ---------------------------------------------------------------------------

export function getAuthMode(): AuthMode {
  const raw = (process.env.AUTH_MODE ?? 'off').toLowerCase().trim();
  if (raw === 'required' || raw === 'optional') return raw;
  return 'off';
}

export async function resolveAuth(authHeader: string | undefined): Promise<AuthResult> {
  const mode = getAuthMode();

  if (mode === 'off') {
    return { ok: true, identity: { method: 'anonymous', tenantId: 'default', roles: ['admin'], scopes: null } };
  }

  if (!authHeader) {
    if (mode === 'optional') {
      return { ok: true, identity: { method: 'anonymous', tenantId: 'default', roles: ['viewer'], scopes: null } };
    }
    return { ok: false, identity: null, error: 'Authorization header required' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false, identity: null, error: 'Empty bearer token' };
  }

  // --- Admin password shortcut ---
  const adminPwd = process.env.ADMIN_PASSWORD;
  if (adminPwd && token === adminPwd) {
    return {
      ok: true,
      identity: { method: 'admin_password', tenantId: 'default', roles: ['admin'], scopes: null },
    };
  }

  // --- API Key ---
  if (!KEY_PREFIX_RE.test(token)) {
    return { ok: false, identity: null, error: 'Invalid API key format' };
  }

  const hash = hashKey(token);

  const cached = cacheGet(hash);
  if (cached) {
    // fire-and-forget lastUsedAt update
    prisma.apiKey.update({ where: { keyHash: hash }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return { ok: true, identity: cached };
  }

  try {
    const row = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
    if (!row) {
      return { ok: false, identity: null, error: 'Unknown API key' };
    }
    if (row.revokedAt) {
      return { ok: false, identity: null, error: 'API key revoked' };
    }
    if (row.expiresAt && row.expiresAt < new Date()) {
      return { ok: false, identity: null, error: 'API key expired' };
    }

    const identity: AuthIdentity = {
      method: 'api_key',
      keyId: row.id,
      orgId: row.orgId ?? undefined,
      tenantId: row.tenantId,
      roles: safeParse(row.roles, ['user']),
      scopes: row.scopes ? safeParse(row.scopes, null) : null,
    };

    cacheSet(hash, identity);
    prisma.apiKey.update({ where: { keyHash: hash }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return { ok: true, identity };
  } catch (err) {
    // DB unavailable — fail-open if optional
    if (mode === 'optional') {
      return { ok: true, identity: { method: 'anonymous', tenantId: 'default', roles: ['viewer'], scopes: null } };
    }
    return { ok: false, identity: null, error: 'Auth service unavailable' };
  }
}

// ---------------------------------------------------------------------------
// API-key CRUD (used by auth-api.ts)
// ---------------------------------------------------------------------------

export async function createApiKey(opts: {
  name: string;
  tenantId?: string;
  roles?: string[];
  scopes?: string[] | null;
  expiresAt?: Date | null;
  createdBy?: string;
  env?: 'live' | 'test';
  orgId?: string;
}): Promise<{ id: string; plaintext: string; prefix: string; createdAt: Date }> {
  const { plaintext, prefix, hash } = generateApiKey(opts.env ?? 'live');
  const row = await prisma.apiKey.create({
    data: {
      name: opts.name,
      keyPrefix: prefix,
      keyHash: hash,
      tenantId: opts.tenantId ?? 'default',
      createdBy: opts.createdBy ?? 'system',
      roles: JSON.stringify(opts.roles ?? ['admin']),
      scopes: opts.scopes ? JSON.stringify(opts.scopes) : null,
      expiresAt: opts.expiresAt ?? null,
      orgId: opts.orgId ?? null,
    },
  });
  return { id: row.id, plaintext, prefix, createdAt: row.createdAt };
}

export async function listApiKeys(tenantId?: string) {
  const where: Record<string, unknown> = { revokedAt: null };
  if (tenantId) where.tenantId = tenantId;
  return prisma.apiKey.findMany({
    where,
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      tenantId: true,
      roles: true,
      scopes: true,
      createdBy: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeApiKey(id: string): Promise<boolean> {
  try {
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    // purge from cache
    KEY_CACHE.forEach((v, k) => {
      if (v.identity.keyId === id) KEY_CACHE.delete(k);
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
