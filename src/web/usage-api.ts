import { readFileSync } from 'node:fs';
import { prisma } from '../db/index.js';

console.log = (...args: unknown[]) =>
  process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
console.warn = (...args: unknown[]) =>
  process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
console.error = (...args: unknown[]) =>
  process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');

async function main() {
  const command = process.argv[2];
  const argPath = process.argv[3];

  let params: Record<string, unknown> = {};
  if (argPath) {
    try { params = JSON.parse(readFileSync(argPath, 'utf-8')); } catch {}
  }

  const orgId = String(params.orgId || 'default');
  const tenantFilter =
    params.tenantId != null && String(params.tenantId).trim() !== ''
      ? { tenantId: String(params.tenantId).trim() }
      : {};
  let result: unknown;

  switch (command) {
    case 'current': {
      const period = params.period as string || new Date().toISOString().slice(0, 7);
      const records = await prisma.usageRecord.findMany({
        where: { orgId, period, ...tenantFilter },
        orderBy: { metric: 'asc' },
      });
      result = records.map(r => ({ metric: r.metric, value: r.value, period: r.period, tenantId: r.tenantId }));
      break;
    }

    case 'history': {
      const metric = String(params.metric || 'executions');
      const records = await prisma.usageRecord.findMany({
        where: { orgId, metric, ...tenantFilter },
        orderBy: { period: 'desc' },
        take: 12,
      });
      result = records.map(r => ({ period: r.period, value: r.value }));
      break;
    }

    case 'breakdown': {
      const period = params.period as string || new Date().toISOString().slice(0, 7);
      const records = await prisma.usageRecord.findMany({
        where: { orgId, period, ...tenantFilter },
        orderBy: { value: 'desc' },
      });
      const byTenant = new Map<string, Record<string, number>>();
      for (const r of records) {
        if (!byTenant.has(r.tenantId)) byTenant.set(r.tenantId, {});
        byTenant.get(r.tenantId)![r.metric] = r.value;
      }
      result = Object.fromEntries(byTenant);
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write('usage-api error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
