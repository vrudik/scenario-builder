# First-Run Onboarding Flow — Design Document

Status: **RFC / Design**
Priority: P0

## Goal

A new user should reach their **first successful scenario execution** in under 10 minutes. The onboarding flow eliminates the blank-canvas problem and demonstrates core product value immediately.

## Onboarding Steps

```
1. Welcome → 2. Create Org → 3. Choose Template → 4. Configure → 5. Execute → 6. Review Results
```

### Step 1: Welcome Screen

**Trigger:** First visit to admin dashboard (no org exists).

**Content:**
- Product name and one-liner
- 3 value props: Governance, Durability, Observability
- CTA: "Get Started" button

**Technical:** Check for `Org` count in DB. If zero → redirect to onboarding.

### Step 2: Create Organization

**Inputs:**
- Organization name (required)
- Your name / email (required)
- Use case selection (optional, influences template recommendations):
  - Customer support automation
  - Document processing
  - Internal operations
  - Custom / exploring

**Result:** Creates Org + default Workspace + first OrgMember (role: owner).

### Step 3: Choose a Starter Template

**Display:** Curated grid of 3-5 templates matched to selected use case.

| Template | Use Case | Complexity |
|----------|---------|-----------|
| **Customer Ticket Triage** | Support | Simple (2 tools) |
| **Order Status Lookup** | Support/Ops | Simple (2 tools) |
| **Document Intake** | Document processing | Medium (3 tools) |
| **Incident Response** | Internal ops | Medium (4 tools) |
| **Custom Blank Spec** | Any | Manual |

Each template card shows:
- Name and description
- Number of tools and estimated cost per run
- "Use This Template" button
- "Preview Spec" expandable section

**Technical:** Templates stored in `Template` model with `category: 'onboarding'` tag.

### Step 4: Configure Scenario

**Pre-filled form** from template with editable fields:

- Scenario name (pre-filled from template)
- Tool configuration:
  - For each tool: mock mode (sandbox) or live connection
  - API endpoint URLs (pre-filled with mock endpoints)
- Execution settings:
  - Runtime: in-memory (default for onboarding) or Temporal
  - Cost budget: pre-filled from template
  - Token budget: pre-filled from template

**Key UX principle:** Everything works with defaults. User can click "Next" without changing anything.

### Step 5: Execute

**One-click execution** with live status:

```
[Create Scenario] → [Start Execution] → [Live Progress]
```

- Progress bar showing current node
- Real-time events via WebSocket (existing `admin-runs` WS)
- Estimated time remaining
- Cost counter

**Technical:** Uses existing `POST /api/execute-orchestrator` with sandbox tool mode.

### Step 6: Review Results

**Dashboard showing:**
- Execution status (PASSED / FAILED)
- Timeline of nodes with durations
- Tool call details (input/output)
- Policy decisions (what was checked)
- Cost summary

**Next steps suggested:**
- "Edit this scenario" → Spec Studio
- "Try with real tools" → Configuration
- "Create another scenario" → Templates
- "Explore admin dashboard" → Full dashboard

## Technical Implementation

### Onboarding State

```typescript
interface OnboardingState {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 'completed';
  orgId?: string;
  templateId?: string;
  scenarioId?: string;
  executionId?: string;
  completedAt?: Date;
}
```

Stored in `localStorage` (for session persistence) and optionally in DB (for analytics).

### Onboarding API

```
GET  /api/onboarding/status        # Current onboarding state
POST /api/onboarding/org           # Step 2: create org
GET  /api/onboarding/templates     # Step 3: list starter templates
POST /api/onboarding/scenario      # Step 4: create scenario from template
POST /api/onboarding/execute       # Step 5: execute scenario
POST /api/onboarding/complete      # Step 6: mark onboarding done
```

### Onboarding Templates (Seed Data)

On first run, seed 3-5 onboarding templates:

```typescript
const onboardingTemplates = [
  {
    name: 'Customer Ticket Triage',
    category: 'onboarding',
    tags: ['support', 'starter'],
    spec: {
      id: 'onboarding-ticket-triage',
      name: 'Customer Ticket Triage',
      description: 'Classify and route customer support tickets',
      allowedActions: [
        { id: 'get-ticket', name: 'Get Ticket Details', riskClass: 'low' },
        { id: 'classify-ticket', name: 'Classify Ticket', riskClass: 'low' },
      ],
      riskClass: 'low',
      nonFunctional: {
        cost: { maxPerExecution: 0.05 },
        tokenBudget: { maxPerExecution: 2000 },
      },
    },
  },
  // ... more templates
];
```

### Admin Dashboard Integration

- Onboarding banner on dashboard if `onboarding.step !== 'completed'`
- "Resume onboarding" link if abandoned mid-flow
- "Re-run onboarding" in settings for re-orientation

## UX Guidelines

1. **No dead ends** — every screen has a clear next action
2. **Everything has defaults** — user never needs to fill from scratch
3. **Instant feedback** — execution starts immediately, progress is visible
4. **Safe to explore** — sandbox mode, no real API calls, no cost
5. **Skip option** — experienced users can skip onboarding entirely

## Metrics

| Metric | Target |
|--------|--------|
| Time to first execution (TTFX) | <10 minutes |
| Onboarding completion rate | >60% |
| Drop-off at each step | <20% per step |
| Re-engagement after drop-off | >30% within 24h |

## Dependencies

- N-11 (Org/Workspace) — org creation in step 2
- N-18 (Template-first entry) — template catalog for step 3
- Existing WebSocket support in admin-runs.html
- Existing execution API
