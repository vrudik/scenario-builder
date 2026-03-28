/**
 * Скрипт для выполнения Agent Runtime из командной строки
 * Используется server.cjs для выполнения запросов
 */
import { executeAgentRequest } from './agent-handler';
import * as fs from 'fs';
async function main() {
  // Перенаправляем все логи в stderr, чтобы stdout содержал только JSON
  // Это важно, потому что server.cjs парсит stdout как JSON
  // Переопределяем console методы для перенаправления в stderr
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
  // НЕ инициализируем observability здесь - метрики должны быть инициализированы один раз при старте server.cjs
  // Если метрики не инициализированы, они просто не будут записываться, но выполнение продолжится
  try {
    // Читаем данные запроса из файла
    const requestFile = process.argv[2];
    if (!requestFile) {
      throw new Error('Request file not provided');
    }
    const requestData = JSON.parse(fs.readFileSync(requestFile, 'utf-8'));
    const { userIntent, scenarioId, tenantId, _tenantId } = requestData;
    if (!userIntent) {
      throw new Error('userIntent is required');
    }
    const result = await executeAgentRequest(userIntent, scenarioId, {
      tenantId: _tenantId ?? tenantId
    });
    // Выводим результат в stdout для чтения server.cjs
    // Используем process.stdout напрямую, чтобы избежать проблем с console.log
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const errorResult = {
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      toolCallsExecuted: 0,
      totalTokens: 0
    };
    process.stdout.write(JSON.stringify(errorResult) + '\n');
    // НЕ выключаем observability при ошибке - метрики должны работать
    process.exit(1);
  } finally {
    // НЕ выключаем observability здесь, так как метрики должны работать постоянно
    // Метрики будут выключены только при завершении процесса
    // try {
    //   await shutdownObservability();
    // } catch (shutdownError) {
    //   // Игнорируем ошибки при shutdown
    // }
  }
}
main().catch(async (error) => {
  const errorResult = {
    success: false,
    error: {
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    },
    toolCallsExecuted: 0,
    totalTokens: 0
  };
  process.stdout.write(JSON.stringify(errorResult) + '\n');
  // НЕ выключаем observability при ошибке - метрики должны работать
  process.exit(1);
});
