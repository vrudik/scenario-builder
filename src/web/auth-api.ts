/**
 * CLI entry-point for API-key management.
 * Called from server.cjs via: tsx src/web/auth-api.ts <command> [argsFile]
 *
 * Commands:
 *   create  { name, tenantId?, roles?, scopes?, expiresInDays?, env? }
 *   list    { tenantId? }
 *   revoke  { id }
 */

import { readFileSync } from 'node:fs';
import { createApiKey, listApiKeys, revokeApiKey } from './auth.js';

// Redirect all console output to stderr so stdout stays clean JSON
console.log = (...args: unknown[]) =>
  process.stderr.write('[LOG] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.warn = (...args: unknown[]) =>
  process.stderr.write('[WARN] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.error = (...args: unknown[]) =>
  process.stderr.write('[ERROR] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.info = (...args: unknown[]) =>
  process.stderr.write('[INFO] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');

const log = (...args: unknown[]) =>
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

  let result: unknown;

  switch (command) {
    case 'create': {
      const expiresAt = params.expiresInDays
        ? new Date(Date.now() + Number(params.expiresInDays) * 86_400_000)
        : null;

      result = await createApiKey({
        name: String(params.name || 'Unnamed key'),
        tenantId: params.tenantId as string | undefined,
        roles: (params.roles as string[]) ?? undefined,
        scopes: (params.scopes as string[] | null) ?? undefined,
        expiresAt,
        createdBy: String(params.createdBy || 'api'),
        env: (params.env as 'live' | 'test') ?? 'live',
        orgId: params.orgId as string | undefined,
      });
      break;
    }

    case 'list': {
      result = await listApiKeys(params.tenantId as string | undefined);
      break;
    }

    case 'revoke': {
      if (!params.id) throw new Error('id required');
      const ok = await revokeApiKey(String(params.id));
      result = { ok };
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  log('auth-api error:', err);
  process.stdout.write(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
