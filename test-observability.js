/**
 * Тест observability компонентов
 */

import { initializeObservability, shutdownObservability } from './src/observability/index.js';
import { traceAsync, systemMetrics, addSpanAttributes, addSpanEvent } from './src/observability/index.js';
import { getLogger } from './src/observability/logger.js';
import { executeAgentRequest } from './src/web/agent-handler.js';

const logger = getLogger({ serviceName: 'observability-test' });

async function testObservability() {
  console.log('🚀 Запуск теста Observability...\n');

  // Инициализация
  initializeObservability({
    serviceName: 'scenario-builder-test',
    serviceVersion: '0.1.0',
    enabled: true,
    logLevel: 'debug',
  });

  logger.info('Observability инициализирован');

  // Тест 1: Трассировка
  console.log('\n📊 Тест 1: Трассировка');
  await traceAsync('test.operation', async (span) => {
    addSpanAttributes({
      'test.id': 'test-001',
      'test.type': 'observability',
    });
    
    logger.info('Выполнение тестовой операции');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    addSpanEvent('test.step_completed', { step: 1 });
    
    await traceAsync('test.nested', async () => {
      logger.debug('Вложенная операция');
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    
    logger.info('Операция завершена');
  });

  // Тест 2: Метрики
  console.log('\n📈 Тест 2: Метрики');
  systemMetrics.scenarioExecutions.add(1);
  systemMetrics.scenarioSuccess.add(1);
  systemMetrics.scenarioDuration.record(0.5);
  systemMetrics.agentToolCalls.add(2);
  systemMetrics.agentTokensUsed.add(150);
  systemMetrics.agentLLMCalls.add(1);
  systemMetrics.agentLLMDuration.record(0.3);
  
  logger.info('Метрики записаны', {
    executions: 1,
    toolCalls: 2,
    tokens: 150,
  });

  // Тест 3: Интеграция с Agent Runtime
  console.log('\n🤖 Тест 3: Интеграция с Agent Runtime');
  try {
    const result = await traceAsync('test.agent_execution', async (span) => {
      addSpanAttributes({
        'test.scenario': 'test-scenario',
        'test.user_intent': 'Test observability',
      });
      
      logger.info('Запуск Agent Runtime');
      
      const agentResult = await executeAgentRequest(
        'Find information about observability in software systems',
        'test-scenario'
      );
      
      addSpanAttributes({
        'test.success': agentResult.success,
        'test.tool_calls': agentResult.toolCallsExecuted,
        'test.tokens': agentResult.totalTokens,
      });
      
      logger.info('Agent Runtime выполнен', {
        success: agentResult.success,
        toolCalls: agentResult.toolCallsExecuted,
        tokens: agentResult.totalTokens,
      });
      
      return agentResult;
    });
    
    console.log('✅ Agent Runtime выполнен успешно');
    console.log('   Tool calls:', result.toolCallsExecuted);
    console.log('   Tokens:', result.totalTokens);
  } catch (error) {
    logger.error('Ошибка выполнения Agent Runtime', error);
  }

  // Тест 4: Логирование с контекстом
  console.log('\n📝 Тест 4: Логирование');
  const childLogger = logger.child({ testId: 'test-002' });
  childLogger.info('Лог с контекстом');
  childLogger.debug('Debug лог');
  childLogger.warn('Предупреждение');
  
  // Симуляция ошибки
  try {
    throw new Error('Тестовая ошибка');
  } catch (error) {
    childLogger.error('Обработка ошибки', error);
  }

  console.log('\n✅ Все тесты завершены!');
  console.log('\n📊 Просмотр результатов:');
  console.log('   - Трассировки: http://localhost:16686');
  console.log('   - Метрики: http://localhost:9090');
  console.log('   - Prometheus экспорт: http://localhost:9464/metrics');
  console.log('   - Dashboard: http://localhost:3000/observability-dashboard.html');

  // Graceful shutdown
  await shutdownObservability();
}

testObservability().catch((error) => {
  console.error('❌ Ошибка теста:', error);
  process.exit(1);
});
