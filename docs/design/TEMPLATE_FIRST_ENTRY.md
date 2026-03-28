# Template-First Entry Path — Design Document

Status: **RFC / Design**
Priority: P0

## Problem

Current entry into the product is a blank scenario spec editor. For non-expert users, this creates a "blank canvas" problem — they don't know where to start or what a good spec looks like.

## Solution

Make templates the primary entry point: users start from a working template and customize, rather than building from scratch.

## Template Tiers

| Tier | Name | Purpose | Count (Wave 1) |
|------|------|---------|----------------|
| **Starter** | Getting Started | Onboarding, learning the product | 3–5 |
| **Standard** | Production Recipes | Common patterns ready for customization | 5–10 |
| **Industry** | Vertical Packs | Industry-specific scenarios | 2–3 per vertical (later) |

### Starter Templates (Wave 1)

| Template | Description | Tools | Complexity |
|----------|-----------|-------|-----------|
| Customer Ticket Triage | Classify and route support tickets | get-ticket, classify-ticket | Simple |
| Order Status Lookup | Check order status and notify customer | get-order, send-notification | Simple |
| Document Intake | Process incoming documents and extract data | parse-document, validate-data, store-record | Medium |
| Incident Response | Detect, assess, and respond to incidents | get-alert, assess-severity, notify-team, create-ticket | Medium |
| Data Enrichment Pipeline | Enrich records from multiple sources | fetch-record, enrich-from-api, update-record | Medium |

### Template Structure

Each template includes:

```typescript
interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  category: 'starter' | 'standard' | 'industry';
  tags: string[];
  difficulty: 'simple' | 'medium' | 'advanced';
  estimatedCostPerRun: number;
  estimatedDuration: string;
  spec: ScenarioSpec;         // Full valid spec
  mockTools: MockToolConfig[]; // Sandbox tool implementations
  guide: string;               // Markdown walkthrough
}
```

### Mock Tool Implementations

Each template comes with mock tool implementations for sandbox mode:

```typescript
interface MockToolConfig {
  toolId: string;
  name: string;
  mockResponse: Record<string, unknown>;
  mockLatency: number; // ms
  mockFailRate: number; // 0-1, for testing error handling
}
```

This ensures templates work immediately without external API configuration.

## UX Flow

### Template Gallery (Entry Point)

```
/admin-templates.html → Template Gallery
  ├── Filter by: category, difficulty, tags
  ├── Search
  └── Each card:
      ├── Name + description
      ├── Difficulty badge
      ├── Tool count + estimated cost
      ├── [Preview Spec] → expands spec JSON
      └── [Use Template] → creates scenario
```

### From Template to Running Scenario

```
1. [Use Template] → Clone spec into new Scenario (draft)
2. Redirect to Spec Studio with pre-filled spec
3. User reviews / customizes
4. [Save & Execute] → Creates + runs scenario
5. Redirect to Runs page with live execution
```

### "New Scenario" Default Path

Replace current "New Scenario" with:

```
[+ New Scenario]
  ├── "Start from Template" (primary, highlighted)
  └── "Blank Scenario" (secondary, for advanced users)
```

## Template Management

### Admin API

```
GET    /api/templates                    # List templates (with filters)
GET    /api/templates/:id                # Get template details
POST   /api/templates                    # Create template (admin/builder)
PUT    /api/templates/:id                # Update template
DELETE /api/templates/:id                # Delete template
POST   /api/templates/:id/instantiate    # Create scenario from template
```

### Template Seeding

On first run, seed starter templates:

```bash
# Seed runs automatically on server start if no templates exist
node server.cjs  # → checks Template count → seeds starters if 0
```

### Template Versioning

```prisma
model Template {
  // ... existing fields ...
  version     String   @default("1.0.0")
  parentId    String?  // previous version of this template
  isPublished Boolean  @default(false)
  difficulty  String   @default("simple")
  mockConfig  String?  // JSON MockToolConfig[]
  guide       String?  // Markdown walkthrough
}
```

## Template Guide Format

Each template includes a walkthrough in markdown:

```markdown
# Customer Ticket Triage

## What this template does
Automatically classifies incoming customer tickets and routes them to the right team.

## How it works
1. **Get Ticket** — fetches ticket details from your ticketing system
2. **Classify** — LLM agent analyzes the ticket and assigns a category
3. **Route** — based on classification, routes to appropriate queue

## Customization
- Change the classification categories in the spec
- Add a "send acknowledgment" tool for auto-replies
- Adjust the cost budget based on your LLM pricing

## Going to Production
1. Replace mock tools with real API endpoints
2. Set appropriate rate limits
3. Configure OPA policies for your org
4. Switch runtime to Temporal for durability
```

## Metrics

| Metric | Target |
|--------|--------|
| Template-to-execution rate | >40% of template views lead to execution |
| Time from template to first execution | <5 minutes |
| Template customization rate | >60% of users modify at least one field |
| Return to templates rate | >30% come back for a second template |

## Dependencies

- N-17 (Onboarding) — uses templates in step 3
- Existing `Template` model in Prisma
- Existing `admin-templates.html` page
- Existing `admin-spec-studio.html` for spec editing
