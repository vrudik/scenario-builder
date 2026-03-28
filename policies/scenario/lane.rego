# Дополнительные ограничения по полосе деплоя (отдельный пакет для bundle / CI).
# Используется из scenario.allow (tool.rego) как data.scenario_lane.lane_allow.
#
# canaryBlockedToolIds — id инструментов, запрещённых на полосе canary.
# stableBlockedToolIds — id инструментов, запрещённых на полосе stable (только canary).

package scenario_lane

default lane_allow = true

tool_blocked_on_canary {
  input.deploymentLane == "canary"
  blocked := object.get(input, "canaryBlockedToolIds", [])
  count(blocked) > 0
  blocked[_] == input.toolId
}

tool_blocked_on_stable {
  input.deploymentLane == "stable"
  blocked := object.get(input, "stableBlockedToolIds", [])
  count(blocked) > 0
  blocked[_] == input.toolId
}

lane_allow = false {
  tool_blocked_on_canary
}

lane_allow = false {
  tool_blocked_on_stable
}
