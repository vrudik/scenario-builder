/**
 * Observability модуль
 * 
 * Экспортирует все компоненты для трассировки, метрик и логирования
 */

export * from './tracer';
export * from './metrics';
export * from './logger';

/**
 * Инициализация всех компонентов observability
 */
import { initializeTracer, shutdownTracer } from './tracer';
import { initializeMetrics, shutdownMetrics } from './metrics';
import { getLogger } from './logger';

export interface ObservabilityConfig {
  serviceName?: string;
  serviceVersion?: string;
  jaegerEndpoint?: string;
  prometheusPort?: number;
  enabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Инициализация всех компонентов observability
 */
export async function initializeObservability(config: ObservabilityConfig = {}): Promise<void> {
  const logger = getLogger({ level: config.logLevel === 'debug' ? 0 : 1 });
  
  logger.info('Initializing observability components', {
    serviceName: config.serviceName,
    enabled: config.enabled !== false,
  });

  await initializeTracer(config);
  await initializeMetrics(config);

  logger.info('Observability components initialized');
}

/**
 * Graceful shutdown всех компонентов observability
 */
export async function shutdownObservability(): Promise<void> {
  const logger = getLogger();
  logger.info('Shutting down observability components');
  
  await Promise.all([
    shutdownTracer(),
    shutdownMetrics(),
  ]);
  
  logger.info('Observability components shut down');
}
