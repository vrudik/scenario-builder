import { describe, it, expect } from 'vitest';
import { expandWebhookEventTypes } from '../src/runtime/webhook-dispatch';

describe('expandWebhookEventTypes', () => {
  it('includes legacy aliases for canonical execution.* events', () => {
    expect(expandWebhookEventTypes('execution.started').sort()).toEqual(
      ['execution.started', 'scenario.started'].sort(),
    );
    expect(expandWebhookEventTypes('execution.completed').sort()).toEqual(
      ['execution.completed', 'scenario.completed'].sort(),
    );
    expect(expandWebhookEventTypes('node.completed').sort()).toEqual(
      ['node.completed', 'tool.completed'].sort(),
    );
  });

  it('maps legacy subscription names back to canonical', () => {
    expect(expandWebhookEventTypes('scenario.completed').sort()).toEqual(
      ['execution.completed', 'scenario.completed'].sort(),
    );
    expect(expandWebhookEventTypes('tool.completed').sort()).toEqual(
      ['node.completed', 'tool.completed'].sort(),
    );
  });
});
