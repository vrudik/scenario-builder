/**
 * Kafka Event Bus - реализация Event Bus через Kafka
 * 
 * Обеспечивает:
 * - Гарантированную доставку (at-least-once)
 * - Идемпотентность через idempotency keys
 * - Fault-tolerance через retry механизмы
 * - Партиционирование для масштабирования
 */

import { Kafka, Producer, Consumer, KafkaMessage, logLevel } from 'kafkajs';
import { IEventBus, BaseEvent, EventBusConfig, PublishOptions, SubscribeOptions, EventHandler } from './event-bus';
import { randomUUID } from 'crypto';

export class KafkaEventBus implements IEventBus {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private config: EventBusConfig;
  private connected: boolean = false;

  constructor(config: EventBusConfig) {
    this.config = {
      enableIdempotence: true,
      retryConfig: {
        maxRetries: 5,
        initialRetryDelay: 100,
        maxRetryDelay: 1000
      },
      ...config
    };

    this.kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
      logLevel: logLevel.INFO,
      retry: {
        retries: this.config.retryConfig?.maxRetries || 5,
        initialRetryTime: this.config.retryConfig?.initialRetryDelay || 100,
        maxRetryTime: this.config.retryConfig?.maxRetryDelay || 1000
      }
    });
  }

  async connect(): Promise<void> {
    try {
      // Создаем producer с идемпотентностью
      this.producer = this.kafka.producer({
        idempotent: this.config.enableIdempotence || true,
        maxInFlightRequests: 1, // для гарантии порядка
        transactionTimeout: 30000
      });

      await this.producer.connect();
      this.connected = true;
      console.log(`[EventBus] Connected to Kafka brokers: ${this.config.brokers.join(', ')}`);
    } catch (error) {
      console.error('[EventBus] Failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Отключаем producer
      if (this.producer) {
        await this.producer.disconnect();
        this.producer = null;
      }

      // Отключаем всех consumers
      for (const [groupId, consumer] of this.consumers.entries()) {
        await consumer.disconnect();
      }
      this.consumers.clear();

      this.connected = false;
      console.log('[EventBus] Disconnected from Kafka');
    } catch (error) {
      console.error('[EventBus] Error during disconnect:', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected && this.producer !== null;
  }

  async publish(event: BaseEvent, options: PublishOptions): Promise<void> {
    if (!this.producer || !this.connected) {
      throw new Error('EventBus is not connected. Call connect() first.');
    }

    try {
      // Формируем сообщение для Kafka
      const message: KafkaMessage = {
        key: options.key || event.metadata.eventId,
        value: JSON.stringify({
          type: event.type,
          payload: event.payload,
          metadata: {
            ...event.metadata,
            timestamp: event.metadata.timestamp.toISOString()
          }
        }),
        headers: {
          'event-type': event.type,
          'correlation-id': event.metadata.correlationId,
          ...(event.metadata.causationId && { 'causation-id': event.metadata.causationId }),
          ...(event.metadata.idempotencyKey && { 'idempotency-key': event.metadata.idempotencyKey }),
          ...options.headers
        }
      };

      // Публикуем событие
      await this.producer.send({
        topic: options.topic,
        messages: [message],
        ...(options.partition !== undefined && { partition: options.partition })
      });

      console.log(`[EventBus] Published event ${event.type} to topic ${options.topic} (eventId: ${event.metadata.eventId})`);
    } catch (error) {
      console.error(`[EventBus] Failed to publish event ${event.type}:`, error);
      throw error;
    }
  }

  async subscribe(options: SubscribeOptions): Promise<void> {
    if (!this.connected) {
      throw new Error('EventBus is not connected. Call connect() first.');
    }

    const groupId = options.groupId || this.config.groupId || `${this.config.clientId}-consumer`;
    
    // Проверяем, не подписан ли уже этот consumer group
    if (this.consumers.has(groupId)) {
      console.warn(`[EventBus] Consumer group ${groupId} already exists. Unsubscribing first.`);
      await this.unsubscribe(groupId);
    }

    try {
      // Создаем consumer
      const consumer = this.kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: 1048576, // 1MB
        allowAutoTopicCreation: true // разрешаем автоматическое создание топиков
      });

      await consumer.connect();
      await consumer.subscribe({
        topics: options.topics,
        fromBeginning: options.fromBeginning || false
      });

      // Запускаем обработку сообщений
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            if (!message.value) {
              console.warn(`[EventBus] Received empty message from topic ${topic}, partition ${partition}`);
              return;
            }

            // Парсим событие
            const eventData = JSON.parse(message.value.toString());
            
            // Восстанавливаем timestamp
            eventData.metadata.timestamp = new Date(eventData.metadata.timestamp);

            const event: BaseEvent = {
              type: eventData.type,
              payload: eventData.payload,
              metadata: eventData.metadata
            };

            // Обрабатываем событие
            await options.handler(event);

            console.log(`[EventBus] Processed event ${event.type} from topic ${topic} (eventId: ${event.metadata.eventId})`);
          } catch (error) {
            console.error(`[EventBus] Error processing message from topic ${topic}, partition ${partition}:`, error);
            // В production здесь должна быть логика для DLQ (Dead Letter Queue)
            throw error; // Перебрасываем ошибку, чтобы Kafka мог повторить обработку
          }
        }
      });

      this.consumers.set(groupId, consumer);
      console.log(`[EventBus] Subscribed to topics: ${options.topics.join(', ')} (groupId: ${groupId})`);
    } catch (error) {
      console.error(`[EventBus] Failed to subscribe to topics ${options.topics.join(', ')}:`, error);
      throw error;
    }
  }

  async unsubscribe(groupId: string): Promise<void> {
    const consumer = this.consumers.get(groupId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(groupId);
      console.log(`[EventBus] Unsubscribed from group ${groupId}`);
    }
  }
}

/**
 * Вспомогательная функция для создания события
 */
export function createEvent(
  type: string,
  payload: Record<string, unknown>,
  correlationId?: string,
  causationId?: string,
  idempotencyKey?: string
): BaseEvent {
  return {
    type,
    payload,
    metadata: {
      eventId: randomUUID(),
      correlationId: correlationId || randomUUID(),
      causationId,
      idempotencyKey: idempotencyKey || randomUUID(),
      timestamp: new Date(),
      source: 'scenario-builder',
      version: '1.0.0'
    }
  };
}
