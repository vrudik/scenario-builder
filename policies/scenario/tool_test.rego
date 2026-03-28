package scenario_test

import data.scenario

test_allow_by_default {
	scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["user"],
	}
}

test_guest_denied_for_database_query {
	not scenario.allow with input as {
		"toolId": "database-query-tool",
		"userRoles": ["guest"],
	}
}

test_cost_guard_denied {
	not scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["admin"],
		"cost_guard_exceeded": true,
	}
}

test_high_pii_and_high_risk_tool_denied {
	not scenario.allow with input as {
		"toolId": "database-query-tool",
		"userRoles": ["admin"],
		"scenarioPiiClassification": "high",
		"toolRiskClass": "high",
	}
}

test_canary_allowlist_denies_tool_not_in_list {
	not scenario.allow with input as {
		"toolId": "database-query-tool",
		"userRoles": ["admin"],
		"deploymentLane": "canary",
		"canaryAllowedTools": ["web-search-tool"],
	}
}

test_canary_allowlist_allows_listed_tool {
	scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["admin"],
		"deploymentLane": "canary",
		"canaryAllowedTools": ["web-search-tool"],
	}
}

test_lane_package_blocks_destructive_on_canary {
	not scenario.allow with input as {
		"toolId": "delete-db",
		"userRoles": ["admin"],
		"deploymentLane": "canary",
		"canaryBlockedToolIds": ["delete-db"],
	}
}

test_lane_package_allows_same_tool_on_stable {
	scenario.allow with input as {
		"toolId": "delete-db",
		"userRoles": ["admin"],
		"deploymentLane": "stable",
		"canaryBlockedToolIds": ["delete-db"],
	}
}

test_stable_blocklist_denies_on_stable {
	not scenario.allow with input as {
		"toolId": "new-risky-api",
		"userRoles": ["admin"],
		"deploymentLane": "stable",
		"stableBlockedToolIds": ["new-risky-api"],
		"allowedTools": ["new-risky-api", "web-search-tool"],
		"forbiddenActions": [],
		"requiresApproval": [],
	}
}

test_stable_blocklist_allows_on_canary {
	scenario.allow with input as {
		"toolId": "new-risky-api",
		"userRoles": ["admin"],
		"deploymentLane": "canary",
		"stableBlockedToolIds": ["new-risky-api"],
		"allowedTools": ["new-risky-api", "web-search-tool"],
		"forbiddenActions": [],
		"requiresApproval": [],
	}
}

test_token_limit_denies_when_used_at_or_over_cap {
	not scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["user"],
		"tokenLimits": {"maxPerExecution": 1000},
		"tokensUsedSoFar": 1000,
	}
}

test_token_limit_allows_when_under_cap {
	scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["user"],
		"tokenLimits": {"maxPerExecution": 1000},
		"tokensUsedSoFar": 999,
	}
}

test_cost_limit_denies_when_spend_exceeds_cap {
	not scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["user"],
		"costLimits": {"maxPerExecution": 5.0},
		"executionSpendUsd": 5.01,
	}
}

test_cost_limit_allows_when_spend_at_cap {
	scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["user"],
		"costLimits": {"maxPerExecution": 5.0},
		"executionSpendUsd": 5.0,
	}
}

# tenantId в input (проброс из gateway для OPA-правил по тенанту)
test_tenant_id_in_input_still_allows {
	scenario.allow with input as {
		"toolId": "web-search-tool",
		"userRoles": ["user"],
		"tenantId": "acme-corp",
	}
}
