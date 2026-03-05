/**
 * Пример использования Observability компонентов
 */

import { initializeObservability, shutdownObservability } from '../src/observability';
import { traceAsync, systemMetrics } from '../src/observability';
import { getLogger } from '../src/observability/logger';

async function main() {
  // Инициализация observability
  initializeObservability({
    serviceName: 'scenario-builder-example',
    serviceVersion: '0.1.0',
    enabled: true,
    logLevel: 'debug',
  });

  const logger = getLogger({ serviceName: 'example' });

  logger.info('Starting observability example');

  // Пример трассировки
  await traceAsync('example.operation', async (span) => {
    logger.info('Executing traced operation');
    
    // Симуляция работы
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Запись метрик
    systemMetrics.scenarioExecutions.add(1);
    systemMetrics.scenarioSuccess.add(1);
    
    logger.info('Operation completed');
  });

  // Пример вложенной трассировки
  await traceAsync('example.nested', async (span) => {
    logger.info('Starting nested operation');
    
    await traceAsync('example.nested.step1', async () => {
      logger.debug('Step 1');
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    await traceAsync('example.nested.step2', async () => {
      logger.debug('Step 2');
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    logger.info('Nested operation completed');
  });

  // Пример метрик
  systemMetrics.scenarioExecutions.add(1);
  systemMetrics.scenarioDuration.record(0.5);
  systemMetrics.agentToolCalls.add(3);
  systemMetrics.agentTokensUsed.add(150);

  logger.info('Observability example completed');

  // Graceful shutdown
  await shutdownObservability();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
