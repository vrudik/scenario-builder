/**
 * Event Bus Handler для веб-интерфейса
 * 
 * Управляет подключением к Event Bus и обработкой событий через HTTP API
 */

import { KafkaEventBus, IEventBus, BaseEvent, createEvent } from '../events';

// Глобальный экземпляр Event Bus
let globalEventBus: IEventBus | null = null;
let eventBuffer: BaseEvent[] = [];
const MAX_BUFFER_SIZE = 1000;

/**
 * Подключение к Event Bus
 */
export async function connectEventBus(brokers: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (globalEventBus && globalEventBus.isConnected()) {
      return { success: true };
    }

    globalEventBus = new KafkaEventBus({
      brokers,
      clientId: 'scenario-builder-web',
      groupId: 'web-consumer',
      enableIdempotence: true
    });

    await globalEventBus.connect();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Отключение от Event Bus
 */
export async function disconnectEventBus(): Promise<{ success: boolean; error?: string }> {
  try {
    if (globalEventBus) {
      await globalEventBus.disconnect();
      globalEventBus = null;
      eventBuffer = [];
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Подписка на топики
 */
export async function subscribeToTopics(
  topics: string[],
  groupId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!globalEventBus || !globalEventBus.isConnected()) {
      return { success: false, error: 'Event Bus is not connected' };
    }

    await globalEventBus.subscribe({
      topics,
      groupId,
      fromBeginning: false,
      handler: async (event: BaseEvent) => {
        // Сохраняем событие в буфер
        // ВАЖНО: этот буфер используется только внутри процесса tsx
        // Для веб-интерфейса события должны сохраняться в server.cjs
        eventBuffer.unshift(event);
        if (eventBuffer.length > MAX_BUFFER_SIZE) {
          eventBuffer.pop();
        }
        console.log(`[EventBus] Received event: ${event.type} (eventId: ${event.metadata.eventId})`);
      }
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Отписка от топиков
 */
export async function unsubscribeFromTopics(groupId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!globalEventBus || !globalEventBus.isConnected()) {
      return { success: false, error: 'Event Bus is not connected' };
    }

    const groupIdToUse = groupId || 'web-consumer';
    await globalEventBus.unsubscribe(groupIdToUse);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Публикация события
 */
export async function publishEvent(
  type: string,
  topic: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Создаем событие
    const event = createEvent(type, payload);
    
    // Сохраняем событие в буфер сразу (для отображения в UI)
    eventBuffer.unshift(event);
    if (eventBuffer.length > MAX_BUFFER_SIZE) {
      eventBuffer.pop();
    }
    
    // Публикуем в Kafka, если Event Bus подключен
    if (globalEventBus && globalEventBus.isConnected()) {
      await globalEventBus.publish(event, {
        topic,
        key: payload.executionId as string || event.metadata.eventId
      });
    } else {
      // Если Kafka не подключен, просто сохраняем в буфер
      console.log('[EventBus] Event saved to buffer (Kafka not connected):', event.type);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Получение статуса Event Bus
 */
export function getEventBusStatus(): {
  connected: boolean;
  kafkaAvailable: boolean;
  bufferSize: number;
} {
  return {
    connected: globalEventBus ? globalEventBus.isConnected() : false,
    kafkaAvailable: false, // Будет проверяться отдельно
    bufferSize: eventBuffer.length
  };
}

/**
 * Получение событий из буфера
 */
export function getEvents(limit: number = 100): BaseEvent[] {
  return eventBuffer.slice(0, limit);
}

/**
 * Очистка буфера событий
 */
export function clearEventBuffer(): void {
  eventBuffer = [];
}

/**
 * Проверка доступности Kafka
 */
export async function checkKafkaAvailability(brokers: string[]): Promise<boolean> {
  try {
    // Простая проверка: пытаемся создать временное подключение
    const testBus = new KafkaEventBus({
      brokers,
      clientId: 'kafka-check',
      enableIdempotence: false
    });

    await testBus.connect();
    await testBus.disconnect();
    return true;
  } catch {
    return false;
  }
}
