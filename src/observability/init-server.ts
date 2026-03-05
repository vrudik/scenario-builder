/**
 * Инициализация observability при старте сервера
 * Запускается один раз при старте server.cjs
 */

import { initializeObservability } from './index';

async function main() {
  try {
    await initializeObservability({
      serviceName: 'scenario-builder-server',
      serviceVersion: '0.1.0',
      enabled: process.env.OTEL_ENABLED !== 'false',
      prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9464'),
    });
    
    // Не завершаем процесс - метрики должны работать постоянно
    console.log('Observability initialized for server');
  } catch (error) {
    console.error('Failed to initialize observability:', error);
    // Не завершаем процесс при ошибке
  }
}

main().catch(console.error);
