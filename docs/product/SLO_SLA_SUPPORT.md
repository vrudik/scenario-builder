# SLO / SLA & Support Model

## Service Level Objectives (SLO)

Internal targets for self-hosted and managed deployments.

### API Availability

| Tier | Target | Measurement |
|------|--------|-------------|
| Platform API (health, status) | 99.9% | `/healthz` returns 200 |
| Scenario Execution API | 99.5% | `POST /api/execute-*` accepts request |
| Admin UI | 99.5% | HTML pages load |
| WebSocket connections | 99.0% | WS upgrade succeeds |

### Latency

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| API health check | <10ms | <50ms | <200ms |
| Scenario creation | <100ms | <500ms | <1s |
| Execution start (in-memory) | <200ms | <1s | <3s |
| Execution start (Temporal) | <500ms | <2s | <5s |
| Audit log query | <100ms | <500ms | <2s |
| Template list | <50ms | <200ms | <500ms |

### Durability

| Guarantee | Target |
|-----------|--------|
| Execution completion (Temporal) | 99.99% (Temporal's own SLA) |
| Audit log persistence | 100% (append-only, no data loss) |
| Scenario spec persistence | 100% (database-backed) |

## Service Level Agreements (SLA) — Commercial Tiers

### Tier Definitions

| Tier | Name | Availability | Response Time | Price Range |
|------|------|-------------|--------------|-------------|
| **Community** | Free / OSS | Best-effort | GitHub Issues (no SLA) | Free |
| **Standard** | Pro | 99.5% uptime | 8h (business hours) | $X/mo |
| **Enterprise** | Enterprise | 99.9% uptime | 4h (24/7 for critical) | Custom |

### SLA Exclusions

- Planned maintenance (with 48h notice)
- Force majeure
- Customer-caused issues (misconfiguration, exceeded quotas)
- Third-party service failures (LLM provider outages, Temporal Cloud)

### SLA Credits

| Availability | Credit |
|-------------|--------|
| 99.0% – 99.5% | 10% of monthly fee |
| 95.0% – 99.0% | 25% of monthly fee |
| <95.0% | 50% of monthly fee |

## Support Model

### Severity Levels

| Severity | Definition | Response Target (Enterprise) | Resolution Target |
|----------|-----------|------------------------------|-------------------|
| **S1 — Critical** | Platform down, no workaround. All executions failing. | 1 hour (24/7) | 4 hours |
| **S2 — High** | Major feature broken, workaround exists. Degraded execution. | 4 hours (24/7) | 1 business day |
| **S3 — Medium** | Non-critical issue. Some features affected. | 8 hours (business) | 3 business days |
| **S4 — Low** | Minor issue, cosmetic, enhancement request. | 2 business days | Best-effort |

### Support Channels

| Tier | Channels |
|------|---------|
| Community | GitHub Issues, community Discord/forum |
| Standard | Email support, GitHub Issues |
| Enterprise | Dedicated Slack/Teams channel, email, phone (S1/S2) |

### Escalation Path

```
S4/S3 → Support Engineer → S2 → Senior Engineer → S1 → Engineering Lead + PM
```

### Incident Communication

| Event | Communication |
|-------|-------------|
| S1 detected | Status page update within 15 min |
| S1 resolved | Root cause summary within 24h |
| S2 detected | Status page update within 1h |
| Planned maintenance | Email notification 48h before |
| Post-incident review | Published RCA within 5 business days (S1/S2) |

## Monitoring Recommendations

### Self-Hosted Customers

Minimum monitoring for production:

```
[ ] /healthz endpoint monitored (uptime check)
[ ] /readyz endpoint monitored (readiness check)
[ ] OPA health endpoint monitored
[ ] Database connection monitored
[ ] Disk space alerts (>80% warning, >90% critical)
[ ] Error rate alert (>5% of requests in 5 min window)
[ ] Execution failure rate alert (>10% in 15 min window)
```

### Alerting Rules

| Alert | Condition | Severity |
|-------|----------|----------|
| API Down | `/healthz` fails 3 consecutive checks | S1 |
| High Error Rate | >5% 5xx responses in 5 min | S2 |
| OPA Unreachable | OPA health fails + `OPA_FAIL_OPEN=false` | S1 |
| Execution Backlog | >100 pending executions | S2 |
| Database Full | Disk >90% | S1 |
| Slow Responses | P95 latency >5s for 10 min | S3 |
