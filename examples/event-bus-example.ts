/**
 * Пример использования Event Bus для подписки на события workflow
 * 
 * Этот пример демонстрирует:
 * - Подключение к Kafka Event Bus
 * - Подписку на события workflow
 * - Обработку событий
 */

import { KafkaEventBus, IEventBus, BaseEvent, createEvent } from '../src/events';

async function main() {
  // Создание Event Bus
  const eventBus: IEventBus = new KafkaEventBus({
    brokers: ['localhost:9092'],
    clientId: 'event-bus-example',
    groupId: 'example-consumer',
    enableIdempotence: true
  });

  try {
    // Подключение к Kafka
    await eventBus.connect();
    console.log('✅ Connected to Event Bus');

    // Подписка на события workflow
    await eventBus.subscribe({
      topics: ['scenario.*.events'], // Подписываемся на все события сценариев
      groupId: 'example-consumer',
      fromBeginning: false, // Читаем только новые события
      handler: async (event: BaseEvent) => {
        console.log('\n📨 Received event:');
        console.log(`  Type: ${event.type}`);
        console.log(`  Event ID: ${event.metadata.eventId}`);
        console.log(`  Correlation ID: ${event.metadata.correlationId}`);
        console.log(`  Payload:`, JSON.stringify(event.payload, null, 2));
        console.log(`  Timestamp: ${event.metadata.timestamp.toISOString()}`);
        
        // Здесь можно добавить свою логику обработки событий
        // Например, отправка уведомлений, обновление дашборда, логирование и т.д.
      }
    });

    console.log('✅ Subscribed to workflow events');
    console.log('📡 Listening for events... (Press Ctrl+C to stop)');

    // Публикация тестового события
    const testEvent = createEvent(
      'workflow.trigger',
      {
        executionId: 'test-exec-123',
        scenarioId: 'test-scenario',
        userIntent: 'Test event'
      }
    );

    await eventBus.publish(testEvent, {
      topic: 'scenario.test.events',
      key: 'test-exec-123'
    });

    console.log('✅ Published test event');

    // Ожидание событий (в реальном приложении это будет долгоживущий процесс)
    // Здесь просто ждем некоторое время для демонстрации
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Отключение от Event Bus
    await eventBus.disconnect();
    console.log('✅ Disconnected from Event Bus');
  }
}

// Запуск примера
main().catch(console.error);
