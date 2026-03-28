/**
 * Audit log retention / cleanup.
 * Deletes audit records older than the configured retention period.
 */

import { prisma } from '../db/index.js';

const DEFAULT_RETENTION_DAYS = 90;

export function getRetentionDays(): number {
  const env = process.env.AUDIT_RETENTION_DAYS;
  if (env) {
    const n = parseInt(env, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_RETENTION_DAYS;
}

export async function cleanupOldAuditLogs(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? getRetentionDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);

  const result = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  return result.count;
}
