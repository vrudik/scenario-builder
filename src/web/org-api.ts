/**
 * CLI entry-point for Org / Workspace / Member management.
 * Called from server.cjs via: tsx src/web/org-api.ts <command> [argsFile]
 *
 * Commands:
 *   org-list, org-get, org-create, org-update
 *   workspace-list, workspace-create, workspace-get, workspace-update
 *   member-list, member-add, member-update, member-remove
 */

import { readFileSync } from 'node:fs';
import { OrgRepository } from '../db/repositories/org-repository.js';

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

  const repo = new OrgRepository();
  let result: unknown;

  switch (command) {
    // --- Org ---
    case 'org-list':
      result = await repo.listOrgs();
      break;

    case 'org-get': {
      if (!params.id) throw new Error('id required');
      result = await repo.findOrgById(String(params.id));
      if (!result) throw new Error('Org not found');
      break;
    }

    case 'org-create': {
      if (!params.name || !params.slug) throw new Error('name and slug required');
      result = await repo.createOrg({
        name: String(params.name),
        slug: String(params.slug),
        plan: params.plan ? String(params.plan) : undefined,
      });
      break;
    }

    case 'org-update': {
      if (!params.id) throw new Error('id required');
      const { id, ...rest } = params;
      result = await repo.updateOrg(String(id), rest as { name?: string; plan?: string; status?: string });
      break;
    }

    // --- Workspace ---
    case 'workspace-list': {
      if (!params.orgId) throw new Error('orgId required');
      result = await repo.listWorkspaces(String(params.orgId));
      break;
    }

    case 'workspace-create': {
      if (!params.orgId || !params.name || !params.slug || !params.tenantId)
        throw new Error('orgId, name, slug, tenantId required');
      result = await repo.createWorkspace(String(params.orgId), {
        name: String(params.name),
        slug: String(params.slug),
        tenantId: String(params.tenantId),
        environment: params.environment ? String(params.environment) : undefined,
      });
      break;
    }

    case 'workspace-get': {
      if (!params.id) throw new Error('id required');
      result = await repo.findWorkspaceById(String(params.id));
      if (!result) throw new Error('Workspace not found');
      break;
    }

    case 'workspace-update': {
      if (!params.id) throw new Error('id required');
      const { id, ...rest } = params;
      result = await repo.updateWorkspace(String(id), rest as { name?: string; settings?: string; status?: string });
      break;
    }

    // --- Members ---
    case 'member-list': {
      if (!params.orgId) throw new Error('orgId required');
      result = await repo.listMembers(String(params.orgId));
      break;
    }

    case 'member-add': {
      if (!params.orgId || !params.email || !params.userId)
        throw new Error('orgId, email, userId required');
      result = await repo.addMember(String(params.orgId), {
        userId: String(params.userId),
        email: String(params.email),
        role: params.role ? String(params.role) : undefined,
        invitedBy: params.invitedBy ? String(params.invitedBy) : undefined,
      });
      break;
    }

    case 'member-update': {
      if (!params.id) throw new Error('id required');
      const { id, ...rest } = params;
      result = await repo.updateMember(String(id), rest as { role?: string; status?: string });
      break;
    }

    case 'member-remove': {
      if (!params.id) throw new Error('id required');
      result = await repo.removeMember(String(params.id));
      break;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  log('org-api error:', err);
  process.stdout.write(JSON.stringify({ error: String(err.message ?? err) }));
  process.exit(1);
});
