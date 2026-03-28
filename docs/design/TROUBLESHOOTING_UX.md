# Troubleshooting & Remediation Flow — Design Document

Status: **RFC / Design**

## Problem

When a scenario execution fails, the user sees an error message but has no clear path to diagnose and fix the issue. The current UX treats errors as terminal states without remediation guidance.

## Design

### Error Classification

| Category | Examples | Remediation |
|----------|---------|-------------|
| **Config Error** | Missing API key, wrong URL, invalid spec | Show config fix link |
| **Policy Denial** | OPA rejected, rate limit, cost exceeded | Show policy details + override option |
| **Tool Failure** | External API error, timeout, 5xx | Show retry button + tool diagnostics |
| **Agent Error** | LLM hallucination, guardrail block, token exhaustion | Show agent trace + suggestion |
| **Infrastructure** | DB connection, Temporal unavailable, Kafka down | Show health check + status page link |

### Error Detail Panel (in Runs page)

```
┌─────────────────────────────────────────────┐
│ ⚠ Execution Failed                          │
│ ──────────────────────────────────────────── │
│ Error: Tool 'check-sanctions-list' denied    │
│ Category: Policy Denial                      │
│ Node: node-3 (KYC Check)                    │
│ Time: 2024-03-26 14:30:22                   │
│ ──────────────────────────────────────────── │
│ What happened:                               │
│ OPA policy denied the tool call because      │
│ execution cost exceeded the per-run limit.   │
│                                              │
│ Suggested fix:                               │
│ • Increase cost budget in scenario spec      │
│ • Review OPA policy for cost limits          │
│                                              │
│ ──────────────────────────────────────────── │
│ [View Full Trace] [Edit Scenario] [Retry]    │
│ [View OPA Decision] [Open Spec Studio]       │
└─────────────────────────────────────────────┘
```

### Remediation Actions

| Action | What it does |
|--------|-------------|
| **Retry** | Re-execute the same scenario with same input |
| **Retry from Node** | Resume execution from the failed node |
| **Edit Scenario** | Open spec in Spec Studio with error context |
| **View Full Trace** | OpenTelemetry trace for the execution |
| **View OPA Decision** | Raw OPA input/output for the denied call |
| **View Tool Response** | Raw HTTP response from failed tool |
| **Contact Support** | Pre-filled support form with execution ID and error |

### Error Timeline

In the execution detail view, show errors in context of the full timeline:

```
✓ Node 1: Get Entity Data (234ms)
✓ Node 2: Run KYC Check (1.2s)
✗ Node 3: Check Sanctions List — DENIED (cost_exceeded)
  └── OPA: cost_guard_exceeded = true, executionSpendUsd = 0.45, limit = 0.50
⊘ Node 4: Generate Report (skipped)
⊘ Node 5: Submit for Review (skipped)
↩ Compensation: rollback node-2 (pending)
```

### Health Status Integration

If error is infrastructure-related, show system health inline:

```
Infrastructure Status:
  Database: ✓ Connected
  OPA: ✗ Unreachable (last check: 2min ago)
  Temporal: ✓ Connected
  Kafka: ⚠ Degraded (1/3 brokers)
```

## Implementation Notes

- Error classification based on error codes and metadata already in `ExecutionEvent.data`
- Remediation suggestions can be a static mapping initially, LLM-generated later
- Retry functionality uses existing execution API
- OPA decision viewer reads from audit trail (already logged)
