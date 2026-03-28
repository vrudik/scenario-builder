# Vertical Starter Kits

Status: **Concept Note**

Pre-packaged bundles for specific industries, each containing templates, policy bundles, and configuration guides.

## Kit Structure

Each vertical kit includes:

```
vertical-kit-<name>/
├── templates/          # 3-5 scenario templates
├── policies/           # OPA policy bundle for industry regulations
├── tools/              # Tool connector configs for common industry APIs
├── guide.md            # Setup walkthrough
└── manifest.json       # Kit metadata
```

## Vertical 1: FinTech / Banking

**Target:** Compliance-heavy financial institutions automating KYC, AML, transaction monitoring.

| Component | Content |
|-----------|---------|
| Templates | KYC Entity Check, AML Transaction Screening, Suspicious Activity Report, Account Onboarding |
| Policies | PII data handling (high risk), cost limits for compliance APIs, approval gates for report submission |
| Tools | Sanctions list API, KYC provider, document verification, regulatory reporting |
| Guide | Compliance-first setup, audit trail configuration, data retention for financial records |

**Key policies:**
- All tool calls with PII classified as `high` risk
- Human approval required for report submissions
- Audit retention: 7 years (regulatory minimum)
- Cost budget per check: configurable per entity type

## Vertical 2: Customer Experience / Support

**Target:** CX teams automating ticket handling, customer communication, and quality assurance.

| Component | Content |
|-----------|---------|
| Templates | Ticket Triage, Escalation Detection, Customer Sentiment Analysis, Quality Audit |
| Policies | Customer data handling (moderate risk), rate limits for communication APIs, SLA enforcement |
| Tools | Helpdesk API (Zendesk/Intercom), CRM lookup, email/SMS sender, NPS survey trigger |
| Guide | Integration with existing helpdesk, measuring deflection rate, human handoff patterns |

**Key policies:**
- Rate limit on outbound communications (prevent spam)
- Sentiment threshold for auto-escalation
- SLA-based priority: response time < 5 minutes for high severity

## Vertical 3: HealthTech

**Target:** Healthcare organizations automating patient communication, appointment management, and clinical workflow support.

| Component | Content |
|-----------|---------|
| Templates | Appointment Reminder, Insurance Verification, Patient Intake, Lab Result Notification |
| Policies | HIPAA-aligned data handling, strict PII masking, audit for all PHI access, approval for clinical actions |
| Tools | EHR API (FHIR), insurance verification, patient portal, secure messaging |
| Guide | HIPAA compliance configuration, PHI handling, BAA requirements |

**Key policies:**
- All patient data classified as `high` risk
- Full PII masking in OPA input and audit details
- No LLM processing of PHI without explicit consent flag
- Audit retention: 6 years (HIPAA minimum)

## Vertical 4: E-Commerce Operations

**Target:** E-commerce teams automating order processing, inventory management, and customer notifications.

| Component | Content |
|-----------|---------|
| Templates | Order Status Update, Inventory Alert, Return Processing, Review Moderation |
| Policies | Transaction data handling (moderate risk), rate limits for order APIs, cost budgets |
| Tools | Shopify/WooCommerce API, shipping tracker, email/SMS, inventory management |
| Guide | Integration with e-commerce platform, handling order volumes, cost optimization |

**Key policies:**
- Rate limiting aligned with platform API limits
- Cost budget per order interaction
- Automated retry for transient shipping API failures

## Kit Delivery

### Phase 1: Documentation Only

Each kit as a markdown guide with template JSON files and sample policy Rego.

### Phase 2: Installable Package

```bash
# Install from marketplace
scenario-builder kit install fintech

# Or from local files
scenario-builder kit install ./vertical-kit-fintech/
```

### Phase 3: Marketplace Listing

Each kit available as a Verified marketplace listing with one-click install.

## Dependencies

- L-01 (Template catalog) — base template format
- B-01 (Marketplace) — distribution
- B-04 (OPA federation) — per-vertical policy bundles
