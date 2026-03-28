import { describe, it, expect } from 'vitest';

describe('API versioning', () => {
  it('v1 prefix concept is simple path normalization', () => {
    function normalizeApiPath(pathname: string): { effectivePath: string; deprecated: boolean } {
      if (pathname.startsWith('/api/v1/')) {
        return { effectivePath: '/api/' + pathname.slice(8), deprecated: false };
      }
      if (pathname.startsWith('/api/')) {
        return { effectivePath: pathname, deprecated: true };
      }
      return { effectivePath: pathname, deprecated: false };
    }

    expect(normalizeApiPath('/api/v1/scenarios')).toEqual({ effectivePath: '/api/scenarios', deprecated: false });
    expect(normalizeApiPath('/api/v1/auth/whoami')).toEqual({ effectivePath: '/api/auth/whoami', deprecated: false });
    expect(normalizeApiPath('/api/scenarios')).toEqual({ effectivePath: '/api/scenarios', deprecated: true });
    expect(normalizeApiPath('/admin-dashboard.html')).toEqual({ effectivePath: '/admin-dashboard.html', deprecated: false });
  });
});
