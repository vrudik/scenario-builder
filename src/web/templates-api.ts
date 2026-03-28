/**
 * API шаблонов (Prisma Template). Вызывается из server.cjs через tsx.
 */

import { prisma } from '../db';
import { normalizeTenantId } from '../utils/tenant-id';

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;

console.log = (...args: unknown[]) => {
  process.stderr.write(
    '[LOG] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n'
  );
};
console.warn = (...args: unknown[]) => {
  process.stderr.write(
    '[WARN] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n'
  );
};
console.error = (...args: unknown[]) => {
  process.stderr.write(
    '[ERROR] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n'
  );
};
console.info = (...args: unknown[]) => {
  process.stderr.write(
    '[INFO] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ') + '\n'
  );
};

interface UiTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
    default?: unknown;
  }>;
  spec: unknown;
  version: string;
  difficulty: string;
  isPublished: boolean;
  mockConfig: unknown | null;
  guide: string | null;
}

function mapRow(row: {
  id: string;
  name: string;
  description: string | null;
  category: string;
  spec: string;
  tags: string | null;
  version?: string;
  difficulty?: string;
  isPublished?: boolean;
  mockConfig?: string | null;
  guide?: string | null;
}): UiTemplate {
  let tags: string[] = [];
  try {
    tags = row.tags ? (JSON.parse(row.tags) as string[]) : [];
    if (!Array.isArray(tags)) tags = [];
  } catch {
    tags = [];
  }
  let spec: unknown = {};
  try {
    spec = JSON.parse(row.spec);
  } catch {
    spec = {};
  }
  let mockConfig: unknown | null = null;
  try {
    mockConfig = row.mockConfig ? JSON.parse(row.mockConfig) : null;
  } catch {
    mockConfig = null;
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    category: row.category,
    tags,
    parameters: [],
    spec,
    version: row.version ?? '1.0.0',
    difficulty: row.difficulty ?? 'beginner',
    isPublished: row.isPublished ?? false,
    mockConfig,
    guide: row.guide ?? null,
  };
}

async function main() {
  let result: unknown;
  try {
    const command = process.argv[2];
    const arg3 = process.argv[3] || '{}';
    let requestData: Record<string, unknown>;
    if (arg3.includes('/') || arg3.includes('\\') || arg3.endsWith('.json')) {
      const fs = await import('fs');
      requestData = JSON.parse(fs.readFileSync(arg3, 'utf-8'));
    } else {
      requestData = JSON.parse(arg3);
    }

    const tenantId = normalizeTenantId(
      (requestData._tenantId as string | undefined) ?? (requestData.tenantId as string | undefined)
    );

    switch (command) {
      case 'list-templates': {
        const rows = await prisma.template.findMany({
          where: { tenantId },
          orderBy: { updatedAt: 'desc' }
        });
        result = { success: true, data: rows.map(mapRow) };
        break;
      }

      case 'get-template': {
        const templateId = requestData.templateId as string;
        if (!templateId) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'templateId is required' }
          };
          break;
        }
        const row = await prisma.template.findFirst({
          where: { id: templateId, tenantId }
        });
        if (!row) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' }
          };
          break;
        }
        result = { success: true, data: mapRow(row) };
        break;
      }

      case 'search-templates': {
        const category = requestData.category as string | undefined;
        const nameQ = requestData.name as string | undefined;
        const tagList = ((requestData.tags as string[]) || []).filter(Boolean);
        const rows = await prisma.template.findMany({
          where: {
            tenantId,
            ...(category ? { category } : {}),
            ...(nameQ ? { name: { contains: nameQ } } : {})
          },
          orderBy: { updatedAt: 'desc' }
        });
        let filtered = rows;
        if (tagList.length) {
          filtered = rows.filter((r) => {
            try {
              const parsed = r.tags ? (JSON.parse(r.tags) as string[]) : [];
              if (Array.isArray(parsed)) {
                return tagList.some((t) => parsed.includes(t));
              }
            } catch {
              /* ignore */
            }
            const raw = r.tags || '';
            return tagList.some((t) => raw.includes(t));
          });
        }
        result = { success: true, data: filtered.map(mapRow) };
        break;
      }

      case 'apply-template': {
        const templateId = requestData.templateId as string;
        const parameters = (requestData.parameters as Record<string, unknown>) || {};
        const overrides = (requestData.overrides as Record<string, unknown>) || {};
        if (!templateId) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'templateId is required' }
          };
          break;
        }
        const row = await prisma.template.findFirst({
          where: { id: templateId, tenantId }
        });
        if (!row) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' }
          };
          break;
        }
        let spec: Record<string, unknown>;
        try {
          spec = JSON.parse(row.spec) as Record<string, unknown>;
        } catch {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid template spec JSON' }
          };
          break;
        }
        if (parameters && typeof parameters === 'object') {
          for (const [k, v] of Object.entries(parameters)) {
            if (v !== undefined) {
              spec[k] = v;
            }
          }
        }
        const scenarioName =
          (typeof overrides.name === 'string' && overrides.name) || row.name;
        const scenarioDescription =
          (typeof overrides.description === 'string' && overrides.description) ||
          row.description ||
          '';
        result = {
          success: true,
          data: {
            name: scenarioName,
            description: scenarioDescription,
            spec,
            version: '1.0.0'
          }
        };
        break;
      }

      case 'instantiate': {
        const templateId = requestData.templateId as string;
        if (!templateId) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'templateId is required' }
          };
          break;
        }
        const tplRow = await prisma.template.findFirst({
          where: { id: templateId, tenantId }
        });
        if (!tplRow) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' }
          };
          break;
        }
        let tplSpec: Record<string, unknown>;
        try {
          tplSpec = JSON.parse(tplRow.spec) as Record<string, unknown>;
        } catch {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid template spec JSON' }
          };
          break;
        }
        const overrideName = (requestData.name as string) || tplRow.name;
        const overrideDesc = (requestData.description as string) || tplRow.description || '';
        const scenario = await prisma.scenario.create({
          data: {
            name: overrideName,
            description: overrideDesc,
            spec: JSON.stringify(tplSpec),
            version: tplRow.version ?? '1.0.0',
            status: 'draft',
            tenantId,
          }
        });
        result = {
          success: true,
          data: {
            scenarioId: scenario.id,
            name: scenario.name,
            description: scenario.description,
            spec: tplSpec,
            version: scenario.version,
            status: scenario.status,
            templateId: tplRow.id,
          }
        };
        break;
      }

      default:
        result = {
          success: false,
          error: { code: 'INVALID_COMMAND', message: `Unknown command: ${command}` }
        };
    }
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : String(error);
    errorMessage = errorMessage.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
    errorMessage = errorMessage.replace(/\/[^\s"]+/g, '[path]');
    if (errorMessage.length > 500) {
      errorMessage = errorMessage.substring(0, 500) + '...';
    }
    result = {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: errorMessage }
    };
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
  }

  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((error) => {
  let errorMessage = error.message || 'Unknown error';
  errorMessage = errorMessage.replace(/[A-Z]:\\[^\s]+/g, '[path]');
  errorMessage = errorMessage.replace(/\/[^\s]+/g, '[path]');
  if (errorMessage.length > 500) {
    errorMessage = errorMessage.substring(0, 500) + '...';
  }
  process.stderr.write(`Unhandled error in templates-api: ${errorMessage}\n`);
  process.stdout.write(
    JSON.stringify({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: errorMessage }
    }) + '\n'
  );
  process.exit(1);
});
