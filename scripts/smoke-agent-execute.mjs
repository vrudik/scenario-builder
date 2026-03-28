/**
 * Смоук п.2 чеклиста: POST /api/scenarios (с tenant + tokenBudget) → POST /api/agent/execute.
 * Требуется запущенный server.cjs и доступная БД (тот же DATABASE_URL, что у сервера).
 *
 * Env:
 *   SMOKE_BASE_URL — по умолчанию http://127.0.0.1:3000
 *   SMOKE_TENANT   — по умолчанию smoke-tenant
 */
const BASE = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TENANT = process.env.SMOKE_TENANT || 'smoke-tenant';

function fail(msg, detail) {
  console.error(`[smoke:agent] FAIL: ${msg}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

async function main() {
  const spec = {
    version: '0.1.0',
    id: 'spec-inline-id',
    name: 'Smoke agent (token budget)',
    goal: 'Проверка загрузки spec из БД и бюджета токенов для агента.',
    triggers: [{ type: 'manual' }],
    allowedActions: [
      {
        id: 'web-search-tool',
        name: 'Web Search',
        version: '1.0.0',
        riskClass: 'low',
        requiresApproval: false
      }
    ],
    riskClass: 'low',
    nonFunctional: {
      tokenBudget: { maxPerExecution: 50000 }
    }
  };

  let r1;
  try {
    r1 = await fetch(`${BASE}/api/scenarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': TENANT
      },
      body: JSON.stringify({
        name: `Smoke ${new Date().toISOString()}`,
        description: 'smoke-agent-execute',
        spec
      })
    });
  } catch (e) {
    fail(
      `Нет ответа от ${BASE} (сервер запущен? node server.cjs).`,
      e instanceof Error ? e.message : e
    );
  }

  const text1 = await r1.text();
  let j1;
  try {
    j1 = JSON.parse(text1);
  } catch {
    fail(`POST /api/scenarios: не JSON (HTTP ${r1.status})`, text1.slice(0, 500));
  }

  if (!j1.success || !j1.scenario?.id) {
    fail('POST /api/scenarios: ожидались success и scenario.id', j1);
  }

  const scenarioId = j1.scenario.id;
  console.log(`[smoke:agent] Создан сценарий id=${scenarioId} tenant=${TENANT}`);

  let r2;
  try {
    r2 = await fetch(`${BASE}/api/agent/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': TENANT
      },
      body: JSON.stringify({
        userIntent: 'Reply with exactly: OK smoke.',
        scenarioId,
        tenantId: TENANT,
        _tenantId: TENANT
      })
    });
  } catch (e) {
    fail('POST /api/agent/execute: сеть', e instanceof Error ? e.message : e);
  }

  const text2 = await r2.text();
  let j2;
  try {
    j2 = JSON.parse(text2);
  } catch {
    fail(`POST /api/agent/execute: не JSON (HTTP ${r2.status})`, text2.slice(0, 800));
  }

  if (typeof j2.success !== 'boolean') {
    fail('Ответ агента без поля success', j2);
  }

  console.log(
    `[smoke:agent] Агент: success=${j2.success} toolCalls=${j2.toolCallsExecuted ?? 'n/a'} tokens=${j2.totalTokens ?? 'n/a'}`
  );
  if (j2.error) {
    console.log('[smoke:agent] error:', j2.error);
  }
  if (j2.fallbackUsed) {
    console.log('[smoke:agent] note: fallbackUsed=true (упрощённый режим без tsx — см. логи сервера)');
  }

  // Успех смоука: HTTP 200, структура ответа валидна (LLM может вернуть success=false при недоступности Ollama).
  if (!r2.ok) {
    fail(`POST /api/agent/execute: HTTP ${r2.status}`, j2);
  }

  console.log('[smoke:agent] PASS: цепочка API → сценарий в БД → execute-agent отработал.');
  if (process.env.OPA_URL?.trim()) {
    console.log('[smoke:agent] OPA_URL задан — политики OPA участвуют при вызове инструментов.');
  } else {
    console.log('[smoke:agent] OPA_URL не задан — только локальная ExecutionPolicy на gateway.');
  }
}

main();
