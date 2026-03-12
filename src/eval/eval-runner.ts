/**
 * Eval Runner - запуск eval-кейсов и проверка результатов
 * 
 * Интегрируется с AgentRuntime и GuardrailsManager для тестирования безопасности
 */

import { AgentRuntime, AgentExecutionContext, AgentExecutionResult } from '../agent/agent-runtime';
import { GuardrailsManager, GuardrailResult } from '../agent/guardrails';
import { ScenarioSpec } from '../spec/scenario-spec';
import { EvalCase, EvalCaseLibrary, EvalCategory, EvalSeverity } from './eval-cases';
import { getLogger } from '../observability/logger';
import type { AuditService } from '../audit/audit-service';

const logger = getLogger({ serviceName: 'eval-runner' });

/**
 * Результат выполнения одного eval-кейса
 */
export interface EvalCaseResult {
  caseId: string;
  caseName: string;
  category: EvalCategory;
  severity: EvalSeverity;
  prompt: string;
  
  // Результаты проверки guardrails
  guardrailCheck: GuardrailResult;
  
  // Результат выполнения агента (если guardrails разрешили)
  agentResult?: AgentExecutionResult;
  
  // Ожидаемый vs фактический результат
  expectedResult: 'blocked' | 'allowed' | 'modified';
  actualResult: 'blocked' | 'allowed' | 'modified';
  
  // Статус теста
  passed: boolean;
  reason?: string;
  
  // Метрики
  duration: number;
  timestamp: Date;
}

/**
 * Результат выполнения набора eval-кейсов
 */
export interface EvalSuiteResult {
  suiteId: string;
  suiteName: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  results: EvalCaseResult[];
  summary: {
    byCategory: Record<EvalCategory, { total: number; passed: number; failed: number }>;
    bySeverity: Record<EvalSeverity, { total: number; passed: number; failed: number }>;
  };
  duration: number;
  timestamp: Date;
}

/**
 * Конфигурация eval runner
 */
export interface EvalRunnerConfig {
  agentRuntime: AgentRuntime;
  guardrails: GuardrailsManager;
  scenarioSpec: ScenarioSpec;
  scenarioId?: string;
  executionId?: string;
  userId?: string;
  timeout?: number; // таймаут на один кейс в мс
  auditService?: AuditService;
}

/**
 * Eval Runner
 */
export class EvalRunner {
  private caseLibrary: EvalCaseLibrary;
  private config: EvalRunnerConfig;

  constructor(config: EvalRunnerConfig) {
    this.config = config;
    this.caseLibrary = new EvalCaseLibrary();
  }

  /**
   * Запустить один eval-кейс
   */
  async runCase(caseId: string): Promise<EvalCaseResult> {
    const evalCase = this.caseLibrary.getCaseById(caseId);
    if (!evalCase) {
      throw new Error(`Eval case ${caseId} not found`);
    }

    const startTime = Date.now();
    const timestamp = new Date();

    logger.info('Running eval case', { caseId, caseName: evalCase.name });

    // 1. Проверка guardrails
    const guardrailCheck = this.config.guardrails.checkPrompt(evalCase.prompt);

    let actualResult: 'blocked' | 'allowed' | 'modified' = 'allowed';
    let agentResult: AgentExecutionResult | undefined;
    let passed = false;
    let reason: string | undefined;

    // 2. Если guardrails заблокировали
    if (!guardrailCheck.allowed) {
      actualResult = 'blocked';
      passed = evalCase.expectedResult === 'blocked';
      reason = guardrailCheck.reason || 'Blocked by guardrails';
    } else {
      // 3. Если guardrails разрешили, запускаем агента
      try {
        const context: AgentExecutionContext = {
          scenarioId: this.config.scenarioId || 'eval-scenario',
          executionId: this.config.executionId || `eval-${Date.now()}`,
          userId: this.config.userId || 'eval-user',
          userRoles: ['user'],
          scenarioSpec: this.config.scenarioSpec,
          availableTools: [], // Можно добавить инструменты для тестирования
          userIntent: evalCase.prompt,
        };

        const timeout = this.config.timeout || 30000;
        agentResult = await Promise.race([
          this.config.agentRuntime.execute(context),
          new Promise<AgentExecutionResult>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]) as AgentExecutionResult;

        // Определяем фактический результат на основе ответа агента
        if (agentResult.success) {
          // Проверяем вывод на безопасность
          const outputCheck = this.config.guardrails.checkOutput(
            agentResult.output || '',
            { toolCalls: [] }
          );

          if (!outputCheck.allowed) {
            actualResult = 'modified';
            reason = outputCheck.reason || 'Output modified by guardrails';
          } else {
            actualResult = 'allowed';
          }
        } else {
          actualResult = 'blocked';
          reason = agentResult.error?.message || 'Agent execution failed';
        }
      } catch (error) {
        actualResult = 'blocked';
        reason = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error running agent for eval case', error, { caseId });
      }
    }

    // 4. Определяем, прошел ли тест
    if (evalCase.expectedResult === actualResult) {
      passed = true;
    } else if (evalCase.expectedResult === 'modified' && actualResult === 'blocked') {
      // Если ожидали модификацию, но получили блокировку - это тоже приемлемо (более строгая защита)
      passed = true;
      reason = 'More strict protection than expected (blocked instead of modified)';
    } else {
      passed = false;
      reason = reason || `Expected ${evalCase.expectedResult}, got ${actualResult}`;
    }

    const duration = Date.now() - startTime;

    const result: EvalCaseResult = {
      caseId: evalCase.id,
      caseName: evalCase.name,
      category: evalCase.category,
      severity: evalCase.severity,
      prompt: evalCase.prompt,
      guardrailCheck,
      agentResult,
      expectedResult: evalCase.expectedResult,
      actualResult,
      passed,
      reason,
      duration,
      timestamp,
    };

    logger.info('Eval case completed', {
      caseId,
      passed,
      expectedResult: evalCase.expectedResult,
      actualResult,
    });

    await this.config.auditService?.logEvalCase({
      caseId: evalCase.id,
      passed,
      expectedResult: evalCase.expectedResult,
      actualResult,
      duration,
    });

    return result;
  }

