/**
 * Global deployment / canary knobs (Configuration row). Used by operator UI.
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../db/index.js';

const CONFIG_KEY = 'deployment.operator';
const CATEGORY = 'deployment';

console.log = (...args: unknown[]) =>
  process.stderr.write(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.warn = (...args: unknown[]) =>
  process.stderr.write(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');
console.error = (...args: unknown[]) =>
  process.stderr.write(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n');

function defaultDescriptor() {
  return {
    canaryPercent: 0,
    activeLane: 'stable',
    notes: '',
    updatedAt: new Date().toISOString(),
  };
}

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
    case 'get': {
      const row = await prisma.configuration.findUnique({ where: { key: CONFIG_KEY } });
      if (!row?.value) {
        result = defaultDescriptor();
        break;
      }
      try {
        result = JSON.parse(row.value);
      } catch {
        result = defaultDescriptor();
      }
      break;
    }

    case 'set': {
      const prevRow = await prisma.configuration.findUnique({ where: { key: CONFIG_KEY } });
      const base = defaultDescriptor();
      if (prevRow?.value) {
        try {
          Object.assign(base, JSON.parse(prevRow.value));
        } catch {
          /* keep base */
        }
      }
      if (params.canaryPercent != null) {
        const p = Number(params.canaryPercent);
        if (Number.isFinite(p)) base.canaryPercent = Math.max(0, Math.min(100, Math.round(p)));
      }
      if (typeof params.activeLane === 'string' && params.activeLane.trim() !== '') {
        const lane = params.activeLane.trim();
        if (lane === 'stable' || lane === 'canary') base.activeLane = lane;
      }
      if (typeof params.notes === 'string') base.notes = params.notes.slice(0, 2000);
      base.updatedAt = new Date().toISOString();

      await prisma.configuration.upsert({
        where: { key: CONFIG_KEY },
        create: {
          key: CONFIG_KEY,
          category: CATEGORY,
          value: JSON.stringify(base),
          description: 'Operator canary / lane descriptor (admin UI)',
        },
        update: { value: JSON.stringify(base), category: CATEGORY },
      });
      result = base;
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write('deployment-api error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
