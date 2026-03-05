/**
 * Guardrails для защиты от рисков LLM-приложений
 * 
 * Защита от:
 * - Prompt injection
 * - Insecure output handling
 * - Excessive agency
 * - И других рисков из OWASP Top 10 for LLM Applications
 */

/**
 * Тип риска
 */
export enum RiskType {
  PROMPT_INJECTION = 'prompt_injection',
  INSECURE_OUTPUT = 'insecure_output',
  EXCESSIVE_AGENCY = 'excessive_agency',
  UNAUTHORIZED_CODE = 'unauthorized_code',
  DATA_LEAKAGE = 'data_leakage'
}

/**
 * Результат проверки guardrails
 */
export interface GuardrailResult {
  allowed: boolean;
  riskType?: RiskType;
  reason?: string;
  confidence: number; // уверенность в обнаружении риска (0-1)
}

/**
 * Guardrails Manager
 */
export class GuardrailsManager {
  private readonly promptInjectionPatterns: RegExp[] = [
    /ignore\s+(previous|above|all)\s+(instructions?|rules?)/i,
    /you\s+are\s+(now|a)\s+(different|new)/i,
    /system\s*:\s*you\s+are/i,
    /<\|im_start\|>/i,
    /<\|im_end\|>/i
  ];

  private readonly dangerousKeywords: string[] = [
    'delete',
    'drop',
    'truncate',
    'rm -rf',
    'format',
    'shutdown',
    'reboot'
  ];

  /**
   * Проверка входного промпта на prompt injection
   */
  checkPrompt(prompt: string): GuardrailResult {
    // Проверка на известные паттерны prompt injection
    for (const pattern of this.promptInjectionPatterns) {
      if (pattern.test(prompt)) {
        return {
          allowed: false,
          riskType: RiskType.PROMPT_INJECTION,
          reason: 'Detected potential prompt injection pattern',
          confidence: 0.8
        };
      }
    }

    // Проверка на подозрительно длинные промпты
    if (prompt.length > 10000) {
      return {
        allowed: false,
        riskType: RiskType.PROMPT_INJECTION,
        reason: 'Prompt too long, potential injection attempt',
        confidence: 0.6
      };
    }

    return {
      allowed: true,
      confidence: 1.0
    };
  }

