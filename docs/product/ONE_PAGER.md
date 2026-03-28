# Scenario Builder

**Autonomous scenario platform with built-in governance**

---

## The Problem

Engineering teams building AI-powered automation face a dilemma:

- **Agent frameworks** (LangChain, CrewAI) give flexibility but no governance — no audit trail, no policy enforcement, no cost control
- **Workflow platforms** (Airflow, Temporal raw) provide durability but no agent capabilities — no LLM tool calling, no guardrails
- **iPaaS tools** (Zapier, n8n) are easy to start but impossible to govern at scale — no spec-as-code, no OPA, no compliance story

The result: teams either ship ungoverned AI agents or spend months building governance infrastructure from scratch.

## The Solution

Scenario Builder is a **declarative platform** where you define autonomous agent scenarios as specs and the platform handles orchestration, policy enforcement, and observability.

```
Your Scenario Spec → Scenario Builder → Governed, Observable, Durable Execution
```

Every agent action passes through **policy gates** (OPA), respects **cost budgets**, and produces a **full audit trail** — out of the box.

## How It Works

1. **Define** — Write a declarative scenario spec: triggers, tools, risk classes, SLA, cost limits
2. **Build** — Platform compiles spec into a workflow graph with execution policies
3. **Run** — Orchestrator executes with durable state (Temporal) or lightweight in-memory
4. **Govern** — Every tool call passes through policy gates, rate limits, circuit breakers
5. **Observe** — Full tracing via OpenTelemetry, audit log per action, cost tracking

## Key Differentiators

| Capability | Scenario Builder | Agent Frameworks | Workflow Platforms |
|-----------|-----------------|-----------------|-------------------|
| Declarative specs | Yes | No | Partial |
| LLM agent runtime | Yes | Yes | No |
| Policy gates (OPA) | Built-in | DIY | No |
| Durable execution | Temporal | No | Yes |
| Full audit trail | Built-in | No | Partial |
| Cost/token budgets | Built-in | No | No |
| Self-hosted | Yes | Yes | Varies |

## Use Cases

- **Customer Support Triage** — autonomous ticket classification, routing, and resolution with compliance guardrails
- **Document Processing** — contract/invoice handling with policy-controlled agent actions
- **Internal Ops Automation** — multi-step operational workflows with human-in-the-loop for high-risk decisions

## For Whom

**Mid-market to Enterprise** engineering teams in regulated industries (FinTech, InsurTech, HealthTech, Enterprise IT) who need to automate complex processes with LLM agents — and need governance from day one.

## Tech Stack

TypeScript / Node.js · Temporal · Apache Kafka · OPA · OpenTelemetry · Prisma · Docker

## Deployment

- **Self-hosted** — full control, data stays in your perimeter
- **Docker** — single-command deployment with Docker Compose
- **CI/CD** — GitHub Actions with GHCR image publishing

## Next Step

```bash
git clone <repo> && npm install && node server.cjs
# Open http://localhost:3000/demo-e2e.html for a one-click demo
```

---

*MIT License · [Product Identity](PRODUCT_IDENTITY.md) · [Documentation](../PUBLIC_DOCS_INDEX.md)*
