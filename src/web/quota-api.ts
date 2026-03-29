/**
 * QuotaConfig CRUD for server.cjs (tsx subprocess).
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../db/index.js';

console.log = (...args: unknown[]) =>
  process.stderr.write(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.warn = (...args: unknown[]) =>
  process.stderr.write(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.error = (...args: unknown[]) =>
  process.stderr.write(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');

async function main() {
  const command = process.argv[2];
  const argPath = process.argv[3];

  let params: Record<string, unknown> = {};
  if (argPath) {
    try {
      params = JSON.parse(readFileSync(argPath, 'utf-8'));
    } catch {
      params = {};
    }
  }

  const orgId = String(params.orgId || 'default');
  let result: unknown;

  switch (command) {
    case 'list': {
      result = await prisma.quotaConfig.findMany({
        where: { orgId },
        orderBy: [{ metric: 'asc' }, { period: 'asc' }],
      });
      break;
    }

    case 'upsert': {
      const metric = String(params.metric || '').trim();
      if (!metric) throw new Error('metric required');
      const limitVal = Number(params.limitVal);
      if (!Number.isFinite(limitVal) || limitVal < 0) throw new Error('limitVal must be a non-negative number');
      const period = String(params.period || 'monthly');
      const action = String(params.action || 'warn');
      result = await prisma.quotaConfig.upsert({
        where: { orgId_metric_period: { orgId, metric, period } },
        create: { orgId, metric, limitVal: Math.floor(limitVal), period, action },
        update: { limitVal: Math.floor(limitVal), action },
      });
      break;
    }

    case 'delete': {
      const id = params.id != null ? String(params.id) : '';
      if (!id) throw new Error('id required');
      const callerOrgId = params.callerOrgId != null ? String(params.callerOrgId) : '';
      if (callerOrgId) {
        const row = await prisma.quotaConfig.findUnique({ where: { id }, select: { orgId: true } });
        if (!row) throw new Error('Quota not found');
        if (row.orgId !== callerOrgId) throw new Error('Organization access denied');
      }
      await prisma.quotaConfig.delete({ where: { id } });
      result = { ok: true };
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write('quota-api error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
