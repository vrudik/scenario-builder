/**
 * Структурированное логирование с интеграцией OpenTelemetry
 * 
 * Обеспечивает:
 * - Структурированные логи в JSON формате
 * - Корреляция с трассировкой (traceId/spanId)
 * - Уровни логирования
 * - Контекстные метаданные
 */

import { trace, context } from '@opentelemetry/api';

/**
 * Уровни логирования
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Структура лог-записи
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  traceId?: string;
  spanId?: string;
  service: string;
  [key: string]: unknown;
}

/**
 * Конфигурация логгера
 */
export interface LoggerConfig {
  serviceName?: string;
  level?: LogLevel;
  enableTraceContext?: boolean;
}

/**
 * Logger класс
 */
export class Logger {
  private serviceName: string;
  private level: LogLevel;
  private enableTraceContext: boolean;

  constructor(config: LoggerConfig = {}) {
    this.serviceName = config.serviceName || 'scenario-builder';
    this.level = config.level ?? (process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO);
    this.enableTraceContext = config.enableTraceContext ?? true;
  }

  /**
   * Получение trace context
   */
  private getTraceContext(): { traceId?: string; spanId?: string } {
    if (!this.enableTraceContext) {
      return {};
    }

    const span = trace.getActiveSpan();
    if (!span) {
      return {};
    }

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }

  /**
   * Форматирование лог-записи
   */
  private formatLog(level: string, message: string, meta?: Record<string, unknown>): LogEntry {
    const traceContext = this.getTraceContext();
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      ...traceContext,
      ...meta,
    };
  }

  /**
   * Вывод лога
   */
  private output(level: string, message: string, meta?: Record<string, unknown>): void {
    const logEntry = this.formatLog(level, message, meta);
    const jsonLog = JSON.stringify(logEntry);
    
    // Вывод в консоль с цветами для удобства разработки
    if (process.env.NODE_ENV === 'development') {
      const colors: Record<string, string> = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
      };
      const reset = '\x1b[0m';
      console.log(`${colors[level] || ''}[${level}]${reset} ${message}`, meta || '');
    } else {
      console.log(jsonLog);
    }
  }

  /**
   * Debug лог
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.DEBUG) {
      this.output('DEBUG', message, meta);
    }
  }

  /**
   * Info лог
   */
  info(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.INFO) {
      this.output('INFO', message, meta);
    }
  }

  /**
   * Warn лог
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.WARN) {
      this.output('WARN', message, meta);
    }
  }

  /**
   * Error лог
   */
  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.ERROR) {
      const errorMeta: Record<string, unknown> = {
        ...meta,
      };

      if (error instanceof Error) {
        errorMeta.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else if (error) {
        errorMeta.error = String(error);
      }

      this.output('ERROR', message, errorMeta);
    }
  }

  /**
   * Создание дочернего логгера с дополнительным контекстом
   */
  child(meta: Record<string, unknown>): Logger {
    const childLogger = new Logger({
      serviceName: this.serviceName,
      level: this.level,
      enableTraceContext: this.enableTraceContext,
    });

    // Переопределяем output для добавления контекста
    const originalOutput = childLogger.output.bind(childLogger);
    childLogger.output = (level: string, message: string, additionalMeta?: Record<string, unknown>) => {
      originalOutput(level, message, { ...meta, ...additionalMeta });
    };

    return childLogger;
  }
}

/**
 * Глобальный логгер по умолчанию
 */
let defaultLogger: Logger | null = null;

/**
 * Получение логгера по умолчанию
 */
export function getLogger(config?: LoggerConfig): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(config);
  }
  return defaultLogger;
}

/**
 * Создание именованного логгера
 */
export function createLogger(name: string, config?: LoggerConfig): Logger {
  return new Logger({
    ...config,
    serviceName: name,
  });
}
