/**
 * Персистентный кэш успешных результатов Temporal tool/agent activities.
 * Снижает риск дублирования side-effect при retry после падения воркера (до ack в Temporal).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../index';

export interface TemporalToolActivityCacheHit {
  outputs: Record<string, unknown>;
}

export class TemporalToolActivityResultRepository {
  async findSuccessByDedupKey(dedupKey: string, _tenantId?: string): Promise<TemporalToolActivityCacheHit | null> {
    try {
      const row = await prisma.temporalToolActivityResult.findUnique({
        where: { dedupKey },
        select: { outputsJson: true },
      });
      if (!row) return null;
      return { outputs: JSON.parse(row.outputsJson) as Record<string, unknown> };
    } catch (e) {
      console.warn('[TemporalToolActivityResultRepository] find failed:', e);
      return null;
    }
  }

  async recordSuccess(params: {
    dedupKey: string;
    businessExecutionId: string;
    nodeId: string;
    activityKind: 'tool' | 'agent';
    toolId: string | null;
    outputs: Record<string, unknown>;
    tenantId?: string;
  }): Promise<void> {
    const outputsJson = JSON.stringify(params.outputs);
    try {
      await prisma.temporalToolActivityResult.create({
        data: {
          dedupKey: params.dedupKey,
          businessExecutionId: params.businessExecutionId,
          nodeId: params.nodeId,
          activityKind: params.activityKind,
          toolId: params.toolId,
          outputsJson,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return;
      }
      console.warn(
        '[TemporalToolActivityResultRepository] recordSuccess failed (workflow may retry tool):',
        e
      );
    }
  }
}
