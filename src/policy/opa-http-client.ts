/**
 * Клиент OPA Data API (POST /v1/data/...).
 * Ожидается правило boolean, например package scenario { default allow = true }
 */

export interface OpaHttpClientOptions {
  timeoutMs?: number;
  /** При ошибке сети / 5xx: true — считать allow (не блокировать), false — запретить */
  failOpen?: boolean;
}

export class OpaHttpClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly options: OpaHttpClientOptions = {}
  ) {
    this.base = baseUrl.replace(/\/$/, '');
  }

  /**
   * Запрос к rule path вида "scenario/allow" → package scenario, rule allow
   */
  async queryAllow(path: string, input: Record<string, unknown>): Promise<boolean> {
    const url = `${this.base}/v1/data/${path.replace(/^\//, '')}`;
    const timeoutMs = this.options.timeoutMs ?? 2500;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
        signal: controller.signal
      });

      if (!res.ok) {
        return this.options.failOpen !== false ? true : false;
      }

      const json = (await res.json()) as { result?: boolean | null };
      if (json.result === undefined || json.result === null) {
        return this.options.failOpen !== false ? true : false;
      }
      return Boolean(json.result);
    } catch {
      return this.options.failOpen !== false ? true : false;
    } finally {
      clearTimeout(timer);
    }
  }
}
