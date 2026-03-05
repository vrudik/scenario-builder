/**
 * Event Bus API - скрипт для выполнения операций Event Bus через командную строку
 * Используется server.cjs для выполнения запросов через tsx
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  connectEventBus,
  disconnectEventBus,
  subscribeToTopics,
  unsubscribeFromTopics,
  publishEvent,
  getEventBusStatus,
  getEvents,
  clearEventBuffer,
  checkKafkaAvailability
} from './event-bus-handler';

// Перенаправляем все логи в stderr
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (...args: any[]) => {
  process.stderr.write('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.warn = (...args: any[]) => {
  process.stderr.write('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.error = (...args: any[]) => {
  process.stderr.write('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

async function main() {
  try {
    const command = process.argv[2];
    const requestFile = process.argv[3];
    
    if (!command || !requestFile) {
      throw new Error('Command and request file required');
    }

    const requestData = JSON.parse(fs.readFileSync(requestFile, 'utf-8'));
    let result: any;

    switch (command) {
      case 'status':
        const brokers = requestData.brokers || ['localhost:9092'];
        const kafkaAvailable = await checkKafkaAvailability(brokers);
        result = {
          ...getEventBusStatus(),
          kafkaAvailable
        };
        break;

      case 'connect':
        result = await connectEventBus(requestData.brokers || ['localhost:9092']);
        break;

      case 'disconnect':
        result = await disconnectEventBus();
        break;

      case 'subscribe':
        result = await subscribeToTopics(requestData.topics, requestData.groupId);
        break;

      case 'unsubscribe':
        result = await unsubscribeFromTopics(requestData.groupId);
        break;

      case 'publish':
        result = await publishEvent(requestData.type, requestData.topic, requestData.payload || {});
        break;

      case 'events':
        result = { events: getEvents(requestData.limit || 100) };
        break;

      case 'clear':
        clearEventBuffer();
        result = { success: true };
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Выводим результат в stdout
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const errorResult = {
      success: false,
      error: {
        code: 'EVENT_BUS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    };
    process.stdout.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

main().catch((error) => {
  const errorResult = {
    success: false,
    error: {
      code: 'EVENT_BUS_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }
  };
  process.stdout.write(JSON.stringify(errorResult) + '\n');
  process.exit(1);
});
