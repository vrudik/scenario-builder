/**
 * Audit cleanup CLI entry.
 * Usage: tsx src/web/audit-cleanup.ts
 */
console.log = (...args: unknown[]) =>
  process.stderr.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');

import { cleanupOldAuditLogs, getRetentionDays } from '../services/audit-retention.js';

async function main() {
  const days = getRetentionDays();
  const deleted = await cleanupOldAuditLogs(days);
  process.stdout.write(JSON.stringify({ deleted, retentionDays: days }));
}

main().catch(err => {
  process.stderr.write('audit-cleanup error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
