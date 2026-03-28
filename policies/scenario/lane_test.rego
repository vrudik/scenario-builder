package scenario_lane_test

import data.scenario_lane

test_lane_allows_when_not_canary {
	scenario_lane.lane_allow with input as {
		"toolId": "delete-db",
		"deploymentLane": "stable",
		"canaryBlockedToolIds": ["delete-db"],
	}
}

test_lane_blocks_listed_tool_on_canary {
	not scenario_lane.lane_allow with input as {
		"toolId": "delete-db",
		"deploymentLane": "canary",
		"canaryBlockedToolIds": ["delete-db"],
	}
}

test_lane_allows_tool_not_in_blocklist_on_canary {
	scenario_lane.lane_allow with input as {
		"toolId": "read-only-tool",
		"deploymentLane": "canary",
		"canaryBlockedToolIds": ["delete-db"],
	}
}

test_lane_empty_blocklist_allows {
	scenario_lane.lane_allow with input as {
		"toolId": "delete-db",
		"deploymentLane": "canary",
		"canaryBlockedToolIds": [],
	}
}

test_lane_blocks_listed_tool_on_stable {
	not scenario_lane.lane_allow with input as {
		"toolId": "new-risky-api",
		"deploymentLane": "stable",
		"stableBlockedToolIds": ["new-risky-api"],
	}
}

test_lane_allows_stable_blocked_tool_on_canary {
	scenario_lane.lane_allow with input as {
		"toolId": "new-risky-api",
		"deploymentLane": "canary",
		"stableBlockedToolIds": ["new-risky-api"],
	}
}

test_lane_allows_tool_not_in_stable_blocklist {
	scenario_lane.lane_allow with input as {
		"toolId": "web-search-tool",
		"deploymentLane": "stable",
		"stableBlockedToolIds": ["new-risky-api"],
	}
}
