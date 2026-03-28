# Sales Engineering Pilot Checklist

## Pre-Pilot

### Discovery

- [ ] Identify primary use case and expected scenario flow
- [ ] Confirm ICP fit (team size, technical maturity, compliance needs)
- [ ] Identify decision makers and technical contacts
- [ ] Understand current solution (manual, scripts, other tools)
- [ ] Confirm deployment preference (self-hosted / managed)
- [ ] Identify success criteria with stakeholders

### Environment Setup

- [ ] Customer provisions infrastructure (Docker host or K8s cluster)
- [ ] Scenario Builder deployed and accessible
- [ ] Database configured (SQLite for pilot, PostgreSQL for production)
- [ ] Health checks passing (`/healthz`, `/readyz`)
- [ ] Admin UI accessible
- [ ] LLM provider configured (OpenAI API key or Ollama)

### Configuration

- [ ] Workspace created for pilot
- [ ] API keys generated for integration
- [ ] OPA policies configured (or default policies accepted)
- [ ] Cost budgets set per scenario
- [ ] Monitoring configured (at minimum: health check + error rate)

## During Pilot

### Week 1: Setup & First Scenario

- [ ] Walk through onboarding flow
- [ ] Select and instantiate starter template
- [ ] Customize template for customer's use case
- [ ] Execute with mock tools — verify flow works
- [ ] Review execution results and audit trail
- [ ] Connect first real tool (API endpoint)

### Week 2: Production Configuration

- [ ] All tools connected (real endpoints)
- [ ] OPA policies reviewed and customized
- [ ] Cost and token budgets configured
- [ ] Rate limits set for external APIs
- [ ] End-to-end test with real data
- [ ] Success rate >90%

### Week 3: Shadow Production

- [ ] Scenario running against real workload (shadow or parallel)
- [ ] Monitor execution success rate, cost, latency
- [ ] Review audit trail completeness
- [ ] Check OPA policy decisions for accuracy
- [ ] Tune cost budgets based on actual usage
- [ ] Address any issues or misconfigurations

### Week 4: Review & Decision

- [ ] Compile pilot metrics (success rate, cost, latency, volume)
- [ ] Generate pilot report (template in ROI_PILOT_STORY.md)
- [ ] Present results to stakeholders
- [ ] Discuss expansion plan (additional scenarios, workspaces, users)
- [ ] Get go/no-go decision
- [ ] If go: plan production migration and team onboarding

## Post-Pilot

### Production Transition

- [ ] Migrate from SQLite to PostgreSQL
- [ ] Configure Temporal for durable execution
- [ ] Set up CI/CD for scenario spec deployment
- [ ] Enable full observability (Jaeger, Prometheus)
- [ ] Set AUTH_MODE=required
- [ ] Configure OPA fail-closed
- [ ] Set up monitoring alerts (see SLO_SLA_SUPPORT.md)
- [ ] Onboard additional team members (roles: builder, operator)

### Expansion

- [ ] Identify next 2-3 scenarios for automation
- [ ] Set up workspace per environment (production, staging)
- [ ] Configure Kafka for event streaming (if needed)
- [ ] Review and adjust quotas/pricing tier
- [ ] Schedule quarterly business review

## Red Flags (Pilot Not Going Well)

| Signal | Action |
|--------|--------|
| <80% success rate after week 2 | Review tool configs, OPA policies, spec design |
| Cost per execution >2x budget | Review LLM model selection, token budgets |
| Team unable to create scenarios | Schedule additional training, review onboarding UX |
| Infrastructure issues | Escalate to DevOps, review deployment guide |
| Compliance concerns not addressed | Review Security Overview with security team |
