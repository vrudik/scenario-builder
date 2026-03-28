# Usage Dashboard — UX Design

Status: **RFC / Design**

## Purpose

Give org admins visibility into resource consumption, quota status, and cost trends.

## Dashboard Layout

```
┌──────────────────────────────────────────────────┐
│ Usage Overview                     March 2024    │
│ ────────────────────────────────────────────────│
│                                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│ │ Executions  │ │ Tool Calls  │ │ LLM Tokens  ││
│ │  3,420      │ │  18,500     │ │  2.4M       ││
│ │ ████████░░  │ │ (no limit)  │ │ (no limit)  ││
│ │ 68% of 5K   │ │             │ │             ││
│ └─────────────┘ └─────────────┘ └─────────────┘│
│                                                  │
│ ┌────────────────────────────────────────────── │
│ │ Execution Trend (6 months)                   ││
│ │     ▃▅▇█▆▇                                  ││
│ │ Oct Nov Dec Jan Feb Mar                      ││
│ └──────────────────────────────────────────────│
│                                                  │
│ ┌──────────────────┐ ┌──────────────────────── │
│ │ Cost Breakdown   │ │ Top Scenarios by Usage  ││
│ │ LLM: $42.30     │ │ 1. Ticket Triage (1.2K) ││
│ │ Tools: $12.10   │ │ 2. Doc Intake (890)     ││
│ │ Total: $54.40   │ │ 3. Lead Qual (540)      ││
│ └──────────────────┘ └──────────────────────── │
│                                                  │
│ ┌──────────────────────────────────────────────│
│ │ Workspace Breakdown                          ││
│ │ Production: 2,800 executions | $45.20        ││
│ │ Staging:      520 executions |  $8.10        ││
│ │ Development:  100 executions |  $1.10        ││
│ └──────────────────────────────────────────────│
└──────────────────────────────────────────────────┘
```

## Components

### Quota Progress Bar

Visual indicator of quota consumption:
- Green (0–60%): healthy
- Yellow (60–80%): approaching limit
- Orange (80–95%): warning
- Red (95–100%): critical / exceeded

### Trend Chart

Line/bar chart showing usage over time. Periods: daily, weekly, monthly (selectable).

### Cost Breakdown

Estimated costs based on metering data:
- LLM token costs (provider-specific rates)
- Tool call costs (estimated per-call)
- Total estimated cost

### Top Scenarios

Ranked list of scenarios by execution count, with success rate and avg cost.

## Data Sources

All data from `UsageRecord` table (N-22 metering model):

```
GET /api/v1/usage?period=2024-03&metric=executions,tool_calls,llm_tokens
GET /api/v1/usage/history?metric=executions&periods=6
GET /api/v1/usage/breakdown?period=2024-03&by=workspace
GET /api/v1/usage/top-scenarios?period=2024-03&limit=10
```

## Access

- Visible to: owner, admin
- Read-only summary for: builder (own workspace only)
