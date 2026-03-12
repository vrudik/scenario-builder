/**
 * API для работы с журналом аудита
 * CLI: tsx audit-api.ts find <requestFile>
 * или: tsx audit-api.ts find '{"action":"scenario_started","limit":10}'
 */

import { AuditRepository } from '../audit/audit-repository';
import type { AuditLogQuery } from '../audit/audit-repository';

export async function findAuditLog(query: AuditLogQuery) {
  const repo = new AuditRepository();
  return repo.find(query);
}

const isDirectExecution =
  typeof require !== 'undefined' && require.main === module ||
  process.argv[1]?.includes('audit-api.ts') ||
  process.argv[1]?.includes('audit-api.js');

if (isDirectExecution) {
  const command = process.argv[2];
  const arg3 = process.argv[3] ?? '{}';

  (async () => {
    try {
      let requestData: AuditLogQuery;
      if (arg3.includes('/') || arg3.includes('\\') || arg3.endsWith('.json')) {
        const fs = await import('fs');
        const fileContent = fs.readFileSync(arg3, 'utf-8');
        requestData = JSON.parse(fileContent);
      } else {
        requestData = JSON.parse(arg3);
      }

      if (command === 'find') {
        const records = await findAuditLog(requestData);
        process.stdout.write(JSON.stringify({ success: true, data: records }));
      } else {
        process.stdout.write(JSON.stringify({
          success: false,
          error: { code: 'INVALID_COMMAND', message: `Unknown command: ${command}` },
        }));
      }
    } catch (error) {
      process.stdout.write(JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
      process.exit(1);
    }
  })();
}
