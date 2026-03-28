# Templates UX & Scenario Catalog — Design Document

Status: **RFC / Design**

## Template Gallery UX

### Layout

Grid view (default) with cards, switchable to list view.

```
┌─────────────────────────────────────────────────────┐
│  Template Gallery                    [Grid] [List]  │
│  ┌─────────┐  ┌─────────┐                         │
│  │ Filter   │  │ Search ________________________│  │
│  │ ☑ Starter│  │                                   │
│  │ ☑ Standard│ │                                   │
│  │ □ Industry│ │                                   │
│  │           │  │                                   │
│  │ Difficulty│  │  ┌────────┐ ┌────────┐ ┌────────┐│
│  │ ☑ Simple  │  │  │ Ticket │ │ Order  │ │ Data   ││
│  │ ☑ Medium  │  │  │ Triage │ │ Status │ │ Enrich ││
│  │ □ Advanced│  │  │ ●● low │ │ ●● low │ │ ●●● med││
│  │           │  │  │ 2 tools│ │ 2 tools│ │ 3 tools││
│  │ Tags      │  │  │ $0.05  │ │ $0.03  │ │ $0.10  ││
│  │ support   │  │  │ [Use]  │ │ [Use]  │ │ [Use]  ││
│  │ ops       │  │  └────────┘ └────────┘ └────────┘│
│  └─────────┘  │                                     │
└─────────────────────────────────────────────────────┘
```

### Card Components

Each template card shows:
- Template name
- 1-line description
- Difficulty indicator (dots: ● simple, ●● medium, ●●● advanced)
- Tool count
- Estimated cost per run
- Category badge (Starter / Standard / Industry)
- **[Use Template]** — primary CTA
- **[Preview]** — expandable spec view

### Template Detail View

Clicking a card opens a detail panel (side drawer or modal):

```
┌──────────────────────────────────┐
│ Customer Ticket Triage     [Use] │
│ ─────────────────────────────── │
│ Description: ...                 │
│ Difficulty: Simple               │
│ Risk class: low                  │
│ Tools: get-ticket, classify      │
│ Cost: ~$0.05/run                 │
│ ─────────────────────────────── │
│ Guide                            │
│ (markdown walkthrough)           │
│ ─────────────────────────────── │
│ Spec (JSON)          [Copy] [↓]  │
│ { "version": "0.1.0", ... }     │
└──────────────────────────────────┘
```

## Scenario Catalog UX

Scenarios list (existing `admin-scenarios.html`) enhanced with:

### Filters

- Status: draft / active / archived
- Created by: me / team / all
- Template origin: from template / custom
- Workspace (if multi-workspace)

### Scenario Card

```
┌────────────────────────────────────────┐
│ My Ticket Triage         [Active] [▶]  │
│ Based on: Customer Ticket Triage       │
│ Last run: 2h ago | Success rate: 94%   │
│ Tools: 2 | Cost avg: $0.04             │
│ [Edit] [Duplicate] [Archive]           │
└────────────────────────────────────────┘
```

### "New Scenario" Flow

```
[+ New Scenario]
  ┌─────────────────────────────────┐
  │ How would you like to start?    │
  │                                 │
  │ ┌───────────────┐ ┌──────────┐ │
  │ │ From Template │ │  Blank   │ │
  │ │ (recommended) │ │ Spec     │ │
  │ └───────────────┘ └──────────┘ │
  └─────────────────────────────────┘
```

"From Template" → opens Template Gallery with "instantiate" mode.

## Instantiation Flow

```
1. User clicks [Use Template]
2. System creates Scenario (draft) from template spec
3. Redirect to Spec Studio with pre-filled spec
4. User can edit name, tools, budgets
5. [Save] → scenario saved
6. [Save & Execute] → save + immediate execution
```

## Search

- Full-text search across template names, descriptions, tags
- Fuzzy matching for typos
- Search results highlighted

## Dependencies

- L-01 (Template catalog) — template data
- N-18 (Template-first entry) — UX design
- Existing `admin-templates.html` and `admin-scenarios.html` pages
