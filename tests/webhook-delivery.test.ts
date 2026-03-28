import { describe, it, expect } from 'vitest';
import { signPayload } from '../src/services/webhook-delivery';

describe('webhook delivery', () => {
  it('signPayload produces deterministic HMAC', () => {
    const sig1 = signPayload('{"test":1}', 'secret123', '2024-01-01T00:00:00Z');
    const sig2 = signPayload('{"test":1}', 'secret123', '2024-01-01T00:00:00Z');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different secrets produce different signatures', () => {
    const sig1 = signPayload('{"test":1}', 'secret1', '2024-01-01T00:00:00Z');
    const sig2 = signPayload('{"test":1}', 'secret2', '2024-01-01T00:00:00Z');
    expect(sig1).not.toBe(sig2);
  });
});
