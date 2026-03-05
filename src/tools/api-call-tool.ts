/**
 * API Call Tool
 * 
 * Реализация инструмента для вызова внешних API
 * Поддерживает GET, POST, PUT, DELETE запросы с авторизацией
 */

import { ToolRequest, ToolResponse } from '../gateway/tool-gateway';
import { RegisteredTool } from '../registry/tool-registry';
import { RiskClass } from '../spec/scenario-spec';

export interface ApiCallInputs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * Выполнение вызова внешнего API
 */
export async function executeApiCall(
  request: ToolRequest<ApiCallInputs>
): Promise<ToolResponse> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeout = 10000
  } = request.inputs;
  
  try {
    // Проверка безопасности URL
    const securityCheck = validateUrlSecurity(url);
    if (!securityCheck.allowed) {
      return {
        success: false,
        error: {
          code: 'SECURITY_VIOLATION',
          message: securityCheck.reason || 'URL violates security policy'
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      };
    }
    
    // Выполнение HTTP запроса
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        signal: controller.signal
      };
      
      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOptions.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeoutId);
      
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      let responseData: unknown;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
      
      return {
        success: response.ok,
        outputs: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          data: responseData
        },
        error: response.ok ? undefined : {
          code: `HTTP_${response.status}`,
          message: response.statusText
        },
        metadata: {
          latency: Date.now() - Date.now(), // Будет измерено в gateway
          timestamp: new Date().toISOString(),
          url,
          method
        }
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'TIMEOUT',
            message: `Request timeout after ${timeout}ms`
          },
          metadata: {
            timestamp: new Date().toISOString()
          }
        };
      }
      
      throw fetchError;
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Unknown API error'
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Проверка безопасности URL
 */
function validateUrlSecurity(url: string): { allowed: boolean; reason?: string } {
  try {
    const urlObj = new URL(url);
    
    // Запрещаем внутренние сети (в production это должно быть настроено)
    const forbiddenHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1'
    ];
    
    if (forbiddenHosts.includes(urlObj.hostname)) {
      return {
        allowed: false,
        reason: 'Access to localhost is not allowed'
      };
    }
    
    // Запрещаем приватные IP диапазоны
    const privateIpPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./
    ];
    
    for (const pattern of privateIpPatterns) {
      if (pattern.test(urlObj.hostname)) {
        return {
          allowed: false,
          reason: 'Access to private IP ranges is not allowed'
        };
      }
    }
    
    // Разрешаем только HTTP и HTTPS
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return {
        allowed: false,
        reason: 'Only HTTP and HTTPS protocols are allowed'
      };
    }
    
    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      reason: 'Invalid URL format'
    };
  }
}

/**
 * Регистрация API Call Tool
 */
export function createApiCallTool(): RegisteredTool {
  return {
    id: 'api-call-tool',
    name: 'API Call Tool',
    version: '1.0.0',
    riskClass: RiskClass.MEDIUM, // Средний риск - может вызывать внешние сервисы
    requiresApproval: false,
    inputOutput: {
      inputs: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'API endpoint URL (must be HTTP or HTTPS)'
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            description: 'HTTP method (default: GET)',
            default: 'GET'
          },
          headers: {
            type: 'object',
            description: 'HTTP headers as key-value pairs'
          },
          body: {
            description: 'Request body (for POST, PUT, PATCH methods)'
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in milliseconds (default: 10000)',
            default: 10000
          }
        },
        required: ['url']
      },
      outputs: {
        type: 'object',
        properties: {
          status: { type: 'number' },
          statusText: { type: 'string' },
          headers: { type: 'object' },
          data: { description: 'Response data' }
        }
      }
    },
    sla: {
      availability: 0.90, // Ниже чем у других инструментов - зависит от внешних сервисов
      latency: { p50: 500, p95: 3000, p99: 10000 },
      maxRetries: 2
    },
    authorization: {
      scopes: ['api:call'],
      roles: [],
      requiresApproval: false
    },
    idempotency: {
      supported: false // Зависит от конкретного API
    },
    metadata: {
      version: '1.0.0',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provider: 'http'
    }
  };
}