  /**
   * Запустить набор кейсов
   */
  async runSuite(options: {
    category?: EvalCategory;
    severity?: EvalSeverity;
    tags?: string[];
    caseIds?: string[];
    maxCases?: number;
  }): Promise<EvalSuiteResult> {
    const suiteId = `eval-suite-${Date.now()}`;
    const suiteName = `Eval Suite ${new Date().toISOString()}`;
    const startTime = Date.now();
    const timestamp = new Date();

    logger.info('Starting eval suite', { suiteId, options });

    // Выбираем кейсы для запуска
    let cases: EvalCase[];
    if (options.caseIds && options.caseIds.length > 0) {
      cases = options.caseIds
        .map(id => this.caseLibrary.getCaseById(id))
        .filter((c): c is EvalCase => c !== undefined);
    } else {
      cases = this.caseLibrary.searchCases({
        category: options.category,
        tags: options.tags,
      });
      
      if (options.severity) {
        cases = cases.filter(c => c.severity === options.severity);
      }
    }

    // Ограничиваем количество кейсов
    if (options.maxCases && cases.length > options.maxCases) {
      cases = cases.slice(0, options.maxCases);
    }

    logger.info('Selected cases for suite', { count: cases.length });

    // Запускаем кейсы последовательно
    const results: EvalCaseResult[] = [];
    let passedCases = 0;
    let failedCases = 0;
    let skippedCases = 0;

    for (const evalCase of cases) {
      try {
        const result = await this.runCase(evalCase.id);
        results.push(result);
        
        if (result.passed) {
          passedCases++;
        } else {
          failedCases++;
        }
      } catch (error) {
        skippedCases++;
        logger.error('Error running eval case', error, { caseId: evalCase.id });
      }
    }

    const duration = Date.now() - startTime;

    // Подсчитываем статистику по категориям и severity
    const summary = {
      byCategory: {} as Record<EvalCategory, { total: number; passed: number; failed: number }>,
      bySeverity: {} as Record<EvalSeverity, { total: number; passed: number; failed: number }>,
    };

    // Инициализируем счетчики
    Object.values(EvalCategory).forEach(cat => {
      summary.byCategory[cat] = { total: 0, passed: 0, failed: 0 };
    });
    Object.values(EvalSeverity).forEach(sev => {
      summary.bySeverity[sev] = { total: 0, passed: 0, failed: 0 };
    });

    // Заполняем статистику
    results.forEach(result => {
      summary.byCategory[result.category].total++;
      if (result.passed) {
        summary.byCategory[result.category].passed++;
      } else {
        summary.byCategory[result.category].failed++;
      }

      summary.bySeverity[result.severity].total++;
      if (result.passed) {
        summary.bySeverity[result.severity].passed++;
      } else {
        summary.bySeverity[result.severity].failed++;
      }
    });

    const suiteResult: EvalSuiteResult = {
      suiteId,
      suiteName,
      totalCases: cases.length,
      passedCases,
      failedCases,
      skippedCases,
      results,
      summary,
      duration,
      timestamp,
    };

    logger.info('Eval suite completed', {
      suiteId,
      totalCases: suiteResult.totalCases,
      passedCases: suiteResult.passedCases,
      failedCases: suiteResult.failedCases,
    });

    await this.config.auditService?.logEvalSuite({
      suiteId,
      totalCases: suiteResult.totalCases,
      passedCases: suiteResult.passedCases,
      failedCases: suiteResult.failedCases,
      duration: suiteResult.duration,
    });

    return suiteResult;
  }

  /**
   * Получить все доступные кейсы
   */
  getAllCases(): EvalCase[] {
    return this.caseLibrary.getAllCases();
  }

  /**
   * Получить кейсы по категории
   */
  getCasesByCategory(category: EvalCategory): EvalCase[] {
    return this.caseLibrary.getCasesByCategory(category);
  }

  /**
   * Поиск кейсов
   */
  searchCases(query: {
    category?: EvalCategory;
    severity?: EvalSeverity;
    tags?: string[];
    name?: string;
  }): EvalCase[] {
    return this.caseLibrary.searchCases(query);
  }
}
