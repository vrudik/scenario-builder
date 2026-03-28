# Customer Billing UX — Design Document

Status: **RFC / Design**

## Overview

Self-service billing experience for org owners/admins to manage their plan, view invoices, and control spending.

## Pages

### 1. Plan & Billing Overview

```
┌──────────────────────────────────────────┐
│ Plan & Billing                           │
│ ──────────────────────────────────────── │
│                                          │
│ Current Plan: Pro ($299/mo)              │
│ Billing Period: Mar 1 – Mar 31, 2024    │
│ Next Invoice: ~$327 (incl. overage)     │
│                                          │
│ ┌───────────────────────────────────┐   │
│ │ Execution Usage      3,420 / 5,000│   │
│ │ ████████████████░░░░  68%         │   │
│ │ Overage: 0 (est. $0)             │   │
│ └───────────────────────────────────┘   │
│                                          │
│ [Upgrade Plan] [Manage Payment] [Invoices]│
└──────────────────────────────────────────┘
```

### 2. Plan Selection

```
┌──────────────────────────────────────────────────────┐
│ Choose Your Plan                                      │
│                                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│ │ Free     │ │ Pro      │ │ Business │ │Enterprise││
│ │ $0/mo    │ │ $299/mo  │ │ $799/mo  │ │ Custom   ││
│ │ 500 exec │ │ 5K exec  │ │ 25K exec │ │Unlimited ││
│ │ 1 WS     │ │ 3 WS     │ │ 10 WS    │ │Unlimited ││
│ │ 3 users  │ │ 10 users │ │ 50 users │ │Unlimited ││
│ │          │ │ Temporal  │ │ +Slack   │ │ +24/7    ││
│ │ [Current]│ │[Upgrade] │ │[Upgrade] │ │[Contact] ││
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                                                       │
│ Annual billing: Save 17% (2 months free)             │
└──────────────────────────────────────────────────────┘
```

### 3. Payment Method

```
┌──────────────────────────────────────────┐
│ Payment Method                           │
│ ──────────────────────────────────────── │
│                                          │
│ 💳 Visa ending in 4242                   │
│ Expires: 12/2025                         │
│ [Update Card]                            │
│                                          │
│ Billing Email: billing@acme.com          │
│ [Change Email]                           │
│                                          │
│ Billing Address:                         │
│ Acme Corp, 123 Main St, SF CA 94102    │
│ [Update Address]                         │
└──────────────────────────────────────────┘
```

### 4. Invoice History

```
┌──────────────────────────────────────────┐
│ Invoices                                 │
│ ──────────────────────────────────────── │
│                                          │
│ Mar 2024  $327.40  Paid ✓   [Download]  │
│   Plan: $299.00                          │
│   Overage: 340 exec × $0.08 = $27.20   │
│   Tax: $1.20                             │
│                                          │
│ Feb 2024  $299.00  Paid ✓   [Download]  │
│ Jan 2024  $299.00  Paid ✓   [Download]  │
└──────────────────────────────────────────┘
```

## Spending Controls

### Budget Alerts

```
Alert when monthly spend exceeds:
  ☑ 80% of plan ($239)     → email to billing contact
  ☑ 100% of plan ($299)    → email to billing contact + org admin
  ☑ Custom: $500            → email to billing contact
```

### Hard Spending Limit

```
Hard limit: $___/month
When reached: ☐ Block new executions  ☑ Allow with alert
```

## Payment Integration

### Stripe (Recommended)

```
Customer creates org → Stripe Customer created
User upgrades plan → Stripe Checkout Session → Subscription
Monthly billing → Stripe Invoice → Webhook → Update org plan
Overage → Stripe Usage Record → Metered billing at period end
```

### Integration Points

| Event | Direction | Action |
|-------|----------|--------|
| Plan upgrade | App → Stripe | Create/update subscription |
| Payment success | Stripe → App | Activate/renew plan |
| Payment failure | Stripe → App | Grace period → suspend |
| Usage reporting | App → Stripe | Report metered usage daily |
| Invoice generated | Stripe → App | Store invoice reference |

### Stripe Models

```
Stripe Customer     ← 1:1 → Org
Stripe Subscription ← 1:1 → Org plan
Stripe Price        ← 1:1 → Plan tier (monthly/annual)
Stripe Usage Record ← N:1 → Subscription (overage executions)
```

## Webhook Handling

```typescript
// POST /api/billing/webhook (Stripe webhook)
app.post('/api/billing/webhook', async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body, req.headers['stripe-signature'], webhookSecret
  );

  switch (event.type) {
    case 'invoice.paid':
      await activateOrg(event.data.object.customer);
      break;
    case 'invoice.payment_failed':
      await startGracePeriod(event.data.object.customer);
      break;
    case 'customer.subscription.deleted':
      await downgradeToFree(event.data.object.customer);
      break;
  }
});
```

## Grace Period

On payment failure:
1. Day 0: Payment fails → email notification, service continues
2. Day 3: Retry payment → second notification
3. Day 7: Final retry → warning: service will be limited
4. Day 14: Downgrade to Free tier limits (executions blocked above 500/mo)
5. Day 30: Account suspended if still unpaid

## Access Control

| Action | Roles |
|--------|-------|
| View plan/billing | owner |
| Upgrade/downgrade plan | owner |
| Update payment method | owner |
| View invoices | owner, admin |
| Set spending alerts | owner, admin |

## Dependencies

- N-21 (Pricing) — tier definitions
- N-22 (Metering) — usage data for overage billing
- N-10 (Auth) — owner role enforcement
- N-11 (Org model) — org ↔ billing relationship
