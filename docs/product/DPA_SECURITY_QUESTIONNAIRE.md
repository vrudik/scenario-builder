# DPA & Security Questionnaire — Starter Pack

## Data Processing Agreement (DPA) Key Terms

Template for customer DPA discussions.

### Definitions

| Term | Definition |
|------|-----------|
| **Controller** | Customer (org) that defines scenario specs and inputs |
| **Processor** | Scenario Builder (when managed) or customer (when self-hosted) |
| **Data Subject** | End users whose data appears in scenario inputs/outputs |
| **Personal Data** | Any data in scenario inputs that identifies a natural person |

### Processing Details

| Item | Detail |
|------|--------|
| Nature of processing | Automated scenario execution with LLM inference |
| Purpose | As defined by customer's scenario specifications |
| Duration | For the duration of the service agreement |
| Categories of data | As defined by customer's scenario inputs |
| Categories of data subjects | As defined by customer's use case |

### Obligations

**Scenario Builder commits to:**
- Process data only as instructed by the customer (via scenario specs)
- Implement appropriate technical and organizational security measures
- Notify customer of data breaches within 72 hours
- Delete or return data on contract termination
- Make available information necessary for compliance audits
- Not engage additional subprocessors without customer notification

**Customer is responsible for:**
- Ensuring lawful basis for processing
- Providing data subject notifications
- Configuring appropriate data retention
- Classifying data sensitivity in scenario specs (risk class)

## Security Questionnaire — Common Responses

### Infrastructure & Architecture

| Question | Response |
|----------|---------|
| Where is data stored? | Self-hosted: customer infrastructure. Managed: customer-selected region. |
| Is data encrypted at rest? | Database-level encryption recommended. Application does not encrypt at application layer (customer responsibility for disk encryption). |
| Is data encrypted in transit? | HTTPS for all external communication. Internal: configurable TLS. |
| Multi-tenancy model? | Workspace-level isolation with org-bound tenant resolution. |

### Access Control

| Question | Response |
|----------|---------|
| Authentication methods? | API keys (SHA-256 hashed), session auth (JWT), service tokens. |
| Authorization model? | RBAC with 5 roles (owner, admin, builder, operator, viewer). |
| MFA support? | Planned for managed offering (OIDC/SAML delegation). |
| API key rotation? | Supported via API. Max age configurable. |

### Audit & Logging

| Question | Response |
|----------|---------|
| Audit trail? | Yes — immutable, append-only log of all actions. |
| Audit log retention? | Configurable (default 365 days, severity-based extensions). |
| Audit log export? | JSON, CSV, NDJSON formats via API. |
| Access to audit logs? | Owner and admin roles. Builder/operator can view own workspace. |

### Incident Response

| Question | Response |
|----------|---------|
| Incident response plan? | Severity-based (S1-S4) with defined response and resolution targets. |
| Breach notification timeline? | 72 hours (per GDPR, standard DPA terms). |
| Post-incident review? | Root cause analysis within 5 business days for S1/S2. |

### Compliance

| Question | Response |
|----------|---------|
| SOC 2 certified? | Not yet. Architecture designed to support SOC 2 controls. |
| ISO 27001 certified? | Not yet. Audit trail and access controls align with A.12.4. |
| GDPR compliant? | Architecture supports GDPR requirements. DPA available. |
| HIPAA ready? | Self-hosted deployment can be configured for HIPAA. BAA available on request. |
| Data residency? | Self-hosted: customer controls. Managed: region selection at org creation. |

### Third-Party Dependencies

| Question | Response |
|----------|---------|
| Subprocessors? | See `SUBPROCESSORS.md`. Self-hosted: none by default. |
| Open source components? | Yes. See `package.json` for full dependency list. MIT licensed. |
| Vulnerability management? | npm audit in CI, Dependabot for dependency updates. |

## How to Use This Document

1. **Procurement inquiries:** Share SECURITY_OVERVIEW.md + this document
2. **DPA requests:** Use key terms section as starting point for legal review
3. **Security questionnaires:** Copy relevant responses from the table above
4. **Compliance audits:** Reference audit trail capabilities and RBAC design

## Related Documents

- [Security Overview](SECURITY_OVERVIEW.md)
- [Privacy & Data Retention](PRIVACY_DATA_RETENTION.md)
- [Subprocessors](SUBPROCESSORS.md)
- [SLO/SLA & Support](SLO_SLA_SUPPORT.md)
