import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpaHttpClient } from '../src/policy/opa-http-client';

describe('OpaHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns boolean from result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
    );
    const client = new OpaHttpClient('http://opa:8181', { failOpen: false });
    await expect(client.queryAllow('scenario/allow', { toolId: 't' })).resolves.toBe(false);
  });

  it('failOpen on network error returns true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnrefused')));
    const client = new OpaHttpClient('http://opa:8181', { failOpen: true });
    await expect(client.queryAllow('scenario/allow', {})).resolves.toBe(true);
  });

  it('fail closed on network error returns false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnrefused')));
    const client = new OpaHttpClient('http://opa:8181', { failOpen: false });
    await expect(client.queryAllow('scenario/allow', {})).resolves.toBe(false);
  });
});
