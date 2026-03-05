/**
 * Event Bus - абстракция для event-driven архитектуры
 * 
 * Поддерживает:
 * - Публикацию событий с гарантированной доставкой
 * - Подписку на события с обработкой
 * - Идемпотентность через idempotency keys
 * - Fault-tolerance и retry механизмы
 */

/**
 * Метаданные события
 */
export interface EventMetadata {
  eventId: string;
  correlationId: string; // для отслеживания цепочки событий
  causationId?: string; // ID события, которое вызвало это событие
  idempotencyKey?: string; // для идемпотентности
  timestamp: Date;
  source: string;
  version: string;
}

/**
 * Базовое событие
 */
export interface BaseEvent {
  type: string;
  payload: Record<string, unknown>;
  metadata: EventMetadata;
}

/**
 * Конфигурация Event Bus
 */
export interface EventBusConfig {
  brokers: string[];
  clientId: string;
  groupId?: string; // для consumer groups
  enableIdempotence?: boolean;
  retryConfig?: {
    maxRetries: number;
    initialRetryDelay: number;
    maxRetryDelay: number;
  };
}

/**
 * Обработчик событий
 */
export type EventHandler<T = BaseEvent> = (event: T) => Promise<void>;

/**
 * Опции публикации события
 */
export interface PublishOptions {
  topic: string;
  partition?: number;
  key?: string; // для партиционирования
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

/**
 * Опции подписки на события
 */
export interface SubscribeOptions {
  topics: string[];
  groupId?: string;
  fromBeginning?: boolean;
  handler: EventHandler;
}

/**
 * Event Bus интерфейс
 */
export interface IEventBus {
  /**
   * Публикация события
   */
  publish(event: BaseEvent, options: PublishOptions): Promise<void>;

  /**
   * Подписка на события
   */
  subscribe(options: SubscribeOptions): Promise<void>;

  /**
   * Отключение от подписки
   */
  unsubscribe(groupId: string): Promise<void>;

  /**
   * Подключение к брокеру
   */
  connect(): Promise<void>;

  /**
   * Отключение от брокера
   */
  disconnect(): Promise<void>;

  /**
   * Проверка подключения
   */
  isConnected(): boolean;
}
