# Role-Based UX Model — Design Document

Status: **RFC / Design**

## Principle

Each role sees only what they need. The UI adapts based on the authenticated user's role.

## Role → UI Mapping

### Navigation Visibility

| Page | owner | admin | builder | operator | viewer |
|------|-------|-------|---------|----------|--------|
| Dashboard | Yes | Yes | Yes | Yes | Yes |
| Scenarios | Yes | Yes | Yes | Read-only | Read-only |
| Spec Studio | Yes | Yes | Yes | — | — |
| Runs | Yes | Yes | Yes | Yes | Read-only |
| Templates | Yes | Yes | Yes | Read-only | Read-only |
| Queues | Yes | Yes | Yes | Yes | Read-only |
| Testing | Yes | Yes | Yes | — | — |
| Configuration | Yes | Yes | — | — | — |
| Monitoring | Yes | Yes | Yes | Yes | Yes |
| Observability | Yes | Yes | Yes | Yes | Yes |
| Org Settings | Yes | Yes | — | — | — |
| Billing | Yes | — | — | — | — |

### Action Visibility

| Action | Roles |
|--------|-------|
| Create scenario | admin, builder |
| Edit scenario | admin, builder |
| Delete scenario | admin, builder |
| Execute scenario | admin, builder, operator |
| Cancel execution | admin, builder, operator |
| Create template | admin, builder |
| Manage queues | admin, builder |
| Pause/resume queue | admin, builder, operator |
| Export audit | admin |
| Manage members | admin, owner |
| Create API keys | admin, owner |
| Change org settings | admin, owner |

### Dashboard Variants

**Builder dashboard:**
- Recent scenarios (mine)
- Recent executions (mine)
- Quick actions: New Scenario, Open Templates
- Error summary for my scenarios

**Operator dashboard:**
- Active executions
- Queue status
- Recent failures with retry buttons
- Quick actions: Execute, View Runs

**Viewer dashboard:**
- Execution summary (success/failure rates)
- Audit highlights
- System health

### Implementation

Role-based UI hiding via CSS classes and JS:

```javascript
const role = getCurrentUserRole(); // from session
document.querySelectorAll('[data-min-role]').forEach(el => {
  const minRole = el.dataset.minRole;
  if (!hasRole(role, minRole)) {
    el.style.display = 'none';
  }
});
```

Server-side enforcement remains in middleware (RBAC from N-12). Client-side hiding is UX only.

## Dependencies

- N-12 (RBAC matrix) — role definitions
- N-10 (Auth model) — user identity in session
