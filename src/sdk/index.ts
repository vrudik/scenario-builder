/**
 * Minimal HTTP client for the Scenario Builder API.
 * Regenerate typings: npm run sdk:types
 */
export type { paths, components, webhooks, operations } from './openapi-types.js';

export type ScenarioBuilderClientOptions = {
  baseUrl: string;
  apiPrefix?: string;
  bearerToken?: string;
  tenantId?: string;
  fetchFn?: typeof globalThis.fetch;
};

/** Subset of fetch init without DOM lib dependency */
export type ScenarioBuilderRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

export class ScenarioBuilderClient {
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(private readonly opts: ScenarioBuilderClientOptions) {
    this.fetchImpl = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private headers(extra?: Record<string, string>): globalThis.Headers {
    const h = new globalThis.Headers();
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        h.set(k, v);
      }
    }
    if (this.opts.bearerToken) {
      h.set('Authorization', `Bearer ${this.opts.bearerToken}`);
    }
    if (this.opts.tenantId) {
      h.set('X-Tenant-ID', this.opts.tenantId);
    }
    return h;
  }

  private prefix(): string {
    const p = this.opts.apiPrefix ?? '/api';
    return p.endsWith('/') ? p.slice(0, -1) : p;
  }

  async request(path: string, init?: ScenarioBuilderRequestInit): Promise<globalThis.Response> {
    const rel = `${this.prefix()}${path.startsWith('/') ? path : `/${path}`}`;
    const url = joinUrl(this.opts.baseUrl, rel);
    const merged = this.headers(init?.headers);
    return this.fetchImpl(url, { method: init?.method, headers: merged, body: init?.body });
  }

  async getJson<T = unknown>(path: string): Promise<T> {
    const r = await this.request(path);
    return r.json() as Promise<T>;
  }

  async postJson<T = unknown>(path: string, body: unknown): Promise<T> {
    const r = await this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json() as Promise<T>;
  }

  async patchJson<T = unknown>(path: string, body: unknown): Promise<T> {
    const r = await this.request(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json() as Promise<T>;
  }

  async deleteJson<T = unknown>(path: string): Promise<T> {
    const r = await this.request(path, { method: 'DELETE' });
    return r.json() as Promise<T>;
  }

  /** @see docs/api/openapi.json — /quotas */
  listQuotas(orgId: string): Promise<unknown> {
    const q = new URLSearchParams({ orgId });
    return this.getJson(`/quotas?${q}`);
  }

  upsertQuota(body: {
    orgId: string;
    metric: string;
    limitVal: number;
    period: string;
    action: string;
  }): Promise<unknown> {
    return this.postJson('/quotas', body);
  }

  deleteQuota(id: string): Promise<unknown> {
    return this.deleteJson(`/quotas?id=${encodeURIComponent(id)}`);
  }

  /** @see docs/contracts/WEBHOOK_DELIVERY.md */
  listWebhooks(orgId: string): Promise<unknown> {
    const q = new URLSearchParams({ orgId });
    return this.getJson(`/webhooks?${q}`);
  }

  createWebhook(body: { orgId: string; url: string; events: string[] }): Promise<unknown> {
    return this.postJson('/webhooks', body);
  }

  patchWebhook(
    id: string,
    body: { url?: string; events?: string[]; active?: boolean },
  ): Promise<unknown> {
    return this.patchJson(`/webhooks/${encodeURIComponent(id)}`, body);
  }

  deleteWebhook(id: string): Promise<unknown> {
    return this.deleteJson(`/webhooks/${encodeURIComponent(id)}`);
  }

  testWebhook(id: string): Promise<unknown> {
    return this.postJson(`/webhooks/${encodeURIComponent(id)}/test`, {});
  }

  getDeploymentOperator(): Promise<unknown> {
    return this.getJson('/deployment/operator');
  }

  patchDeploymentOperator(body: {
    canaryPercent?: number;
    activeLane?: string;
    notes?: string;
  }): Promise<unknown> {
    return this.patchJson('/deployment/operator', body);
  }

  getUsage(orgId: string, period: string, tenantId?: string): Promise<unknown> {
    const q = new URLSearchParams({ orgId, period });
    if (tenantId) q.set('tenantId', tenantId);
    return this.getJson(`/usage?${q}`);
  }
}
