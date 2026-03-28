export type RiskFlagConfig = {
  enabled: boolean;
  label: string;
  description: string;
};

export type GuardrailsSensitivityLevel = 'low' | 'medium' | 'high';

export interface GuardrailsConfig {
  sensitivity: GuardrailsSensitivityLevel;
  risks: {
    promptInjection: RiskFlagConfig;
    insecureOutput: RiskFlagConfig;
    excessiveAgency: RiskFlagConfig & {
      maxToolCallsPerResponse: number;
    };
    unauthorizedCode: RiskFlagConfig;
    dataLeakage: RiskFlagConfig;
  };
  customPatterns: {
    promptInjection: string[];
    insecureOutput: string[];
    toolInputDangerous: string[];
  };
}

export const defaultGuardrailsConfig: GuardrailsConfig = {
  sensitivity: 'medium',
  risks: {
    promptInjection: {
      enabled: true,
      label: 'Prompt Injection',
      description:
        'Блокировать попытки переписать системные инструкции или заставить агента игнорировать правила.',
    },
    insecureOutput: {
      enabled: true,
      label: 'Опасные команды в ответах',
      description:
        'Запрещать вывод реально опасных команд (rm -rf /, DROP TABLE и т.п.) в ответах модели.',
    },
    excessiveAgency: {
      enabled: true,
      label: 'Excessive Agency',
      description:
        'Ограничивать количество вызовов инструментов за один ответ, чтобы агент не делал слишком много действий автоматически.',
      maxToolCallsPerResponse: 10,
    },
    unauthorizedCode: {
      enabled: true,
      label: 'Опасные инструменты',
      description:
        'Блокировать инструменты, запускающие произвольный код/команды (system/exec/shell и подобные).',
    },
    dataLeakage: {
      enabled: false,
      label: 'Защита от утечки данных',
      description:
        'Дополнительные проверки на возможную утечку конфиденциальных данных из контекста и памяти.',
    },
  },
  customPatterns: {
    promptInjection: [],
    insecureOutput: [],
    toolInputDangerous: [],
  },
};

let currentConfig: GuardrailsConfig = { ...defaultGuardrailsConfig };

export function getGuardrailsConfig(): GuardrailsConfig {
  return currentConfig;
}

export function updateGuardrailsConfig(partial: Partial<GuardrailsConfig>): GuardrailsConfig {
  currentConfig = {
    ...currentConfig,
    ...partial,
    risks: {
      ...currentConfig.risks,
      ...(partial.risks ?? {}),
      excessiveAgency: {
        ...currentConfig.risks.excessiveAgency,
        ...(partial.risks?.excessiveAgency ?? {}),
      },
    },
    customPatterns: {
      ...currentConfig.customPatterns,
      ...(partial.customPatterns ?? {}),
    },
  };

  return currentConfig;
}

