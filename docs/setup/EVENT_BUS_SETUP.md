# Event Bus Setup Guide

## Обзор

Event Bus обеспечивает event-driven архитектуру для системы, используя Apache Kafka для гарантированной доставки событий, идемпотентности и fault-tolerance.

## Установка Kafka

### Вариант 1: Docker (рекомендуется)

```bash
# Запуск Kafka через Docker Compose
docker-compose up -d kafka zookeeper
```

Создайте файл `docker-compose.yml`:

```yaml
version: '3.8'
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
```

### Вариант 2: Локальная установка

Следуйте инструкциям на [kafka.apache.org](https://kafka.apache.org/downloads)

## Конфигурация

### Переменные окружения

```bash
# Адреса Kafka брокеров (разделенные запятыми)
export KAFKA_BROKERS=localhost:9092

# Включить/выключить Event Bus (по умолчанию включен)
export ENABLE_EVENT_BUS=true
```

### Использование в коде

```typescript
import { KafkaEventBus } from './src/events';

const eventBus = new KafkaEventBus({
  brokers: ['localhost:9092'],
  clientId: 'my-app',
  groupId: 'my-consumer-group',
  enableIdempotence: true
});

await eventBus.connect();
```

## Использование

### Публикация событий

События автоматически публикуются Orchestrator при выполнении workflow:

- `workflow.trigger` - запуск выполнения
- `workflow.node_completed` - успешное завершение узла
- `workflow.node_failed` - ошибка выполнения узла
- `workflow.compensation` - выполнение компенсации

### Подписка на события

```typescript
await eventBus.subscribe({
  topics: ['scenario.*.events'],
  handler: async (event) => {
    console.log('Received event:', event);
  }
});
```

## Топики

Топики создаются автоматически при первой публикации события.

Формат имени топика: `scenario.{scenario-prefix}.events`

Например:
- `scenario.exec.events` - события выполнения
- `scenario.test.events` - тестовые события

## Идемпотентность

Event Bus обеспечивает идемпотентность через:
- `idempotencyKey` в метаданных события
- Настройка Kafka producer с `idempotent: true`
- Гарантия порядка сообщений через партиционирование по `executionId`

## Fault Tolerance

- Автоматические retry при ошибках публикации
- Сохранение событий в локальной истории даже при недоступности Kafka
- Graceful degradation: система продолжает работать без Event Bus

## Тестирование

### Запуск примера

```bash
npm run example:event-bus
```

Или:

```bash
tsx examples/event-bus-example.ts
```

### Проверка событий в Kafka

```bash
# Просмотр топиков
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# Просмотр сообщений в топике
docker exec -it kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic scenario.exec.events --from-beginning
```

## Troubleshooting

### Kafka недоступен

Если Kafka недоступен, система продолжит работу без Event Bus. События будут сохраняться только в локальной истории.

### Ошибки подключения

Проверьте:
1. Запущен ли Kafka: `docker ps | grep kafka`
2. Правильность адреса брокера: `KAFKA_BROKERS=localhost:9092`
3. Доступность порта: `telnet localhost 9092`

### События не публикуются

Проверьте логи:
- `[EventBus] Failed to publish event` - ошибка публикации
- `[Orchestrator] Failed to publish event to Event Bus` - ошибка в Orchestrator

## Дополнительные ресурсы

- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [kafkajs Documentation](https://kafka.js.org/)
