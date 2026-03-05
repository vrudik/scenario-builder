/**
 * Database Query Tool
 * 
 * Реализация инструмента для выполнения запросов к базе данных
 * Поддерживает SQL запросы с ограничениями безопасности
 */

import { ToolRequest, ToolResponse } from '../gateway/tool-gateway';
import { RegisteredTool } from '../registry/tool-registry';
import { RiskClass } from '../spec/scenario-spec';

export interface DatabaseQueryInputs {
  query: string;
  database?: string;
  parameters?: Record<string, unknown>;
}

/**
 * Выполнение запроса к базе данных
 * 
 * ВНИМАНИЕ: В production это должно быть строго ограничено
 * и проверяться через guardrails
 */
export async function executeDatabaseQuery(
  request: ToolRequest<DatabaseQueryInputs>
): Promise<ToolResponse> {
  const { query, database = 'default', parameters = {} } = request.inputs;
  
  try {
    // Проверка безопасности запроса
    const securityCheck = validateQuerySecurity(query);
    if (!securityCheck.allowed) {
      return {
        success: false,
        error: {
          code: 'SECURITY_VIOLATION',
          message: securityCheck.reason || 'Query violates security policy'
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // В production здесь будет реальное подключение к БД
    // Для демонстрации возвращаем симулированные данные
    const simulatedResults = simulateDatabaseQuery(query, database, parameters);
    
    return {
      success: true,
      outputs: {
        results: simulatedResults,
        query,
        database,
        rowCount: simulatedResults.length
      },
      metadata: {
        latency: 50, // Симулированная задержка
        timestamp: new Date().toISOString(),
        database
      }
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown database error'
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Проверка безопасности SQL запроса
 */
function validateQuerySecurity(query: string): { allowed: boolean; reason?: string } {
  const upperQuery = query.toUpperCase().trim();
  
  // Запрещаем опасные операции
  const dangerousKeywords = [
    'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE',
    'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL'
  ];
  
  for (const keyword of dangerousKeywords) {
    if (upperQuery.includes(keyword)) {
      return {
        allowed: false,
        reason: `Query contains forbidden keyword: ${keyword}`
      };
    }
  }
  
  // Разрешаем только SELECT запросы
  if (!upperQuery.startsWith('SELECT')) {
    return {
      allowed: false,
      reason: 'Only SELECT queries are allowed'
    };
  }
  
  return { allowed: true };
}

/**
 * Симуляция выполнения запроса к БД
 */
function simulateDatabaseQuery(
  query: string,
  database: string,
  parameters: Record<string, unknown>
): Array<Record<string, unknown>> {
  // В production здесь будет реальный запрос к БД
  // Для демонстрации возвращаем примерные данные
  
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
  
  // Общий случай
  return [
    { id: 1, value: 'Result 1' },
    { id: 2, value: 'Result 2' }
  ];
}

/**
 * Регистрация Database Query Tool
 */
export function createDatabaseQueryTool(): RegisteredTool {
  return {
    id: 'database-query-tool',
    name: 'Database Query Tool',
    version: '1.0.0',
    riskClass: RiskClass.HIGH, // Высокий риск - требует особой осторожности
    requiresApproval: true, // Требует одобрения
    inputOutput: {
      inputs: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL SELECT query (only SELECT queries are allowed)'
          },
          database: {
            type: 'string',
            description: 'Database name (default: default)',
            default: 'default'
          },
          parameters: {
            type: 'object',
            description: 'Query parameters for parameterized queries'
          }
        },
        required: ['query']
      },
      outputs: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: { type: 'object' }
          },
          query: { type: 'string' },
          database: { type: 'string' },
          rowCount: { type: 'number' }
        }
      }
    },
    sla: {
      availability: 0.99,
      latency: { p50: 50, p95: 200, p99: 500 },
      maxRetries: 1 // Минимум retry для БД запросов
    },
    authorization: {
      scopes: ['database:read'],
      roles: ['admin', 'analyst'],
      requiresApproval: true
    },
    idempotency: {
      supported: true // SELECT запросы идемпотентны
    },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'internal'
    }
  };
}
