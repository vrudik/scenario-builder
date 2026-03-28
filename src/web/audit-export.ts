/**
 * Audit log export CLI.
 * Called from server.cjs via tsx: tsx src/web/audit-export.ts <command> <argsFile>
 *
 * Commands:
 *   export  { format: 'json'|'csv'|'ndjson', from?, to?, actions?, severity?, tenantId?, orgId?, limit? }
 */

import { readFileSync } from 'node:fs';
import { AuditRepository } from '../audit/audit-repository';

console.log = (...args: unknown[]) =>
  process.stderr.write('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
console.warn = (...args: unknown[]) =>
  process.stderr.write('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
console.error = (...args: unknown[]) =>
  process.stderr.write('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');

async function main() {
  const command = process.argv[2];
  const argPath = process.argv[3];

  let params: Record<string, unknown> = {};
  if (argPath) {
    try { params = JSON.parse(readFileSync(argPath, 'utf-8')); } catch {}
  }

  if (command !== 'export') throw new Error(`Unknown command: ${command}`);

  const repo = new AuditRepository();
  const records = await repo.find({
    since: params.from ? new Date(String(params.from)) : undefined,
    until: params.to ? new Date(String(params.to)) : undefined,
    action: params.actions as string | undefined,
    severity: params.severity as string | undefined,
    orgId: params.orgId as string | undefined,
    tenantId: params.tenantId as string | undefined,
    limit: Number(params.limit) || 1000,
  });

  const format = String(params.format || 'json');

  if (format === 'csv') {
    const headers = 'id,action,actor,resource,outcome,severity,message,orgId,tenantId,timestamp';
    const rows = records.map(r =>
      [r.id, r.action, r.actor ?? '', r.resource ?? '', r.outcome, r.severity, (r.message ?? '').replace(/,/g, ';'), r.orgId ?? '', r.tenantId ?? '', r.timestamp.toISOString()].join(',')
    );
    process.stdout.write(headers + '\n' + rows.join('\n'));
  } else if (format === 'ndjson') {
    for (const r of records) {
      process.stdout.write(JSON.stringify(r) + '\n');
    }
  } else {
    process.stdout.write(JSON.stringify(records));
  }
}

main().catch(err => {
  process.stderr.write('audit-export error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
