import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('OpenAPI spec', () => {
  it('openapi.json is valid JSON', () => {
    const specPath = join(__dirname, '..', 'docs', 'api', 'openapi.json');
    const raw = readFileSync(specPath, 'utf-8');
    const spec = JSON.parse(raw);
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Scenario Builder API');
  });

  it('has expected paths', () => {
    const specPath = join(__dirname, '..', 'docs', 'api', 'openapi.json');
    const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
    expect(spec.paths['/scenarios']).toBeDefined();
    expect(spec.paths['/auth/keys']).toBeDefined();
    expect(spec.paths['/auth/whoami']).toBeDefined();
  });
});
