# Subprocessors List

Last updated: 2024-03-26

## What is a Subprocessor

A subprocessor is a third-party service that processes customer data on behalf of Scenario Builder.

## Self-Hosted Deployments

For self-hosted deployments, **no subprocessors are involved by default**. All data processing occurs on customer infrastructure.

Optional external services (customer-configured):

| Service | Purpose | Data Processed | Required |
|---------|---------|---------------|----------|
| **OpenAI API** | LLM inference for agent execution | Prompts, tool call context | Optional (can use Ollama instead) |
| **Ollama** | Local LLM inference | Same as OpenAI, but local | Optional |
| **Temporal Cloud** | Durable workflow execution | Execution state, workflow IDs | Optional (can self-host) |
| **Confluent / Kafka** | Event streaming | Event payloads | Optional |

## Managed Deployments (Future)

When Scenario Builder offers a managed service, the following subprocessors will apply:

| Subprocessor | Purpose | Data Processed | Location |
|-------------|---------|---------------|----------|
| Cloud provider (TBD) | Infrastructure hosting | All customer data | Per region selection |
| PostgreSQL provider (TBD) | Database | All stored data | Same region |
| OpenAI | LLM inference | Execution prompts/responses | US (OpenAI default) |
| Payment processor (TBD) | Billing | Name, email, payment info | US/EU |

## Notification of Changes

Customers will be notified 30 days before any subprocessor change via:
- Email to org admin
- In-product notification
- Updated subprocessors page

## Customer Responsibility

For self-hosted deployments, customers are responsible for their own subprocessor relationships with:
- Their cloud infrastructure provider
- Their LLM provider
- Their database provider
- Any external tools configured in scenarios
