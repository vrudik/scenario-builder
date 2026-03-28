import { describe, it, expect } from 'vitest';
import { executeMockTool, parseMockConfig } from '../src/tools/mock-tool-runtime';

describe('mock-tool-runtime', () => {
  it('parseMockConfig returns null for empty input', () => {
    expect(parseMockConfig(null)).toBeNull();
    expect(parseMockConfig(undefined)).toBeNull();
    expect(parseMockConfig('')).toBeNull();
  });

  it('parseMockConfig parses valid JSON', () => {
    const config = parseMockConfig('{"tool1": {"response": {"ok": true}}}');
    expect(config).toEqual({ tool1: { response: { ok: true } } });
  });

  it('executeMockTool returns configured response', async () => {
    const config = { 'order-lookup': { response: { orderId: '123', status: 'shipped' } } };
    const result = await executeMockTool('order-lookup', {}, config);
    expect(result.mocked).toBe(true);
    expect(result.output).toEqual({ orderId: '123', status: 'shipped' });
  });

  it('executeMockTool returns error for unconfigured tool', async () => {
    const result = await executeMockTool('unknown-tool', {}, {});
    expect(result.mocked).toBe(true);
    expect((result.output as any).error).toContain('unknown-tool');
  });
});
