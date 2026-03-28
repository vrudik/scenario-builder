/**
 * Shared RBAC helper for admin pages.
 * Fetches current user role from /api/auth/whoami and hides elements
 * that require a higher role via data-min-role attribute.
 *
 * Usage: <button data-min-role="admin">Delete</button>
 * Include this script in admin pages: <script src="/admin-common-rbac.js"></script>
 */

(function() {
  const ROLE_RANK = { owner: 0, admin: 1, builder: 2, operator: 3, viewer: 4 };

  function getRank(role) {
    return ROLE_RANK[role] !== undefined ? ROLE_RANK[role] : 999;
  }

  async function initRBAC() {
    try {
      const res = await fetch('/api/auth/whoami');
      if (!res.ok) return;
      const data = await res.json();

      const identity = data.identity;
      if (!identity) return;

      const userRoles = identity.roles || ['viewer'];
      let bestRank = 999;
      let bestRole = 'viewer';
      for (const r of userRoles) {
        const rank = getRank(r);
        if (rank < bestRank) {
          bestRank = rank;
          bestRole = r;
        }
      }

      window.__sbUserRole = bestRole;
      window.__sbUserIdentity = identity;

      document.querySelectorAll('[data-min-role]').forEach(function(el) {
        const minRole = el.getAttribute('data-min-role');
        if (getRank(minRole) < bestRank) {
          el.style.display = 'none';
        }
      });

    } catch (e) {
      // Auth unavailable - show everything (fail-open for UI)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRBAC);
  } else {
    initRBAC();
  }
})();
