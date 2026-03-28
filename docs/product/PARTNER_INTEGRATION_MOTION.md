# Partner & Integration Motion

Status: **Concept Note**

## Partner Categories

| Category | Who | Value to Them | Value to Us |
|----------|-----|---------------|-------------|
| **Technology Partners** | LLM providers, cloud vendors, observability platforms | New use cases for their stack | Ecosystem credibility, co-marketing |
| **Consulting Partners** | SI firms, AI consultancies | Billable implementation projects | Customer reach, vertical expertise |
| **ISV Partners** | SaaS vendors (CRM, ITSM, ERP) | AI-powered automation for their users | Tool connectors, embedded distribution |
| **Solution Partners** | Vertical specialists (FinTech compliance, HealthTech) | Platform for their domain expertise | Vertical content, marketplace listings |

## Integration Levels

| Level | Depth | Example | Effort |
|-------|-------|---------|--------|
| **L1: Tool Connector** | REST API wrapper as a tool | "Salesforce Connector" in tool registry | Low (1-2 days) |
| **L2: Template Pack** | Pre-built scenarios for partner's platform | "Jira Incident Response" template | Medium (1 week) |
| **L3: Embedded** | Scenario Builder embedded in partner's product | "AI Automation" tab in partner's UI | High (1-3 months) |
| **L4: OEM** | White-labeled Scenario Builder | Partner sells under their brand | Very high (custom) |

## GTM Motions

### Co-Marketing

- Joint blog posts / case studies
- Partner logo on integrations page
- Joint webinars for shared ICP

### Co-Selling

- Partner refers customer → revenue share
- Joint pilot with partner's customer
- Partner provides domain expertise, we provide platform

### Marketplace

- Partner publishes connectors/templates to marketplace
- Revenue share on paid listings
- Featured partner section in marketplace UI

## Partner Program Structure

| Tier | Requirements | Benefits |
|------|-------------|---------|
| **Registered** | Sign up, accept terms | Documentation access, community support |
| **Certified** | Complete integration, pass review | Co-marketing, marketplace Verified badge, partner portal |
| **Premier** | 3+ joint customers, dedicated SE | Co-selling support, priority roadmap input, revenue share |

## Priority Integrations (Wave 1)

Based on ICP (FinTech, CX, Enterprise IT):

| Integration | Type | Priority |
|-------------|------|----------|
| OpenAI / Anthropic | L1: LLM provider | High |
| Jira / Linear | L1: Tool connector | High |
| Salesforce | L1: Tool connector | Medium |
| Slack / Teams | L1: Notification tool | High |
| PagerDuty / OpsGenie | L1: Incident tool | Medium |
| Datadog / Grafana | L1: Observability | Medium |
| Stripe | L1: Billing integration | Medium |

## Revenue Impact

| Year 1 | Assumption | Revenue |
|--------|-----------|---------|
| Technology partners | 3 integrations, co-marketing only | $0 direct |
| Consulting partners | 2 partners, 5 referred customers | ~$30K ARR |
| Marketplace listings | 10 paid connectors, $50/mo avg | ~$6K ARR |
| **Total partner-influenced** | | **~$36K ARR** |

## Dependencies

- B-01 (Marketplace) — distribution channel for partner content
- L-07 (Webhooks) — event integration for partners
- L-05/L-06 (API versioning + OpenAPI) — stable API for integrations
