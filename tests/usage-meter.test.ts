import { describe, it, expect } from 'vitest';
import { UsageMeter, currentPeriod } from '../src/services/usage-meter';

describe('usage meter', () => {
  it('currentPeriod returns YYYY-MM format', () => {
    const period = currentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('UsageMeter can be instantiated and track', () => {
    const meter = new UsageMeter();
    expect(() => meter.track('org1', 'default', 'executions', 1)).not.toThrow();
    meter.stop();
  });
});
