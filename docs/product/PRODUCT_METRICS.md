# Product & Commercial Metrics

## Product Success Metrics (L-15)

### Activation Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **TTFX** (Time to First Execution) | Time from signup to first scenario execution | <10 minutes |
| **Onboarding Completion** | % of new orgs that complete onboarding flow | >60% |
| **Template Adoption** | % of first scenarios created from templates | >70% |
| **Day-1 Retention** | % of users who return within 24h after first session | >40% |

### Engagement Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Weekly Active Orgs** | Orgs with ≥1 execution in the past 7 days | Growth trend |
| **Scenarios per Org** | Average active scenarios per org | >3 (month 3) |
| **Execution Volume** | Total executions per week | Growth trend |
| **Multi-Workspace Adoption** | % of paid orgs with >1 workspace | >30% |

### Quality Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Execution Success Rate** | % of executions completing without error | >95% |
| **Policy Denial Rate** | % of tool calls denied by OPA | <5% (excluding intentional blocks) |
| **Mean Execution Duration** | Average time to complete a scenario | Depends on scenario |
| **Error Resolution Time** | Time from error to user fixing and re-executing | <30 minutes |

### Pilot Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Pilot Conversion** | % of pilots that convert to paid | >40% |
| **Time to Production** | Days from pilot start to first production scenario | <14 days |
| **Pilot NPS** | Net Promoter Score from pilot participants | >50 |
| **Expansion Rate** | % of converted pilots adding scenarios in month 2 | >60% |

## Commercial Metrics (L-16)

### Revenue Metrics

| Metric | Definition | Target (Year 1) |
|--------|-----------|-----------------|
| **MRR** (Monthly Recurring Revenue) | Sum of all monthly subscription fees | $XX,XXX |
| **ARR** (Annual Recurring Revenue) | MRR × 12 | $XXX,XXX |
| **ARPO** (Avg Revenue Per Org) | MRR / paying orgs | $299–$799 |
| **Net Revenue Retention** | (MRR at month end - churn + expansion) / MRR at month start | >110% |

### Usage-to-Revenue Metrics

| Metric | Definition | Purpose |
|--------|-----------|---------|
| **Execution Efficiency** | Revenue / total executions | Validate pricing per execution |
| **Overage Revenue %** | Overage fees / total revenue | Should be <15% |
| **Tier Distribution** | % of orgs per tier (Free/Pro/Business/Enterprise) | Target: 60/25/10/5 |
| **Upgrade Trigger** | Which quota limit triggers most upgrades | Inform tier design |

### Growth Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **New Orgs / Month** | Orgs created | Growth trend |
| **Paid Conversion Rate** | Free → Paid within 90 days | >5% |
| **Time to Paid** | Days from signup to first payment | <30 days |
| **Expansion MRR** | MRR from upgrades and overages | >20% of new MRR |

### Efficiency Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **CAC** (Customer Acquisition Cost) | Total sales+marketing spend / new customers | <$1,000 (Pro) |
| **LTV** (Lifetime Value) | ARPO × avg customer lifespan | >3× CAC |
| **Payback Period** | CAC / monthly gross margin per customer | <6 months |
| **Gross Margin** | (Revenue - infrastructure costs) / Revenue | >70% |

## Measurement Infrastructure

### Data Sources

| Metric Group | Source |
|-------------|--------|
| Activation, Engagement | `UsageRecord` table + application events |
| Quality | `Execution` table, `AuditLog` table |
| Revenue | Billing system (future) |
| Growth | Org creation events |

### Dashboard

Product metrics → admin dashboard (internal) + weekly report email.
Commercial metrics → separate business intelligence dashboard (Metabase / Looker / custom).

### Review Cadence

| Review | Frequency | Participants |
|--------|-----------|-------------|
| Product metrics | Weekly | PM, Engineering |
| Commercial metrics | Monthly | PM, Founder, GTM |
| Pilot reviews | Per-pilot | PM, SE, Customer |
| Board metrics | Quarterly | Founder, Board |
