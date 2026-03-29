import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mergeMockToolConfigForExecution } from '../src/services/execution-mock-config';

const prisma = new PrismaClient();
const suffix = `emc-${Date.now()}`;
const tenantId = `tenant-emc-${suffix}`;
const scenarioId = `sc-emc-${suffix}`;
const templateId = `tpl-emc-${suffix}`;

describe('mergeMockToolConfigForExecution', () => {
  beforeAll(async () => {
    await prisma.scenario.create({
      data: {
        id: scenarioId,
        name: 'EMC scenario',
        tenantId,
        spec: JSON.stringify({
          version: '0.1.0',
          id: scenarioId,
          name: 'EMC scenario',
          goal: 'g',
          triggers: [{ type: 'event', source: 'x' }],
          allowedActions: [],
          riskClass: 'low',
          mockToolConfig: {
            'web-search-tool': { response: { from: 'scenario' } },
            'api-call-tool': { response: { from: 'scenario' } },
          },
        }),
      },
    });
    await prisma.template.create({
      data: {
        id: templateId,
        name: 'EMC template',
        category: 'test',
        tenantId,
        spec: JSON.stringify({
          version: '0.1.0',
          id: 't',
          name: 't',
          goal: 'g',
          triggers: [{ type: 'event', source: 'x' }],
          allowedActions: [],
          riskClass: 'low',
        }),
        mockConfig: JSON.stringify({
          'api-call-tool': { response: { from: 'template' } },
        }),
      },
    });
  });

  afterAll(async () => {
    await prisma.template.deleteMany({ where: { id: templateId } });
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.$disconnect();
  });

  it('merges scenario spec, template, and body (body wins per tool)', async () => {
    const merged = await mergeMockToolConfigForExecution(scenarioId, tenantId, {
      templateId,
      mockToolConfig: {
        'web-search-tool': { response: { from: 'body' } },
      },
    });
    expect(merged).toBeDefined();
    expect(merged!['web-search-tool']?.response).toEqual({ from: 'body' });
    expect(merged!['api-call-tool']?.response).toEqual({ from: 'template' });
  });

  it('returns undefined when nothing matches tenant', async () => {
    const merged = await mergeMockToolConfigForExecution(scenarioId, 'other-tenant', {});
    expect(merged).toBeUndefined();
  });
});
