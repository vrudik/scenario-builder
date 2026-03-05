/**
 * Scenario Spec - декларативная спецификация сценариев
 * 
 * Спецификация определяет:
 * - Goal/Outcome: цели, KPI, бизнес-метрики
 * - Triggers: события/расписание/webhooks
 * - Allowed Actions: список tools + права/лимиты
 * - Data Contract: источники, качество, PII-классы
 * - Non-functional: SLA/latency/cost/token budget
 * - Risk Class: правила подтверждений, запреты, лимиты
 * - Observability Spec: метрики/алерты/триггеры деградации
 */

import { z } from 'zod';

/**
 * Класс риска сценария
 */
export enum RiskClass {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Тип триггера
 */
export enum TriggerType {
  EVENT = 'event',
  SCHEDULE = 'schedule',
  WEBHOOK = 'webhook',
  MANUAL = 'manual'
}

/**
 * Схема триггера
 */
export const TriggerSchema = z.object({
  type: z.nativeEnum(TriggerType),
  source: z.string().optional(), // для event/webhook
  pattern: z.string().optional(), // для schedule (cron)
  config: z.record(z.unknown()).optional()
});

/**
 * Схема инструмента (tool)
 */
export const ToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  riskClass: z.nativeEnum(RiskClass),
  requiresApproval: z.boolean().default(false),
  rateLimit: z.number().optional(),
  idempotencyKey: z.string().optional()
});

/**
 * Схема контракта данных
 */
export const DataContractSchema = z.object({
  sources: z.array(z.string()),
  quality: z.object({
    required: z.boolean(),
    validation: z.string().optional()
  }),
  piiClassification: z.enum(['none', 'low', 'medium', 'high']).optional(),
  retention: z.string().optional() // ISO 8601 duration
});

/**
 * Схема нефункциональных требований
 */
export const NonFunctionalSchema = z.object({
  sla: z.object({
    availability: z.number().min(0).max(1).optional(), // 0.99 = 99%
    latency: z.object({
      p50: z.number().optional(),
      p95: z.number().optional(),
      p99: z.number().optional()
    }).optional()
  }).optional(),
  cost: z.object({
    maxPerExecution: z.number().optional(),
    maxPerDay: z.number().optional(),
    maxPerMonth: z.number().optional()
  }).optional(),
  tokenBudget: z.object({
    maxPerExecution: z.number().optional(),
    maxPerDay: z.number().optional()
  }).optional()
});

/**
 * Схема правил риска
 */
export const RiskRulesSchema = z.object({
  requiresApproval: z.array(z.string()).optional(), // список tool IDs
  forbidden: z.array(z.string()).optional(), // список запрещенных действий
  limits: z.record(z.number()).optional() // лимиты по типам действий
});

/**
 * Схема observability
 */
export const ObservabilitySpecSchema = z.object({
  metrics: z.array(z.string()).optional(),
  alerts: z.array(z.object({
    name: z.string(),
    condition: z.string(),
    severity: z.enum(['info', 'warning', 'error', 'critical'])
  })).optional(),
  degradationTriggers: z.array(z.string()).optional()
});

/**
 * Полная схема Scenario Spec
 */
export const ScenarioSpecSchema = z.object({
  version: z.string().default('0.1.0'),
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  
  // Goal/Outcome
  goal: z.string(),
  kpi: z.array(z.object({
    name: z.string(),
    target: z.number().optional(),
    unit: z.string().optional()
  })).optional(),
  businessMetrics: z.array(z.string()).optional(),
  
  // Triggers
  triggers: z.array(TriggerSchema),
  
  // Allowed Actions
  allowedActions: z.array(ToolSchema),
  
  // Data Contract
  dataContract: DataContractSchema.optional(),
  
  // Non-functional
  nonFunctional: NonFunctionalSchema.optional(),
  
  // Risk Class
  riskClass: z.nativeEnum(RiskClass).default(RiskClass.LOW),
  riskRules: RiskRulesSchema.optional(),
  
  // Observability
  observability: ObservabilitySpecSchema.optional(),
  
  // Metadata
  tags: z.array(z.string()).optional(),
  owner: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export type ScenarioSpec = z.infer<typeof ScenarioSpecSchema>;
export type Trigger = z.infer<typeof TriggerSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type DataContract = z.infer<typeof DataContractSchema>;
export type NonFunctional = z.infer<typeof NonFunctionalSchema>;
export type RiskRules = z.infer<typeof RiskRulesSchema>;
export type ObservabilitySpec = z.infer<typeof ObservabilitySpecSchema>;

/**
 * Валидатор Scenario Spec
 */
export class ScenarioSpecValidator {
  private schema: z.ZodSchema<ScenarioSpec>;

  constructor() {
    this.schema = ScenarioSpecSchema;
  }

  /**
   * Валидация спецификации
   */
  validate(spec: unknown): { valid: boolean; errors?: z.ZodError } {
    const result = this.schema.safeParse(spec);
    
    if (result.success) {
      return { valid: true };
    }
    
    return { valid: false, errors: result.error };
  }

  /**
   * Парсинг и валидация спецификации
   */
  parse(spec: unknown): ScenarioSpec {
    return this.schema.parse(spec);
  }
}
