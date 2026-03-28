# Marketplace Strategy

Status: **Concept Note**

## Vision

A marketplace where teams share, discover, and install scenario templates, tool connectors, and policy bundles — accelerating adoption and creating a network effect.

## Marketplace Components

| Component | What It Is | Example |
|-----------|-----------|---------|
| **Templates** | Pre-built scenario specs | "KYC Compliance Check", "Ticket Triage" |
| **Connectors** | Tool integrations with external APIs | "Salesforce CRM Connector", "Jira Tool" |
| **Policy Bundles** | OPA policy packs for specific regulations | "GDPR Data Handling", "SOX Compliance" |
| **Workflow Recipes** | Multi-scenario compositions | "Full Customer Onboarding Pipeline" |

## Listing Tiers

| Tier | Author | Review | Price |
|------|--------|--------|-------|
| **Official** | Scenario Builder team | Internal review | Free (included in plan) |
| **Verified** | Partners / community | Reviewed + certified | Free or paid |
| **Community** | Any registered user | Basic validation only | Free |

## Revenue Model

| Model | When | Share |
|-------|------|-------|
| Free listings | Always | — |
| Paid listings (one-time) | GA + marketplace v2 | 70% author / 30% platform |
| Subscription connectors | GA + marketplace v3 | 70% author / 30% platform |

## Phased Rollout

### Phase 1: Internal Catalog (Current — L-01)

- 10 curated templates in `templates/catalog/`
- No marketplace UI — templates installed at server start
- No third-party submissions

### Phase 2: Public Template Gallery

- Browse and install templates from a central registry
- One-click install into workspace
- Rating and usage stats
- Submission process for Verified tier

### Phase 3: Full Marketplace

- Tool connectors as installable packages
- Policy bundles for compliance verticals
- Author dashboard (analytics, revenue)
- Paid listing support

## Technical Architecture

```
Marketplace Registry (API)
  ├── /api/marketplace/templates     — list, search, install
  ├── /api/marketplace/connectors    — list, search, install
  ├── /api/marketplace/policies      — list, search, install
  └── /api/marketplace/publish       — submit for review

Scenario Builder Instance
  ├── Fetches catalog on demand
  ├── Installs into local workspace
  └── Checks for updates periodically
```

### Package Format

```json
{
  "type": "template",
  "id": "marketplace/kyc-compliance",
  "version": "1.2.0",
  "author": "acme-consulting",
  "tier": "verified",
  "spec": { "...scenario spec..." },
  "mockTools": [ "..." ],
  "guide": "# How to use this template...",
  "requirements": {
    "minVersion": "1.0.0",
    "tools": ["api-call"],
    "policies": ["pii-masking"]
  }
}
```

## Success Metrics

| Metric | Target (Year 1) |
|--------|-----------------|
| Listings in marketplace | 50+ |
| Installs per month | 500+ |
| Verified publishers | 10+ |
| % of new scenarios starting from marketplace template | >30% |

## Risks

| Risk | Mitigation |
|------|-----------|
| Low quality submissions | Review process for Verified tier, community ratings |
| Security risks in connectors | Sandboxed execution, code review for Verified |
| Marketplace becomes ghost town | Seed with official templates, incentivize early publishers |

## Dependencies

- L-01 (Template catalog) — initial seed content
- L-02 (Templates UX) — installation UI
- N-10 (Auth) — publisher identity
- N-12 (RBAC) — marketplace admin role
