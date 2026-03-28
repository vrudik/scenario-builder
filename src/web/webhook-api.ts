import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { WebhookRepository } from '../db/repositories/webhook-repository.js';

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

  const repo = new WebhookRepository();
  let result: unknown;

  switch (command) {
    case 'list':
      result = await repo.listByOrg(String(params.orgId || 'default'));
      break;
    case 'get':
      result = await repo.findById(String(params.id));
      break;
    case 'create': {
      const secret = randomBytes(32).toString('hex');
      result = await repo.create({
        orgId: String(params.orgId || 'default'),
        url: String(params.url),
        events: (params.events as string[]) || ['*'],
        secret,
      });
      (result as Record<string, unknown>).secret = secret;
      break;
    }
    case 'update':
      result = await repo.update(String(params.id), {
        url: params.url as string | undefined,
        events: params.events as string[] | undefined,
        active: params.active as boolean | undefined,
      });
      break;
    case 'delete':
      await repo.remove(String(params.id));
      result = { ok: true };
      break;
    case 'test': {
      const endpoint = await repo.findById(String(params.id));
      if (!endpoint) throw new Error('Webhook not found');
      const { deliverWebhook } = await import('../services/webhook-delivery.js');
      const ok = await deliverWebhook(endpoint, { type: 'test', data: { message: 'Test webhook delivery' }, timestamp: new Date().toISOString() });
      result = { delivered: ok };
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write('webhook-api error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
