# Пример политики для OPA Data API.
# Тесты: opa test policies/; артефакт bundle: npm run bundle:opa -> build/opa-policy-bundle.tar.gz
# Сервер: opa run --server --addr :8181 policies/scenario/tool.rego policies/scenario/lane.rego
# Путь запроса: POST /v1/data/scenario/allow  body: {"input": {...}}
#
# Локальная ExecutionPolicy в gateway выполняется первой; здесь — дополнительные
# централизованные ограничения (роли, canary, stableBlockedToolIds через scenario_lane, cost-guard).
#
# Multi-tenant: gateway передаёт input.tenantId (как X-Tenant-ID, по умолчанию "default").
# Можно добавить правила вида: allow = false { input.tenantId == "blocked-demo" } или
# вынести allowlist в data, загружаемую отдельным bundle на окружение.

package scenario

import data.scenario_lane

default allow = true

# Пример: гость не вызывает database-query-tool
allow = false {
  input.userRoles[_] == "guest"
  input.toolId == "database-query-tool"
}

# Пример: явный флаг из оркестратора / внешней системы
allow = false {
  input.cost_guard_exceeded == true
}

# Лимит токенов за выполнение (проброс tokensUsedSoFar из gateway / agent-runtime)
allow = false {
  input.tokenLimits.maxPerExecution
  input.tokenLimits.maxPerExecution > 0
  input.tokensUsedSoFar >= input.tokenLimits.maxPerExecution
}

# Лимит стоимости за выполнение в USD (если рантайм передаёт executionSpendUsd)
allow = false {
  input.costLimits.maxPerExecution
  input.costLimits.maxPerExecution > 0
  input.executionSpendUsd > input.costLimits.maxPerExecution
}

# Пример: сценарий с высоким PII + инструмент с классом риска high
allow = false {
  input.scenarioPiiClassification == "high"
  input.toolRiskClass == "high"
}

# Canary: при непустом canaryAllowedTools на полосе canary — только инструменты из списка
tool_in_canary_allowlist {
  input.canaryAllowedTools[_] == input.toolId
}

allow = false {
  input.deploymentLane == "canary"
  count(input.canaryAllowedTools) > 0
  not tool_in_canary_allowlist
}

# Пакет scenario_lane: canaryBlockedToolIds и др. правила по полосе
allow = false {
  not scenario_lane.lane_allow
}
