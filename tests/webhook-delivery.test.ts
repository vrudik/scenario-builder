import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { signPayload } from '../src/services/webhook-delivery';

describe('webhook delivery', () => {
  describe('signPayload', () => {
    it('produces deterministic HMAC-SHA256', () => {
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

    it('different timestamps produce different signatures', () => {
      const sig1 = signPayload('{"test":1}', 'secret', '2024-01-01T00:00:00Z');
      const sig2 = signPayload('{"test":1}', 'secret', '2024-01-02T00:00:00Z');
      expect(sig1).not.toBe(sig2);
    });

    it('different payloads produce different signatures', () => {
      const sig1 = signPayload('{"test":1}', 'secret', '2024-01-01T00:00:00Z');
      const sig2 = signPayload('{"test":2}', 'secret', '2024-01-01T00:00:00Z');
      expect(sig1).not.toBe(sig2);
    });

    it('uses timestamp.payload as HMAC input', () => {
      const payload = '{"data":"test"}';
      const secret = 'mysecret';
      const ts = '2024-06-15T10:00:00Z';
      const expected = createHmac('sha256', secret).update(ts + '.' + payload).digest('hex');
      expect(signPayload(payload, secret, ts)).toBe(expected);
    });
  });
});
