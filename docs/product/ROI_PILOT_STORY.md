# ROI Framing & Pilot Story

## ROI Framework

### Cost Savings

| Area | Without Scenario Builder | With Scenario Builder | Savings |
|------|------------------------|----------------------|---------|
| Manual ticket triage | 2 FTE ($120K/yr) | 0.5 FTE + $3.6K platform | ~$85K/yr |
| Document processing | 4 hours/doc manual | 2 min/doc automated | 95% time reduction |
| Incident response | 15 min avg MTTR | 2 min avg MTTR | 87% faster |
| Compliance checks | 30 min/entity manual | 5 min/entity with review | 83% faster |

### Risk Reduction

| Risk | How SB Mitigates |
|------|-----------------|
| Uncontrolled AI agent behavior | OPA policies, cost budgets, tool whitelists |
| Compliance violations | Full audit trail, PII masking, approval gates |
| System failures | Temporal durable execution, saga compensation |
| Cost overruns | Per-execution token/cost limits, quota enforcement |

### Time to Value

| Phase | Timeline | Milestone |
|-------|---------|-----------|
| Evaluation | 1 day | First scenario running with mock tools |
| Pilot | 2 weeks | First production scenario with real tools |
| Production | 4 weeks | 3+ scenarios in production, team onboarded |
| Scale | 3 months | 10+ scenarios, multiple workspaces, integrated with CI/CD |

## Pilot Story Template

### Pilot Goals

1. Validate that [use case] can be automated with Scenario Builder
2. Measure time-to-first-value for the engineering team
3. Confirm governance requirements are met (audit, policy, cost control)
4. Evaluate operational readiness (deployment, monitoring, support)

### Pilot Structure

| Week | Activity | Deliverable |
|------|---------|-------------|
| Week 1 | Setup + first scenario from template | Running scenario with mock tools |
| Week 2 | Connect real tools, configure policies | First production-ready scenario |
| Week 3 | Run in production (shadow mode) | Execution data, cost analysis |
| Week 4 | Review results, plan expansion | Pilot report, go/no-go decision |

### Success Criteria

- [ ] Scenario executes successfully >95% of the time
- [ ] Cost per execution within budget (<$X)
- [ ] Full audit trail available for every execution
- [ ] Team can create new scenarios without vendor help
- [ ] Deployment on customer infrastructure verified

### Pilot Report Template

```markdown
# Pilot Report: [Company] — [Use Case]

## Summary
- Duration: 4 weeks
- Scenarios deployed: X
- Total executions: X
- Success rate: X%
- Average cost per execution: $X
- Average execution time: Xs

## What Worked
- ...

## Challenges
- ...

## Recommendation
- [ ] Proceed to production
- [ ] Extend pilot
- [ ] Do not proceed (reason: ...)
```

## Pricing Justification

| Scenario | Monthly Volume | SB Cost | Manual Cost | ROI |
|----------|---------------|---------|-------------|-----|
| Ticket Triage | 5,000 tickets | $299/mo + ~$250 LLM | $10,000/mo (FTE) | 95% savings |
| Doc Processing | 1,000 docs | $299/mo + ~$200 LLM | $8,000/mo (FTE) | 94% savings |
| Compliance | 500 checks | $299/mo + ~$250 LLM | $5,000/mo (FTE) | 89% savings |
