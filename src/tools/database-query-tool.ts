/**
 * Database Query Tool
 */

import { ToolRequest, ToolResponse } from '../gateway/tool-gateway';
import { RegisteredTool } from '../registry/tool-registry';
import { RiskClass } from '../spec/scenario-spec';

export interface DatabaseQueryInputs {
  query: string;
  database?: string;
  parameters?: Record<string, unknown>;
}

export async function executeDatabaseQuery(request: ToolRequest): Promise<ToolResponse> {
  const { query, database = 'default', parameters = {} } = request.inputs as unknown as DatabaseQueryInputs;

  try {
    const securityCheck = validateQuerySecurity(query);
    if (!securityCheck.allowed) {
      return {
        success: false,
        error: { code: 'SECURITY_VIOLATION', message: securityCheck.reason || 'Query violates security policy' },
        metadata: { latency: 0, timestamp: new Date().toISOString() }
      };
    }

    const simulatedResults = simulateDatabaseQuery(query, database, parameters);
    return {
      success: true,
      outputs: {
        results: simulatedResults,
        query,
        database,
        rowCount: simulatedResults.length
      },
      metadata: { latency: 50, timestamp: new Date().toISOString() }
    };
  } catch (error) {
    return {
      success: false,
      error: { code: 'DATABASE_ERROR', message: error instanceof Error ? error.message : 'Unknown database error' },
      metadata: { latency: 0, timestamp: new Date().toISOString() }
    };
  }
}

function validateQuerySecurity(query: string): { allowed: boolean; reason?: string } {
  const upperQuery = query.toUpperCase().trim();
  const dangerousKeywords = [
    'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE',
    'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL'
  ];

  for (const keyword of dangerousKeywords) {
    if (upperQuery.includes(keyword)) {
      return { allowed: false, reason: `Query contains forbidden keyword: ${keyword}` };
    }
  }

  if (!upperQuery.startsWith('SELECT')) {
    return { allowed: false, reason: 'Only SELECT queries are allowed' };
  }

  return { allowed: true };
}

function simulateDatabaseQuery(
  query: string,
  _database: string,
  _parameters: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (query.toUpperCase().includes('USERS')) {
    return [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ];
  }

  if (query.toUpperCase().includes('PRODUCTS')) {
    return [
      { id: 1, name: 'Product A', price: 99.99, stock: 10 },
      { id: 2, name: 'Product B', price: 149.99, stock: 5 }
    ];
  }

  return [
    { id: 1, value: 'Result 1' },
    { id: 2, value: 'Result 2' }
  ];
}

export function createDatabaseQueryTool(): RegisteredTool {
  return {
    id: 'database-query-tool',
    name: 'Database Query Tool',
    version: '1.0.0',
    riskClass: RiskClass.HIGH,
    requiresApproval: true,
    inputOutput: {
      inputs: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'SQL SELECT query (only SELECT queries are allowed)' },
          database: { type: 'string', default: 'default' },
          parameters: { type: 'object' }
        },
        required: ['query']
      },
      outputs: {
        type: 'object',
        properties: {
          results: { type: 'array', items: { type: 'object' } },
          query: { type: 'string' },
          database: { type: 'string' },
          rowCount: { type: 'number' }
        }
      }
    },
    sla: { availability: 0.99, latency: { p50: 50, p95: 200, p99: 500 }, maxRetries: 1 },
    authorization: { scopes: ['database:read'], roles: ['admin', 'analyst'], requiresApproval: true },
    idempotency: { supported: true },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'internal'
    }
  };
}
