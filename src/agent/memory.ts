/**
 * Memory система для Agent Runtime
 * 
 * Поддерживает:
 * - Short-term memory: текущий контекст разговора/выполнения
 * - Long-term memory: RAG (Retrieval-Augmented Generation) для долгосрочного хранения
 */

/**
 * Запись в short-term памяти
 */
export interface ShortTermMemory {
  id: string;
  timestamp: Date;
  type: 'user_message' | 'agent_response' | 'tool_call' | 'tool_result' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Запись в long-term памяти (для RAG)
 */
export interface LongTermMemory {
  id: string;
  content: string;
  embedding?: number[]; // векторное представление для поиска
  metadata: {
    scenarioId?: string;
    executionId?: string;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Результат поиска в памяти
 */
export interface MemorySearchResult {
  memory: LongTermMemory;
  score: number; // релевантность (0-1)
}

/**
 * Short-term Memory Manager
 */
export class ShortTermMemoryManager {
  private memories: ShortTermMemory[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  /**
   * Добавление записи в память
   */
  add(memory: Omit<ShortTermMemory, 'id' | 'timestamp'>): void {
    const newMemory: ShortTermMemory = {
      ...memory,
      id: `stm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    this.memories.push(newMemory);

    // Ограничиваем размер памяти
    if (this.memories.length > this.maxSize) {
      this.memories.shift(); // Удаляем самую старую запись
    }
  }

  /**
   * Получение последних N записей
   */
  getRecent(count: number = 10): ShortTermMemory[] {
    return this.memories.slice(-count);
  }

  /**
   * Получение всех записей определенного типа
   */
  getByType(type: ShortTermMemory['type']): ShortTermMemory[] {
    return this.memories.filter(m => m.type === type);
  }

  /**
   * Очистка памяти
   */
  clear(): void {
    this.memories = [];
  }

  /**
   * Получение контекста для LLM (последние сообщения)
   */
  getContext(_maxTokens: number = 2000): ShortTermMemory[] {
    // Простая реализация: возвращаем последние записи
    // В реальной системе здесь будет подсчет токенов и обрезка
    return this.getRecent(20);
  }
}

/**
 * Long-term Memory Manager (RAG)
 */
export class LongTermMemoryManager {
  private memories: LongTermMemory[] = [];

  /**
   * Добавление записи в долгосрочную память
   */
  add(memory: Omit<LongTermMemory, 'id' | 'metadata'> & { metadata?: Partial<LongTermMemory['metadata']> }): void {
    const newMemory: LongTermMemory = {
      ...memory,
      id: `ltm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        ...memory.metadata
      }
    };

    this.memories.push(newMemory);
  }

  /**
   * Поиск в долгосрочной памяти (RAG)
   * 
   * В реальной системе здесь будет:
   * 1. Векторизация запроса
   * 2. Поиск похожих векторов (cosine similarity)
   * 3. Возврат топ-K результатов
   */
  search(query: string, limit: number = 5): MemorySearchResult[] {
    // Упрощенная реализация: поиск по ключевым словам
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const results: MemorySearchResult[] = this.memories
      .map(memory => {
        const contentLower = memory.content.toLowerCase();
        const matchingWords = queryWords.filter(word =>
          contentLower.includes(word)
        ).length;
        const score = matchingWords / queryWords.length;

        return {
          memory,
          score
        };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * Получение памяти по ID
   */
  getById(id: string): LongTermMemory | undefined {
    return this.memories.find(m => m.id === id);
  }

  /**
   * Получение памяти по сценарию
   */
  getByScenario(scenarioId: string): LongTermMemory[] {
    return this.memories.filter(m => m.metadata.scenarioId === scenarioId);
  }

  /**
   * Удаление памяти
   */
  delete(id: string): boolean {
    const index = this.memories.findIndex(m => m.id === id);
    if (index !== -1) {
      this.memories.splice(index, 1);
      return true;
    }
    return false;
  }
}
