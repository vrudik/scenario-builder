/**
 * OpenTelemetry Tracer для трассировки выполнения
 * 
 * Обеспечивает:
 * - Создание и управление spans
 * - Корреляция трассировок между компонентами
 * - Экспорт в Jaeger и другие системы
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, Tracer, Span, SpanKind, SpanStatusCode, context, propagation } from '@opentelemetry/api';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';


/**
 * Конфигурация трассировки
 */
export interface TracerConfig {
  serviceName?: string;
  serviceVersion?: string;
  jaegerEndpoint?: string;
  enabled?: boolean;
}

/**
 * Инициализация OpenTelemetry SDK
 */
let sdk: NodeSDK | null = null;
let tracer: Tracer | null = null;

/**
 * Инициализация трассировки
 */
export async function initializeTracer(config: TracerConfig = {}): Promise<void> {
  const {
    serviceName = 'scenario-builder',
    serviceVersion = '0.1.0',
    jaegerEndpoint = process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    enabled = process.env.OTEL_ENABLED !== 'false'
  } = config;

  if (!enabled) {
    console.log('OpenTelemetry tracing is disabled');
    return;
  }

  if (sdk) {
    console.warn('Tracer already initialized');
    return;
  }

  try {
    const resource = resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    });

    let jaegerExporter: JaegerExporter | null = null;
    try {
      jaegerExporter = new JaegerExporter({
        endpoint: jaegerEndpoint,
      });
    } catch (exporterError) {
      console.warn(`Failed to create JaegerExporter with endpoint ${jaegerEndpoint}, continuing without tracing export:`, exporterError instanceof Error ? exporterError.message : String(exporterError));
      // Создаем простой tracer без экспортера
      tracer = trace.getTracer(serviceName, serviceVersion);
      console.log(`OpenTelemetry tracer initialized without exporter: ${serviceName} v${serviceVersion}`);
      return;
    }

    // Попытка загрузить auto-instrumentations (опционально)
    let instrumentations: any[] = [];
    try {
      const autoInstrumentationsModule = await import('@opentelemetry/auto-instrumentations-node');
      if (autoInstrumentationsModule.getNodeAutoInstrumentations) {
        instrumentations = [autoInstrumentationsModule.getNodeAutoInstrumentations()];
      }
    } catch (error) {
      // Auto-instrumentations не обязательны, продолжаем без них
      console.warn('Auto-instrumentations не доступны, трассировка будет работать без них');
    }

    try {
      sdk = new NodeSDK({
        resource,
        traceExporter: jaegerExporter,
        spanProcessor: new BatchSpanProcessor(jaegerExporter),
        instrumentations,
      });

      sdk.start();
      tracer = trace.getTracer(serviceName, serviceVersion);

      console.log(`OpenTelemetry tracer initialized: ${serviceName} v${serviceVersion}`);
    } catch (sdkError) {
      console.error('Failed to start OpenTelemetry SDK:', sdkError instanceof Error ? sdkError.message : String(sdkError));
      // Создаем простой tracer без SDK
      tracer = trace.getTracer(serviceName, serviceVersion);
      console.log(`OpenTelemetry tracer initialized with fallback: ${serviceName} v${serviceVersion}`);
    }
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry tracer:', error instanceof Error ? error.message : String(error));
    // Создаем простой tracer в качестве fallback
    try {
      tracer = trace.getTracer(serviceName, serviceVersion);
      console.log(`OpenTelemetry tracer initialized with fallback: ${serviceName} v${serviceVersion}`);
    } catch (fallbackError) {
      console.error('Failed to create fallback tracer:', fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
    }
  }
}

/**
 * Получение текущего tracer
 */
export function getTracer(): Tracer {
  if (!tracer) {
    // Fallback tracer если не инициализирован
    tracer = trace.getTracer('scenario-builder', '0.1.0');
  }
  return tracer;
}

/**
 * Создание нового span
 */
export function startSpan(
  name: string,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
    parent?: Span;
  }
): Span {
  const tracer = getTracer();
  const spanOptions: any = {
    kind: options?.kind || SpanKind.INTERNAL,
    attributes: options?.attributes || {},
  };

  if (options?.parent) {
    spanOptions.parent = trace.setSpan(context.active(), options.parent);
  }

  return tracer.startSpan(name, spanOptions);
}

/**
 * Выполнение функции с автоматическим span
 */
export async function traceAsync<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
  }
): Promise<T> {
  const span = startSpan(name, options);
  
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Выполнение синхронной функции с автоматическим span
 */
export function traceSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: {
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
  }
): T {
  const span = startSpan(name, options);
  
  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Добавление атрибутов к текущему span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Добавление события к текущему span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

/**
 * Получение trace context для передачи между сервисами
 */
export function getTraceContext(): Record<string, string> {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  return headers;
}

/**
 * Восстановление trace context из заголовков
 */
export function setTraceContext(headers: Record<string, string>): void {
  const ctx = propagation.extract(context.active(), headers);
  context.with(ctx, () => {
    // Context установлен
  });
}

/**
 * Остановка трассировки (для graceful shutdown)
 */
export async function shutdownTracer(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    tracer = null;
    console.log('OpenTelemetry tracer shut down');
  }
}
