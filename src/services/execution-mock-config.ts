/**
 * Resolves mockToolConfig for /api/orchestrator/execute: stored scenario spec,
 * optional template library row, then request body (last wins per tool id).
 */

import { prisma } from '../db/index.js';
import type { MockToolConfig } from '../tools/mock-tool-runtime';
import { parseMockConfig } from '../tools/mock-tool-runtime';

function mergeMocks(...layers: (MockToolConfig | null | undefined)[]): MockToolConfig | undefined {
  const out: MockToolConfig = {};
  for (const layer of layers) {
    if (layer && typeof layer === 'object') {
      Object.assign(out, layer);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function mergeMockToolConfigForExecution(
  scenarioId: string,
  tenantId: string,
  requestData: { templateId?: string; mockToolConfig?: unknown; _mockConfig?: unknown },
): Promise<MockToolConfig | undefined> {
  let fromScenario: MockToolConfig | null = null;
  try {
    const row = await prisma.scenario.findFirst({
      where: { id: scenarioId, tenantId },
      select: { spec: true },
    });
    if (row?.spec) {
      const parsed = JSON.parse(row.spec) as { mockToolConfig?: unknown };
      if (parsed.mockToolConfig && typeof parsed.mockToolConfig === 'object' && !Array.isArray(parsed.mockToolConfig)) {
        fromScenario = parsed.mockToolConfig as MockToolConfig;
      }
    }
  } catch {
    /* ignore */
  }

  let fromTemplate: MockToolConfig | null = null;
  const tid = requestData.templateId?.trim();
  if (tid) {
    try {
      const t = await prisma.template.findFirst({
        where: { id: tid, tenantId },
        select: { mockConfig: true },
      });
      fromTemplate = t?.mockConfig ? parseMockConfig(t.mockConfig) : null;
    } catch {
      /* ignore */
    }
  }

  let fromBody: MockToolConfig | null = null;
  const raw = requestData.mockToolConfig ?? requestData._mockConfig;
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    fromBody = raw as MockToolConfig;
  } else if (typeof raw === 'string') {
    fromBody = parseMockConfig(raw);
  }

  return mergeMocks(fromScenario ?? undefined, fromTemplate ?? undefined, fromBody ?? undefined);
}
