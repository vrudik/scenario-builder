/**
 * Tool Registry
 * 
 * Хранит для каждого инструмента:
 * - типизированные входы/выходы
 * - SLA, rate limits
 * - требования авторизации (scopes/roles)
 * - риск-класс действия (безопасно/опасно/требует подтверждения)
 * - правила идемпотентности и дедупликации (например, idempotency keys)
 */

import { Tool, RiskClass } from '../spec';

/**
 * Типизированные входы/выходы инструмента
 */
export interface ToolInputOutput {
  inputs: {
    [key: string]: {
      type: string;
      required: boolean;
      description?: string;
      schema?: unknown; // JSON Schema
    };
  };
  outputs: {
    [key: string]: {
      type: string;
      description?: string;
      schema?: unknown;
    };
  };
}

/**
 * SLA инструмента
 */
export interface ToolSLA {
  availability: number; // 0.99 = 99%
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  maxRetries: number;
}

/**
 * Требования авторизации
 */
export interface AuthorizationRequirements {
  scopes: string[];
  roles: string[];
  requiresApproval: boolean;
}

/**
 * Правила идемпотентности
 */
export interface IdempotencyRules {
  supported: boolean;
  keyHeader?: string; // название заголовка для idempotency key
  ttl?: number; // время жизни ключа в секундах
}

/**
 * Полная информация об инструменте в реестре
 */
export interface RegisteredTool extends Tool {
  inputOutput: ToolInputOutput;
  sla: ToolSLA;
  authorization: AuthorizationRequirements;
  idempotency: IdempotencyRules;
  rateLimit?: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  metadata: {
    version: string;
    registeredAt: string;
    updatedAt: string;
    provider: string;
    documentation?: string;
  };
}

/**
 * Tool Registry
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Регистрация инструмента
   */
  register(tool: RegisteredTool): void {
    this.tools.set(tool.id, {
      ...tool,
      metadata: {
        ...tool.metadata,
        updatedAt: new Date().toISOString()
      }
    });
  }

  /**
   * Получение инструмента по ID
   */
  get(id: string): RegisteredTool | undefined {
    return this.tools.get(id);
  }

  /**
   * Получение всех инструментов
   */
  getAll(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Получение инструментов по риск-классу
   */
  getByRiskClass(riskClass: RiskClass): RegisteredTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.riskClass === riskClass
    );
  }

  /**
   * Проверка существования инструмента
   */
  has(id: string): boolean {
    return this.tools.has(id);
  }

  /**
   * Удаление инструмента
   */
  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  /**
   * Поиск инструментов по имени или тегам
   */
  search(query: string): RegisteredTool[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.tools.values()).filter(
      tool =>
        tool.name.toLowerCase().includes(lowerQuery) ||
        tool.id.toLowerCase().includes(lowerQuery) ||
        tool.metadata.provider.toLowerCase().includes(lowerQuery)
    );
  }
}
