# Pricing Hypothesis

Status: **Draft / Hypothesis** — to be validated with pilot customers.

## Pricing Model

**Usage-based pricing with tier gates.**

The core metric is **scenario executions per month**, with additional dimensions for team size and features.

## Tier Structure

| Tier | Monthly Price | Executions/mo | Workspaces | Users | Support |
|------|-------------|--------------|-----------|-------|---------|
| **Free / Community** | $0 | 500 | 1 | 3 | Community |
| **Pro** | $299/mo | 5,000 | 3 | 10 | Standard (email, 8h) |
| **Business** | $799/mo | 25,000 | 10 | 50 | Standard + Slack |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Enterprise (24/7, SLA) |

## What Counts as an Execution

One execution = one `POST /api/execute-*` call that starts a scenario run, regardless of:
- Number of nodes in the scenario
- Number of tool calls
- Execution duration
- Runtime mode (in-memory or Temporal)

Failed executions count. Cancelled executions do not count.

## Overage

| Tier | Overage Rate |
|------|-------------|
| Free | Hard cap — executions blocked |
| Pro | $0.08 per additional execution |
| Business | $0.05 per additional execution |
| Enterprise | Negotiated |

## Feature Gates

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|-----------|
| In-memory runtime | Yes | Yes | Yes | Yes |
| Temporal runtime | — | Yes | Yes | Yes |
| OPA policies | Basic | Full | Full | Full + federation |
| Kafka event streaming | — | Yes | Yes | Yes |
| Audit log retention | 30 days | 90 days | 365 days | Custom |
| Audit export | — | JSON | JSON, CSV, NDJSON | All + SIEM |
| API keys | 1 | 5 | 20 | Unlimited |
| Custom templates | 5 | 50 | 200 | Unlimited |
| Observability | Logs | + Metrics | + Tracing | Full stack |
| RBAC | owner only | owner, admin, builder | All roles | All + custom |
| SSO / OIDC | — | — | — | Yes |
| Dedicated support | — | — | — | Yes |

## Self-Hosted Pricing

For customers who deploy on their own infrastructure:

| Tier | Annual License | Includes |
|------|---------------|---------|
| **Pro Self-Hosted** | $2,400/yr ($200/mo) | Pro features, no execution cap, email support |
| **Business Self-Hosted** | $7,200/yr ($600/mo) | Business features, no execution cap, Slack support |
| **Enterprise Self-Hosted** | Custom | All features, dedicated SE, SLA, custom policies |

Self-hosted = no execution metering (honor system or license key validation).

## Pricing Rationale

### Why Usage-Based

- Aligns cost with value delivered
- Low barrier to entry (free tier)
- Scales naturally with customer growth
- LLM cost is the primary variable cost (passed through to customer)

### Why Not Per-User

- Product value is in autonomous execution, not in user sessions
- Many use cases are API-driven with few human users
- Per-user pricing penalizes efficiency

### Why Not Per-LLM-Token

- Customers already pay their LLM provider directly
- Double-charging for tokens creates friction
- Execution count is simpler to understand and predict

## Validation Plan

1. **Pilot 1–3:** Free tier + custom pricing discussion
2. **Pilot 4–10:** Pro tier with 30-day free trial
3. **GA:** Full tier structure with self-serve billing
4. **Post-GA:** Adjust based on usage patterns and feedback

## Competitive Reference

| Product | Model | Comparable Tier |
|---------|-------|----------------|
| Temporal Cloud | Per-action pricing | Similar concept, different granularity |
| n8n Cloud | Per-workflow-execution | Direct comparable |
| Zapier | Per-task | Higher granularity, more expensive |
| Retool | Per-user | Different model |

## Open Questions

1. Should the free tier be time-limited or permanent?
2. Should we offer annual discounts (e.g., 2 months free)?
3. Should Temporal runtime be a paid add-on or feature-gated?
4. Should we meter tool calls separately from executions?
