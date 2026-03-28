import { prisma } from '../db/index.js';

interface PendingRecord {
  orgId: string;
  tenantId: string;
  metric: string;
  delta: number;
}

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 100;

export class UsageMeter {
  private buffer: PendingRecord[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }

  track(orgId: string, tenantId: string, metric: string, delta = 1): void {
    this.buffer.push({ orgId, tenantId, metric, delta });
    if (this.buffer.length >= FLUSH_THRESHOLD) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    const period = currentPeriod();

    const agg = new Map<string, { orgId: string; tenantId: string; metric: string; total: number }>();
    for (const r of batch) {
      const key = `${r.orgId}:${r.tenantId}:${r.metric}`;
      const existing = agg.get(key);
      if (existing) {
        existing.total += r.delta;
      } else {
        agg.set(key, { orgId: r.orgId, tenantId: r.tenantId, metric: r.metric, total: r.delta });
      }
    }

    for (const rec of agg.values()) {
      try {
        await prisma.usageRecord.upsert({
          where: {
            orgId_tenantId_period_metric: {
              orgId: rec.orgId,
              tenantId: rec.tenantId,
              period,
              metric: rec.metric,
            },
          },
          create: {
            orgId: rec.orgId,
            tenantId: rec.tenantId,
            period,
            metric: rec.metric,
            value: rec.total,
          },
          update: {
            value: { increment: rec.total },
          },
        });
      } catch (err) {
        process.stderr.write(`[UsageMeter] flush error: ${err}\n`);
      }
    }
  }
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export { currentPeriod };

let _instance: UsageMeter | null = null;
export function getUsageMeter(): UsageMeter {
  if (!_instance) {
    _instance = new UsageMeter();
    _instance.start();
  }
  return _instance;
}
