import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
  createApiKey,
  resolveAuth,
  revokeApiKey,
  invalidateApiKeyCacheByHash,
  hashKey,
} from '../src/web/auth';
import { prisma } from '../src/db/index';

describe('auth API key cache', () => {
  let prevMode: string | undefined;

  beforeEach(() => {
    prevMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = 'required';
  });

  afterEach(() => {
    if (prevMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prevMode;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('revoke clears cache so the same bearer is rejected immediately', async () => {
    const { plaintext, id } = await createApiKey({
      name: `cache-test-${Date.now()}`,
      tenantId: 'default',
      roles: ['admin'],
      scopes: ['admin:write'],
    });
    const hash = hashKey(plaintext);

    const ok1 = await resolveAuth(`Bearer ${plaintext}`);
    expect(ok1.ok).toBe(true);

    const ok2 = await resolveAuth(`Bearer ${plaintext}`);
    expect(ok2.ok).toBe(true);

    const revoked = await revokeApiKey(id);
    expect(revoked).toBe(true);

    const denied = await resolveAuth(`Bearer ${plaintext}`);
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/revoked|Unknown/i);

    await prisma.apiKey.deleteMany({ where: { keyHash: hash } });
  });

  it('invalidateApiKeyCacheByHash drops stale identity without full revoke', async () => {
    const { plaintext, id } = await createApiKey({
      name: `inv-${Date.now()}`,
      tenantId: 'default',
      roles: ['admin'],
      scopes: null,
    });
    const hash = hashKey(plaintext);

    const ok = await resolveAuth(`Bearer ${plaintext}`);
    expect(ok.ok).toBe(true);

    invalidateApiKeyCacheByHash(hash);

    const again = await resolveAuth(`Bearer ${plaintext}`);
    expect(again.ok).toBe(true);
    expect(again.identity?.method).toBe('api_key');

    await prisma.apiKey.deleteMany({ where: { id } });
  });

  it('rejects immediately when key is revoked in DB even if cache was warm', async () => {
    const { plaintext, id } = await createApiKey({
      name: `db-revoke-${Date.now()}`,
      tenantId: 'default',
      roles: ['admin'],
      scopes: ['admin:write'],
    });
    const hash = hashKey(plaintext);

    await resolveAuth(`Bearer ${plaintext}`);
    await resolveAuth(`Bearer ${plaintext}`);

    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });

    const denied = await resolveAuth(`Bearer ${plaintext}`);
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/revoked/i);

    await prisma.apiKey.deleteMany({ where: { keyHash: hash } });
  });

  it('cached identity includes orgId from ApiKey row', async () => {
    const slug = `ak-org-${Date.now()}`;
    const org = await prisma.org.create({ data: { name: 'Key Org', slug } });
    const { plaintext, id } = await createApiKey({
      name: `org-key-${Date.now()}`,
      tenantId: 't1',
      orgId: org.id,
      roles: ['user'],
      scopes: ['scenarios:read'],
    });

    const first = await resolveAuth(`Bearer ${plaintext}`);
    expect(first.ok).toBe(true);
    expect(first.identity?.orgId).toBe(org.id);

    const second = await resolveAuth(`Bearer ${plaintext}`);
    expect(second.ok).toBe(true);
    expect(second.identity?.orgId).toBe(org.id);

    await prisma.apiKey.deleteMany({ where: { id } });
    await prisma.org.deleteMany({ where: { id: org.id } });
  });
});
