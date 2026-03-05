/**
 * Router для выбора роли/под-агента
 * 
 * Определяет, какой агент или роль должны обработать запрос
 * на основе контекста, доступных инструментов и политик.
 */

import { ScenarioSpec } from '../spec';
import { RegisteredTool } from '../registry';

/**
 * Роль агента
 */
export interface AgentRole {
  id: string;
  name: string;
  description: string;
  capabilities: string[]; // список возможностей/навыков
  allowedTools: string[]; // список разрешенных инструментов
  priority: number; // приоритет выбора (чем выше, тем приоритетнее)
}

/**
 * Контекст для роутинга
 */
export interface RoutingContext {
  scenarioId: string;
  executionId: string;
  userIntent: string;
  availableTools: RegisteredTool[];
  scenarioSpec: ScenarioSpec;
  userRoles: string[];
  history?: {
    previousRole?: string;
    previousActions: string[];
  };
}

/**
 * Результат роутинга
 */
export interface RoutingResult {
  role: AgentRole;
  confidence: number; // уверенность в выборе (0-1)
  reasoning?: string; // объяснение выбора
}

/**
 * Router для выбора агента
 */
export class AgentRouter {
  private roles: Map<string, AgentRole> = new Map();

  /**
   * Регистрация роли агента
   */
  registerRole(role: AgentRole): void {
    this.roles.set(role.id, role);
  }

  /**
   * Выбор роли на основе контекста
   */
  route(context: RoutingContext): RoutingResult {
    // Получаем все доступные роли
    const availableRoles = Array.from(this.roles.values())
      .filter(role => {
        // Проверяем, есть ли у роли доступ к нужным инструментам
        const requiredTools = context.availableTools.map(t => t.id);
        return role.allowedTools.some(toolId => requiredTools.includes(toolId));
      })
      .sort((a, b) => b.priority - a.priority); // Сортируем по приоритету

    if (availableRoles.length === 0) {
      // Если нет подходящих ролей, создаем дефолтную
      const defaultRole: AgentRole = {
        id: 'default',
        name: 'Default Agent',
        description: 'Default agent for general tasks',
        capabilities: ['general'],
        allowedTools: context.availableTools.map(t => t.id),
        priority: 0
      };
      return {
        role: defaultRole,
        confidence: 0.5,
        reasoning: 'No specific role found, using default'
      };
    }

    // Выбираем роль с наивысшим приоритетом
    const selectedRole = availableRoles[0];
    
    // Вычисляем уверенность на основе соответствия инструментов
    const matchingTools = selectedRole.allowedTools.filter(toolId =>
      context.availableTools.some(t => t.id === toolId)
    ).length;
    const confidence = Math.min(1.0, matchingTools / context.availableTools.length);

    return {
      role: selectedRole,
      confidence,
      reasoning: `Selected role "${selectedRole.name}" based on tool availability and priority`
    };
  }

  /**
   * Получение роли по ID
   */
  getRole(roleId: string): AgentRole | undefined {
    return this.roles.get(roleId);
  }

  /**
   * Получение всех ролей
   */
  getAllRoles(): AgentRole[] {
    return Array.from(this.roles.values());
  }
}
