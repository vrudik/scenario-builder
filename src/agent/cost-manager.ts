/**
 * Cost/Token Management
 * 
 * Управление бюджетами и правилами обрезки контекста
 */

/**
 * Бюджет токенов
 */
export interface TokenBudget {
  maxPerExecution: number;
  maxPerDay: number;
  maxPerMonth: number;
  currentExecution: number;
  currentDay: number;
  currentMonth: number;
}

/**
 * Правила обрезки контекста
 */
export interface ContextTrimmingRules {
  maxContextTokens: number;
  preserveSystemMessages: boolean;
  preserveRecentMessages: number; // количество последних сообщений для сохранения
  strategy: 'fifo' | 'lru' | 'importance'; // стратегия обрезки
}

/**
 * Статистика использования токенов
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: Date;
}

/**
 * Cost Manager
 */
export class CostManager {
  private budgets: Map<string, TokenBudget> = new Map();
  private usageHistory: TokenUsage[] = [];

  /**
   * Установка бюджета для сценария
   */
  setBudget(scenarioId: string, budget: Partial<TokenBudget>): void {
    const existing = this.budgets.get(scenarioId) || {
      maxPerExecution: 1000,
      maxPerDay: 10000,
      maxPerMonth: 100000,
      currentExecution: 0,
      currentDay: 0,
      currentMonth: 0
    };

    this.budgets.set(scenarioId, {
      ...existing,
      ...budget
    });
  }

  /**
   * Проверка, можно ли использовать токены
   */
  canUseTokens(scenarioId: string, tokens: number): boolean {
    const budget = this.budgets.get(scenarioId);
    if (!budget) {
      return true; // Если бюджет не установлен, разрешаем
    }

    // Проверяем лимиты
    if (budget.currentExecution + tokens > budget.maxPerExecution) {
      return false;
    }

    const today = new Date().toDateString();
    const todayUsage = this.usageHistory
      .filter(u => new Date(u.timestamp).toDateString() === today)
      .reduce((sum, u) => sum + u.totalTokens, 0);

    if (todayUsage + tokens > budget.maxPerDay) {
      return false;
    }

    return true;
  }

  /**
   * Регистрация использования токенов
   */
  recordUsage(scenarioId: string, usage: TokenUsage): void {
    this.usageHistory.push(usage);

    const budget = this.budgets.get(scenarioId);
    if (budget) {
      budget.currentExecution += usage.totalTokens;
      budget.currentDay += usage.totalTokens;
      budget.currentMonth += usage.totalTokens;
    }
  }

  /**
   * Обрезка контекста согласно правилам
   */
  trimContext(
    messages: Array<{ role: string; content: string }>,
    rules: ContextTrimmingRules
  ): Array<{ role: string; content: string }> {
    // Простая реализация: сохраняем системные сообщения и последние N сообщений
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // Сохраняем последние N сообщений
    const recentMessages = otherMessages.slice(-rules.preserveRecentMessages);

    return [...systemMessages, ...recentMessages];
  }

  /**
   * Получение статистики использования
   */
  getUsageStats(scenarioId: string): {
    execution: number;
    day: number;
    month: number;
    limitExecution: number;
    limitDay: number;
    limitMonth: number;
  } {
    const budget = this.budgets.get(scenarioId);
    if (!budget) {
      return {
        execution: 0,
        day: 0,
        month: 0,
        limitExecution: Infinity,
        limitDay: Infinity,
        limitMonth: Infinity
      };
    }

    return {
      execution: budget.currentExecution,
      day: budget.currentDay,
      month: budget.currentMonth,
      limitExecution: budget.maxPerExecution,
      limitDay: budget.maxPerDay,
      limitMonth: budget.maxPerMonth
    };
  }

  /**
   * Сброс счетчика выполнения
   */
  resetExecution(scenarioId: string): void {
    const budget = this.budgets.get(scenarioId);
    if (budget) {
      budget.currentExecution = 0;
    }
  }
}
