/**
 * Нормализация идентификатора тенанта для API (заголовок X-Tenant-ID).
 * Невалидные значения приводятся к "default".
 */
const TENANT_RE = /^[a-zA-Z0-9._-]{1,64}$/;

export function normalizeTenantId(raw: unknown): string {
  if (raw == null) {
    return 'default';
  }
  const s = String(raw).trim();
  if (s === '' || !TENANT_RE.test(s)) {
    return 'default';
  }
  return s;
}
