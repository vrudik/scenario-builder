/**
 * OpenTelemetry Metrics для метрик производительности
 * 
 * Обеспечивает:
 * - Счетчики (counters)
 * - Измерители (gauges)
 * - Гистограммы (histograms)
 * - Экспорт в Prometheus
 */

import { metrics, Meter, Counter, Histogram, UpDownCounter } from '@opentelemetry/api';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

/**
 * Конфигурация метрик
 */
export interface MetricsConfig {
  serviceName?: string;
  serviceVersion?: string;
  prometheusPort?: number;
  enabled?: boolean;
}

let meterProvider: MeterProvider | null = null;
let meter: Meter | null = null;

/**
 * Инициализация метрик
 */
export async function initializeMetrics(config: MetricsConfig = {}): Promise<void> {
  const {
    serviceName = 'scenario-builder',
    serviceVersion = '0.1.0',
    prometheusPort = parseInt(process.env.PROMETHEUS_PORT || '9464'),
    enabled = process.env.OTEL_ENABLED !== 'false'
  } = config;

  if (!enabled) {
    console.log('OpenTelemetry metrics are disabled');
    return;
  }

  if (meterProvider) {
    console.warn('Metrics already initialized');
    return;
  }

  try {
    const resource = resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    });

    let prometheusExporter: PrometheusExporter | null = null;
    try {
      prometheusExporter = new PrometheusExporter({
        port: prometheusPort,
      });
    } catch (exporterError) {
      console.warn(`Failed to create PrometheusExporter on port ${prometheusPort}, continuing without metrics export:`, exporterError instanceof Error ? exporterError.message : String(exporterError));
      // Создаем MeterProvider без экспортера
      meterProvider = new MeterProvider({
        resource,
      });
      metrics.setGlobalMeterProvider(meterProvider);
      meter = metrics.getMeter(serviceName, serviceVersion);
      console.log(`OpenTelemetry metrics initialized without exporter: ${serviceName} v${serviceVersion}`);
      return;
    }

    // PrometheusExporter наследуется от MetricReader, можно использовать напрямую
    meterProvider = new MeterProvider({
      resource,
      readers: [prometheusExporter],
    });

    metrics.setGlobalMeterProvider(meterProvider);
    meter = metrics.getMeter(serviceName, serviceVersion);

    // Запускаем HTTP сервер для экспорта метрик
    try {
      await prometheusExporter.startServer();
      console.log(`OpenTelemetry metrics initialized: ${serviceName} v${serviceVersion} on port ${prometheusPort}`);
    } catch (serverError) {
      console.warn(`Failed to start PrometheusExporter server on port ${prometheusPort}:`, serverError instanceof Error ? serverError.message : String(serverError));
      console.log(`OpenTelemetry metrics initialized without HTTP server: ${serviceName} v${serviceVersion}`);
    }
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry metrics:', error instanceof Error ? error.message : String(error));
    // Продолжаем без метрик, чтобы не ломать выполнение
  }
}

/**
 * Получение текущего meter
 */
export function getMeter(): Meter {
  if (!meter) {
    meter = metrics.getMeter('scenario-builder', '0.1.0');
  }
  return meter;
}

/**
 * Создание счетчика
 */
export function createCounter(name: string, description?: string): Counter {
  const meter = getMeter();
  return meter.createCounter(name, {
    description: description || `Counter for ${name}`,
  });
}

/**
 * Создание гистограммы
 */
export function createHistogram(name: string, description?: string): Histogram {
  const meter = getMeter();
  return meter.createHistogram(name, {
    description: description || `Histogram for ${name}`,
  });
}

/**
 * Создание up-down счетчика
 */
export function createUpDownCounter(name: string, description?: string): UpDownCounter {
  const meter = getMeter();
  return meter.createUpDownCounter(name, {
    description: description || `UpDownCounter for ${name}`,
  });
}

/**
 * Предопределенные метрики для системы
 */
export const systemMetrics = {
  // Метрики выполнения сценариев
  scenarioExecutions: createCounter('scenario_executions_total', 'Total number of scenario executions'),
  scenarioDuration: createHistogram('scenario_duration_seconds', 'Duration of scenario execution in seconds'),
  scenarioSuccess: createCounter('scenario_success_total', 'Total number of successful scenario executions'),
  scenarioFailures: createCounter('scenario_failures_total', 'Total number of failed scenario executions'),

  // Метрики Agent Runtime
  agentToolCalls: createCounter('agent_tool_calls_total', 'Total number of tool calls made by agents'),
  agentTokensUsed: createCounter('agent_tokens_used_total', 'Total number of tokens used by agents'),
  agentLLMCalls: createCounter('agent_llm_calls_total', 'Total number of LLM API calls'),
  agentLLMDuration: createHistogram('agent_llm_duration_seconds', 'Duration of LLM API calls in seconds'),

  // Метрики Tool Gateway
  toolExecutions: createCounter('tool_executions_total', 'Total number of tool executions'),
  toolDuration: createHistogram('tool_duration_seconds', 'Duration of tool execution in seconds'),
  toolRateLimitHits: createCounter('tool_rate_limit_hits_total', 'Total number of rate limit hits'),
  toolCircuitBreakerOpens: createCounter('tool_circuit_breaker_opens_total', 'Total number of circuit breaker opens'),
  /** Отказы до вызова инструмента: layer=local|opa, deployment_lane=stable|canary|unset */
  gatewayPolicyDenials: createCounter(
    'gateway_policy_denials_total',
    'Tool access denied by local ExecutionPolicy or OPA at gateway'
  ),
  /** Итог вызова OPA scenario/allow (после локального allow): result=allow|deny */
  gatewayOpaDecisions: createCounter(
    'gateway_opa_decisions_total',
    'OPA allow policy evaluations at tool gateway'
  ),

  // Метрики Runtime Orchestrator
  workflowExecutions: createCounter('workflow_executions_total', 'Total number of workflow executions'),
  workflowDuration: createHistogram('workflow_duration_seconds', 'Duration of workflow execution in seconds'),
  workflowRetries: createCounter('workflow_retries_total', 'Total number of workflow retries'),
  workflowCompensations: createCounter('workflow_compensations_total', 'Total number of workflow compensations'),
};

/**
 * Остановка метрик (для graceful shutdown)
 */
export async function shutdownMetrics(): Promise<void> {
  if (meterProvider) {
    await meterProvider.shutdown();
    meterProvider = null;
    meter = null;
    console.log('OpenTelemetry metrics shut down');
  }
}
