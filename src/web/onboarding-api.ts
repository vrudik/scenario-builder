/**
 * Onboarding API CLI.
 * Commands: status, complete, templates
 */

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

  let result: unknown;

  switch (command) {
    case 'status': {
      const orgId = String(params.orgId || '');
      if (!orgId) {
        const defaultOrg = await prisma.org.findUnique({ where: { slug: 'default' } });
        result = {
          completed: !!defaultOrg?.onboardingCompletedAt,
          completedAt: defaultOrg?.onboardingCompletedAt ?? null,
          orgId: defaultOrg?.id ?? null,
        };
      } else {
        const org = await prisma.org.findUnique({ where: { id: orgId } });
        result = {
          completed: !!org?.onboardingCompletedAt,
          completedAt: org?.onboardingCompletedAt ?? null,
          orgId,
        };
      }
      break;
    }

    case 'complete': {
      const orgId = String(params.orgId || '');
      let org;
      if (orgId) {
        org = await prisma.org.update({
          where: { id: orgId },
          data: { onboardingCompletedAt: new Date() },
        });
      } else {
        org = await prisma.org.update({
          where: { slug: 'default' },
          data: { onboardingCompletedAt: new Date() },
        });
      }
      result = { completed: true, completedAt: org.onboardingCompletedAt, orgId: org.id };
      break;
    }

    case 'templates': {
      const templates = await prisma.template.findMany({
        where: { isPublished: true, difficulty: 'beginner' },
        take: 10,
        orderBy: { createdAt: 'asc' },
      });
      result = templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        difficulty: (t as any).difficulty ?? 'beginner',
      }));
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  process.stderr.write('onboarding-api error: ' + err.message + '\n');
  process.stdout.write(JSON.stringify({ error: err.message }));
  process.exit(1);
});
