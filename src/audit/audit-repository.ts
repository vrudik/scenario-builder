/**
 * Репозиторий аудита
 * Хранение и выборка записей AuditLog (Prisma)
 */

import { prisma } from '../db/index';
import type { AuditEventInput, AuditLogRecord } from './audit-types';

export interface AuditLogQuery {
  action?: string;
  actor?: string;
  resource?: string;
  outcome?: string;
  severity?: string;
  since?: Date;
  until?: Date;
  orgId?: string;
  tenantId?: string;
  limit?: number;
  offset?: number;
}

export class AuditRepository {
  /**
   * Записать событие аудита
   */
  async append(event: AuditEventInput): Promise<AuditLogRecord> {
    const row = await prisma.auditLog.create({
      data: {
        action: event.action,
        actor: event.actor ?? null,
        resource: event.resource ?? null,
        outcome: event.outcome ?? 'success',
        severity: event.severity ?? 'info',
        message: event.message ?? null,
        details: event.details ? JSON.stringify(event.details) : null,
        traceId: event.traceId ?? null,
        spanId: event.spanId ?? null,
        orgId: event.orgId ?? null,
        tenantId: event.tenantId ?? null,
      },
    });
    return this.toRecord(row);
  }

  /**
   * Записать несколько событий (batch)
   */
  async appendMany(events: AuditEventInput[]): Promise<AuditLogRecord[]> {
    const results: AuditLogRecord[] = [];
    for (const event of events) {
      results.push(await this.append(event));
    }
    return results;
  }

  /**
   * Поиск записей по критериям
   */
  async find(query: AuditLogQuery): Promise<AuditLogRecord[]> {
    const where: Record<string, unknown> = {};
    if (query.action) where.action = query.action;
    if (query.actor) where.actor = query.actor;
    if (query.resource) where.resource = query.resource;
    if (query.outcome) where.outcome = query.outcome;
    if (query.severity) where.severity = query.severity;
    if (query.orgId) where.orgId = query.orgId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.since) where.timestamp = { ...((where.timestamp as object) || {}), gte: query.since };
    if (query.until) where.timestamp = { ...((where.timestamp as object) || {}), lte: query.until };

    const rows = await prisma.auditLog.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { timestamp: 'desc' },
      take: query.limit ?? 100,
      skip: query.offset ?? 0,
    });
    return rows.map(r => this.toRecord(r));
  }

  /**
   * Получить запись по id
   */
  async findById(id: string): Promise<AuditLogRecord | null> {
    const row = await prisma.auditLog.findUnique({
      where: { id },
    });
    return row ? this.toRecord(row) : null;
  }

  private toRecord(row: {
    id: string;
    action: string;
    actor: string | null;
    resource: string | null;
    outcome: string;
    severity: string;
    message: string | null;
    details: string | null;
    traceId: string | null;
    spanId: string | null;
    orgId: string | null;
    tenantId: string | null;
    timestamp: Date;
  }): AuditLogRecord {
    return {
      id: row.id,
      action: row.action,
      actor: row.actor,
      resource: row.resource,
      outcome: row.outcome,
      severity: row.severity,
      message: row.message,
      details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : null,
      traceId: row.traceId,
      spanId: row.spanId,
      orgId: row.orgId,
      tenantId: row.tenantId,
      timestamp: row.timestamp,
    };
  }
}
