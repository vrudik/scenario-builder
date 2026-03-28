# Privacy & Data Retention

## Data We Process

| Data Category | Examples | Retention | Deletion |
|--------------|---------|-----------|---------|
| **Scenario specs** | JSON specs, tool configs | Until deleted by user | User-initiated |
| **Execution data** | Input/output, events, node results | Configurable (default 365 days) | Auto-cleanup job |
| **Audit logs** | Action logs, policy decisions | Configurable by severity (see N-16) | Retention job |
| **Usage metrics** | Execution counts, token usage | 24 months | Auto-rollup |
| **User identity** | Email, name, role | Until account deletion | User-initiated |
| **API keys** | SHA-256 hashes only | Until revoked | User-initiated |
| **LLM interactions** | Prompts, responses (in execution data) | Same as execution data | Same as execution data |

## Data We Do NOT Store

- Full API keys (only hashes after creation)
- User passwords in plaintext (bcrypt hashed)
- Credit card or payment data (delegated to payment processor)
- Third-party LLM training data (we don't send data for training)

## Data Location

### Self-Hosted

All data resides on customer infrastructure. Scenario Builder does not phone home or transmit data externally, except:
- LLM API calls to configured provider (OpenAI, Ollama)
- OPA policy bundles from configured registry (if external)

### Managed (Future)

Region selection at org creation. Data stays in selected region.

## Retention Configuration

```env
AUDIT_RETENTION_DAYS=365
AUDIT_RETENTION_POLICY=archive    # delete | archive
EXECUTION_RETENTION_DAYS=365
USAGE_RETENTION_MONTHS=24
```

## Right to Deletion

On org deletion request:
1. All org workspaces marked for deletion
2. All scenarios, executions, templates soft-deleted
3. Audit logs retained for compliance period, then hard-deleted
4. Usage records anonymized (orgId removed)
5. API keys revoked and hashes deleted
6. Process completes within 30 days

## LLM Data Policy

- Customer data sent to LLM provider only during active execution
- No data retained by Scenario Builder after execution completion beyond configured retention
- OpenAI API: data not used for training (per OpenAI API terms)
- Ollama: local execution, no external transmission
- PII masking applied for medium/high risk tool calls before OPA evaluation

## Cookie Policy

Admin UI uses:
- `sb_session` — authentication session (HttpOnly, Secure, SameSite=Strict)
- `localStorage` — UI preferences (tenant selection, onboarding state)

No tracking cookies, no analytics cookies, no third-party cookies.
