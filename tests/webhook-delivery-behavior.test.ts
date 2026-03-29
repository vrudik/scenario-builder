import { describe, it, expect, vi, afterEach } from 'vitest';
import { deliverWebhook, signPayload } from '../src/services/webhook-delivery';

describe('deliverWebhook behavior', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends HMAC header matching signPayload', async () => {
    const calls: { headers: Record<string, string>; body: string }[] = [];
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const raw = init?.headers;
      const h: Record<string, string> = {};
      if (raw instanceof Headers) {
        raw.forEach((v, k) => {
          h[k] = v;
        });
      } else if (raw && typeof raw === 'object') {
        Object.assign(h, raw as Record<string, string>);
      }
      calls.push({ headers: h, body: String(init?.body || '') });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const ok = await deliverWebhook(
      { id: 'ep1', url: 'https://example.com/hook', secret: 's3cret' },
      { type: 'test', data: { x: 1 }, timestamp: '2026-01-01T00:00:00.000Z' },
      0,
    );
    expect(ok).toBe(true);
    expect(calls.length).toBe(1);
    const hdr = calls[0].headers;
    const sig = hdr['X-Webhook-Signature'] || hdr['x-webhook-signature'];
    expect(sig).toMatch(/^sha256=/);
    const ts = hdr['X-Webhook-Timestamp'] || hdr['x-webhook-timestamp'];
    const expected = signPayload(calls[0].body, 's3cret', ts);
    expect(sig).toBe(`sha256=${expected}`);
  });

  it('retries on 503 then succeeds', async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => {
      n += 1;
      if (n < 2) return new Response(null, { status: 503 });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const ok = await deliverWebhook(
      { id: 'ep1', url: 'https://example.com/hook', secret: 's3cret' },
      { type: 'test', data: {}, timestamp: new Date().toISOString() },
      3,
    );
    expect(ok).toBe(true);
    expect(n).toBe(2);
  });
});
