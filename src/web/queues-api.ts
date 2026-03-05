/**
 * API для работы с очередями сценариев через БД
 * Используется через tsx из server.cjs
 */

import { QueueRepository } from '../db/repositories';
import { prisma } from '../db';

// Перенаправляем все логи в stderr
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;

console.log = (...args: any[]) => {
  process.stderr.write('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.warn = (...args: any[]) => {
  process.stderr.write('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.error = (...args: any[]) => {
  process.stderr.write('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.info = (...args: any[]) => {
  process.stderr.write('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

async function main() {
  let result: any;
  try {
    const command = process.argv[2];
    const arg3 = process.argv[3] || '{}';
    
    // Если arg3 похож на путь к файлу (содержит слеши или обратные слеши), читаем из файла
    let requestData: any;
    if (arg3.includes('/') || arg3.includes('\\') || arg3.endsWith('.json')) {
      // Это путь к файлу
      const fs = await import('fs');
      const fileContent = fs.readFileSync(arg3, 'utf-8');
      requestData = JSON.parse(fileContent);
    } else {
      // Это JSON строка
      requestData = JSON.parse(arg3);
    }
    
    const queueRepo = new QueueRepository(prisma);

    switch (command) {
      case 'list':
        // GET /api/queues
        const { status, limit, offset } = requestData;
        const queues = await queueRepo.findAll({
          status,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });
        result = { success: true, queues };
        break;

      case 'get':
        // GET /api/queues/:id
        const queue = await queueRepo.findById(requestData.id);
        if (!queue) {
          result = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Queue not found' }
          };
        } else {
          result = { success: true, queue };
        }
        break;

      case 'create':
        // POST /api/queues
        const { name, description, priority, maxConcurrency, retryConfig } = requestData;
        
        if (!name) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'name is required' }
          };
          break;
        }

        const newQueue = await queueRepo.create({
          name,
          description,
          priority,
          maxConcurrency,
          retryConfig,
        });
        result = { success: true, queue: newQueue };
        break;

      case 'update':
        // PUT /api/queues/:id
        const updateData = requestData;
        const updatedQueue = await queueRepo.update(updateData.id, {
          name: updateData.name,
          description: updateData.description,
          priority: updateData.priority,
          maxConcurrency: updateData.maxConcurrency,
          retryConfig: updateData.retryConfig,
          status: updateData.status,
        });
        result = { success: true, queue: updatedQueue };
        break;

      case 'delete':
        // DELETE /api/queues/:id
        await queueRepo.delete(requestData.id);
        result = { success: true };
        break;

      case 'add-trigger':
        // POST /api/queues/:id/triggers
        const { queueId, eventType, topic, filter } = requestData;
        
        if (!queueId || !eventType || !topic) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'queueId, eventType, and topic are required' }
          };
          break;
        }

        const trigger = await queueRepo.createTrigger({
          queueId,
          eventType,
          topic,
          filter,
        });
        result = { success: true, trigger };
        break;

      case 'remove-trigger':
        // DELETE /api/queues/:id/triggers/:triggerId
        await queueRepo.deleteTrigger(requestData.triggerId);
        result = { success: true };
        break;

      case 'add-job':
        // POST /api/queues/:id/jobs
        const { scenarioId, input, eventId, correlationId, maxRetries } = requestData;
        
        if (!requestData.queueId || !scenarioId) {
          result = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'queueId and scenarioId are required' }
          };
          break;
        }

        const job = await queueRepo.createJob({
          queueId: requestData.queueId,
          scenarioId,
          priority: requestData.priority,
          input,
          eventId,
          correlationId,
          maxRetries,
        });
        result = { success: true, job };
        break;

      case 'get-jobs':
        // GET /api/queues/:id/jobs
        const jobs = await queueRepo.findJobsByQueue(requestData.queueId, {
          status: requestData.status,
          limit: requestData.limit ? parseInt(requestData.limit, 10) : undefined,
          offset: requestData.offset ? parseInt(requestData.offset, 10) : undefined,
        });
        result = { success: true, jobs };
        break;

      case 'get-stats':
        // GET /api/queues/:id/stats
        const stats = await queueRepo.getQueueStats(requestData.queueId);
        result = { success: true, stats };
        break;

      default:
        result = {
          success: false,
          error: { code: 'INVALID_COMMAND', message: `Unknown command: ${command}` }
        };
    }
  } catch (error) {
    // Очищаем сообщение об ошибке от путей к файлам
    let errorMessage = error instanceof Error ? error.message : String(error);
    errorMessage = errorMessage.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
    errorMessage = errorMessage.replace(/\/[^\s"]+/g, '[path]');
    if (errorMessage.length > 500) {
      errorMessage = errorMessage.substring(0, 500) + '...';
    }
    
    result = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: errorMessage
      }
    };
  } finally {
    // Восстанавливаем console методы
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
  }
  
  // Выводим результат в stdout - только валидный JSON, без дополнительных символов
  const jsonOutput = JSON.stringify(result);
  process.stdout.write(jsonOutput + '\n');
}

main().catch(error => {
  // Очищаем сообщение об ошибке от путей к файлам
  let errorMessage = error.message || 'Unknown error';
  
  // Удаляем пути к файлам из сообщения об ошибке
  errorMessage = errorMessage.replace(/[A-Z]:\\[^\s]+/g, '[path]');
  errorMessage = errorMessage.replace(/\/[^\s]+/g, '[path]');
  
  // Ограничиваем длину сообщения
  if (errorMessage.length > 500) {
    errorMessage = errorMessage.substring(0, 500) + '...';
  }
  
  process.stderr.write(`Unhandled error in queues-api: ${errorMessage}\n`);
  process.stdout.write(JSON.stringify({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: errorMessage }
  }) + '\n');
  process.exit(1);
});