  /**
   * Проверка вывода модели на безопасность
   */
  checkOutput(output: string, context?: { toolCalls?: unknown[] }): GuardrailResult {
    // Если это ответ модели после выполнения tool call, разрешаем практически все
    // (модель может упоминать слова типа "format" в контексте объяснения)
    if (context?.toolCalls && context.toolCalls.length > 0) {
      // После выполнения tool calls разрешаем более свободный вывод
      return {
        allowed: true,
        confidence: 1.0
      };
    }

    // Проверка на опасные команды в выводе
    // Используем более точные паттерны, чтобы не блокировать обычные слова
    const outputLower = output.toLowerCase();
    
    // Опасные паттерны команд (только реально опасные команды, не просто слова)
    // Исключаем паттерны, которые могут сработать на обычный текст
    const dangerousCommandPatterns = [
      /\brm\s+-rf\s+\//,                    // rm -rf / команда (только с корневым путем)
      /\bformat\s+[c-z]:\s*\/[ys]/i,        // format c: /y или /s (только с флагами подтверждения)
      /\bdelete\s+from\s+\w+\s+where/i,      // SQL DELETE FROM table WHERE (полная команда)
      /\bdrop\s+table\s+if\s+exists/i,      // SQL DROP TABLE IF EXISTS
      /\bdrop\s+table\s+\w+\s*;/i,          // SQL DROP TABLE name; (с точкой с запятой)
      /\btruncate\s+table\s+\w+\s*;/i,      // SQL TRUNCATE TABLE name; (с точкой с запятой)
      /\bshutdown\s+(-[a-z]|\/)/i,          // shutdown команда с флагами
      /\breboot\s+(-[a-z]|\/)/i,            // reboot команда с флагами
      /<script[^>]*>.*?<\/script>/is,       // XSS попытки (с флагом для многострочности)
      /javascript:\s*[^"'\s]/i,             // javascript: протокол с кодом (не просто упоминание)
      /<[^>]*\son\w+\s*=\s*["'][^"']*["']/i // HTML события в тегах (onclick="...")
    ];
    
    // Проверяем только если это действительно похоже на команду, а не просто упоминание слова
    for (const pattern of dangerousCommandPatterns) {
      if (pattern.test(output)) {
        // Дополнительная проверка: если это в кавычках или в коде блоке, это может быть пример
        // Проверяем контекст вокруг совпадения
        const match = output.match(pattern);
        if (match) {
          const matchIndex = output.indexOf(match[0]);
          const beforeContext = output.substring(Math.max(0, matchIndex - 50), matchIndex);
          const afterContext = output.substring(matchIndex + match[0].length, matchIndex + match[0].length + 50);
          
          // Если это в кодовом блоке (```) или в кавычках как пример - разрешаем
          const codeBlockBefore = beforeContext.lastIndexOf('```');
          const codeBlockAfter = afterContext.indexOf('```');
          if (codeBlockBefore >= 0 && codeBlockAfter >= 0) {
            continue; // Это в кодовом блоке, пропускаем
          }
          
          // Если это в кавычках как пример - разрешаем
          if ((beforeContext.match(/["']/g) || []).length % 2 === 1) {
            continue; // Это в кавычках, пропускаем
          }
        }
        
        return {
          allowed: false,
          riskType: RiskType.INSECURE_OUTPUT,
          reason: `Potentially dangerous command pattern detected in output`,
          confidence: 0.8
        };
      }
    }

    // Проверка на excessive agency (слишком много tool calls)
    if (context?.toolCalls && context.toolCalls.length > 10) {
      return {
        allowed: false,
        riskType: RiskType.EXCESSIVE_AGENCY,
        reason: 'Too many tool calls in single response',
        confidence: 0.8
      };
    }

    return {
      allowed: true,
      confidence: 1.0
    };
  }

  /**
   * Проверка tool call на безопасность
   */
  checkToolCall(toolId: string, inputs: Record<string, unknown>): GuardrailResult {
    // Проверка на опасные инструменты
    const dangerousTools = ['system', 'exec', 'eval', 'shell'];
    if (dangerousTools.some(dt => toolId.toLowerCase().includes(dt))) {
      return {
        allowed: false,
        riskType: RiskType.UNAUTHORIZED_CODE,
        reason: `Dangerous tool detected: ${toolId}`,
        confidence: 0.9
      };
    }

    // Проверка входных параметров на подозрительные значения
    // Проверяем только если это действительно опасные команды, а не просто слова в тексте
    const inputsStr = JSON.stringify(inputs).toLowerCase();
    
    // Более точная проверка: ищем опасные паттерны, а не просто слова
    const dangerousPatterns = [
      /\brm\s+-rf\b/,           // rm -rf команда
      /\bformat\s+c:/i,          // format диска
      /\bdelete\s+from\b/i,     // SQL DELETE
      /\bdrop\s+table\b/i,       // SQL DROP TABLE
      /\btruncate\s+table\b/i,  // SQL TRUNCATE
      /\bshutdown\s+-/i,         // shutdown команда
      /\breboot\s+-/i            // reboot команда
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(inputsStr)) {
        return {
          allowed: false,
          riskType: RiskType.INSECURE_OUTPUT,
          reason: `Potentially dangerous command pattern detected`,
          confidence: 0.8
        };
      }
    }
    
    // Дополнительная проверка: если это поисковый запрос или информационный запрос, разрешаем
    // Это позволяет безопасным инструментам типа search-tool работать нормально
    if (toolId.includes('search') || toolId.includes('query') || toolId.includes('info')) {
      // Для поисковых инструментов разрешаем практически все запросы
      return {
        allowed: true,
        confidence: 1.0
      };
    }

    return {
      allowed: true,
      confidence: 1.0
    };
  }

  /**
   * Комплексная проверка (prompt + output + tool calls)
   */
  checkAll(
    prompt: string,
    output: string,
    toolCalls?: unknown[]
  ): GuardrailResult {
    // Проверяем промпт
    const promptCheck = this.checkPrompt(prompt);
    if (!promptCheck.allowed) {
      return promptCheck;
    }

    // Проверяем вывод
    const outputCheck = this.checkOutput(output, { toolCalls });
    if (!outputCheck.allowed) {
      return outputCheck;
    }

    return {
      allowed: true,
      confidence: Math.min(promptCheck.confidence, outputCheck.confidence)
    };
  }
}
