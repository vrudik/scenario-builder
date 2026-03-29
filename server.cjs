// Простой веб-сервер для просмотра статуса проекта
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// Устанавливаем DATABASE_URL по умолчанию для Prisma
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const PORT = 3000;

/** Prefer tsc output so `node server.cjs` works without ad-hoc .js under src/web. */
function compiledWebModuleUrl(name) {
  const distFile = path.join(__dirname, 'dist', 'web', `${name}.js`);
  if (fs.existsSync(distFile)) {
    return pathToFileURL(distFile).href;
  }
  return pathToFileURL(path.join(__dirname, 'src', 'web', `${name}.js`)).href;
}

/** Valid X-Tenant-ID from header, or undefined (caller uses identity default). */
function parseXTenantIdHeader(req) {
  const h = req.headers['x-tenant-id'];
  const raw = (Array.isArray(h) ? h[0] : h) || '';
  const s = String(raw).trim();
  if (s === '' || !/^[a-zA-Z0-9._-]{1,64}$/.test(s)) {
    return undefined;
  }
  return s;
}

let _tenantResolverMod = null;
async function loadTenantResolver() {
  if (!_tenantResolverMod) {
    _tenantResolverMod = await import(compiledWebModuleUrl('tenant-resolver'));
  }
  return _tenantResolverMod;
}

let _authWebMod = null;
async function loadAuthWebModule() {
  if (!_authWebMod) {
    _authWebMod = await import(compiledWebModuleUrl('auth'));
  }
  return _authWebMod;
}

/**
 * Identity-bound tenant (see tenant-resolver.ts). bodyTenantHint: optional override from JSON body.
 */
async function resolveTrustedTenant(req, bodyTenantHint) {
  try {
    const { resolveTenant } = await loadTenantResolver();
    const header = parseXTenantIdHeader(req);
    let override = header;
    if (override === undefined && bodyTenantHint != null && bodyTenantHint !== '') {
      const t = String(bodyTenantHint).trim();
      if (t !== '' && /^[a-zA-Z0-9._-]{1,64}$/.test(t)) override = t;
    }
    const result = await resolveTenant(req.auth, override);
    if (result === null) return { ok: false };
    return { ok: true, tenantId: result.tenantId, orgId: result.orgId };
  } catch (err) {
    if (req.auth?.orgId) {
      console.warn('[tenant] resolveTrustedTenant failed:', err?.message || err);
      return { ok: false };
    }
    return { ok: true, tenantId: req.auth?.tenantId ?? 'default', orgId: null };
  }
}

function respondTenantForbidden(res) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Tenant not allowed for this organization' }));
}

async function trustedTenantOrRespond(req, res, bodyTenantHint) {
  const t = await resolveTrustedTenant(req, bodyTenantHint);
  if (!t.ok) {
    respondTenantForbidden(res);
    return null;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Auth layer (API key + admin password)
// AUTH_MODE: off (default) | optional | required
// ---------------------------------------------------------------------------
const AUTH_MODE = (process.env.AUTH_MODE || 'off').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

/**
 * Org-bound API keys may only read/write their own org's usage and quotas.
 * Superuser (scopes:null), admin password, and dev anonymous admin bypass.
 */
function enforceOrgAccess(req, res, requestedOrgId) {
  const auth = req.auth;
  if (!auth) return true;
  const want = String(requestedOrgId || 'default');
  if (auth.scopes === null) return true;
  if (auth.method === 'admin_password') return true;
  if (
    AUTH_MODE === 'off' &&
    auth.method === 'anonymous' &&
    Array.isArray(auth.roles) &&
    auth.roles.includes('admin')
  ) {
    return true;
  }
  if (auth.orgId && auth.orgId !== want) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Organization access denied' }));
    return false;
  }
  return true;
}

/** Pass callerOrgId into quota-api delete to block cross-org deletes by id. */
function orgCheckPayloadForQuota(req, base) {
  if (req.auth?.scopes !== null && req.auth?.orgId) {
    return { ...base, callerOrgId: req.auth.orgId };
  }
  return base;
}

/**
 * Check if req.auth has the required scope. scopes:null = all.
 * Returns true if scope is satisfied, false otherwise.
 */
function requireScope(req, res, scope) {
  const identity = req.auth;
  if (!identity) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return false;
  }
  if (identity.scopes === null) return true; // null = all scopes (superuser)
  if (identity.scopes.includes(scope)) return true;
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Insufficient scope: ${scope} required` }));
  return false;
}

function classifyExecutionError(execution) {
  if (!execution) return { category: 'unknown', message: 'Execution not found', actions: [] };
  if (execution.status !== 'failed' && execution.status !== 'compensated') {
    return { category: 'none', message: 'Execution is not in error state', actions: [] };
  }

  const err = (execution.errorMessage || execution.error || '').toLowerCase();
  const code = (execution.errorCode || '').toLowerCase();

  let category = 'unknown';
  let message = execution.errorMessage || 'Unknown error';
  let actions = ['retry'];

  if (code.includes('config') || err.includes('configuration') || err.includes('missing') || err.includes('invalid spec')) {
    category = 'config';
    message = 'Configuration error: ' + (execution.errorMessage || 'Check scenario spec and tool configuration');
    actions = ['edit_scenario', 'view_spec'];
  } else if (code.includes('policy') || err.includes('denied') || err.includes('opa') || err.includes('blocked')) {
    category = 'policy';
    message = 'Policy violation: ' + (execution.errorMessage || 'OPA policy denied the operation');
    actions = ['view_opa_decision', 'edit_scenario'];
  } else if (code.includes('tool') || err.includes('tool') || err.includes('timeout') || err.includes('api call')) {
    category = 'tool';
    message = 'Tool failure: ' + (execution.errorMessage || 'External tool call failed');
    actions = ['retry', 'view_trace'];
  } else if (code.includes('agent') || err.includes('llm') || err.includes('model') || err.includes('token')) {
    category = 'agent';
    message = 'Agent/LLM error: ' + (execution.errorMessage || 'Agent runtime encountered an error');
    actions = ['retry', 'view_trace'];
  } else if (err.includes('connect') || err.includes('network') || err.includes('econnrefused') || err.includes('unavailable')) {
    category = 'infrastructure';
    message = 'Infrastructure error: ' + (execution.errorMessage || 'Service connectivity issue');
    actions = ['retry', 'check_health'];
  }

  return {
    category,
    message,
    actions,
    errorCode: execution.errorCode || null,
    executionId: execution.executionId || execution.id,
  };
}

/** Lazy-loaded Prisma client (ESM dynamic import from CJS). */
let _prismaPromise = null;
function getPrisma() {
  if (!_prismaPromise) {
    _prismaPromise = import('@prisma/client').then(mod => {
      const client = new mod.PrismaClient();
      return client;
    });
  }
  return _prismaPromise;
}

/** Workspace.tenantId → Org.id for quota / usage alignment */
async function resolveOrgIdForTenantServer(prisma, tenantId) {
  try {
    const ws = await prisma.workspace.findUnique({ where: { tenantId }, select: { orgId: true } });
    if (ws?.orgId) return ws.orgId;
    const org = await prisma.org.findUnique({ where: { slug: 'default' }, select: { id: true } });
    return org?.id ?? 'default';
  } catch {
    return 'default';
  }
}

/** Returns { blocked, limit?, current?, remaining? } when quota blocks further use */
async function checkQuotaBlockedServer(prisma, tenantId, metric) {
  const orgId = await resolveOrgIdForTenantServer(prisma, tenantId);
  const period = new Date().toISOString().slice(0, 7);
  const quota = await prisma.quotaConfig.findUnique({
    where: { orgId_metric_period: { orgId, metric, period: 'monthly' } },
  });
  if (!quota || quota.action !== 'block') return { blocked: false };
  const usage = await prisma.usageRecord.findUnique({
    where: { orgId_tenantId_period_metric: { orgId, tenantId, period, metric } },
  });
  const current = usage?.value ?? 0;
  if (current >= quota.limitVal) {
    return { blocked: true, limit: quota.limitVal, current, remaining: 0 };
  }
  return { blocked: false, remaining: quota.limitVal - current };
}

/**
 * Resolve auth from the request (shared cache + rules in src/web/auth.ts).
 * Returns { ok, identity, error? } where identity has { method, keyId?, tenantId, roles, scopes, orgId? }.
 */
async function resolveAuth(req) {
  const mod = await loadAuthWebModule();
  const h = req.headers['authorization'];
  const raw = h !== undefined && h !== null ? (Array.isArray(h) ? h[0] : h) : undefined;
  const authHeader = raw === undefined || raw === null ? undefined : String(raw);
  const result = await mod.resolveAuth(authHeader);
  if (!result.ok || !result.identity) return result;
  if (result.identity.method === 'api_key' && result.identity.orgId === undefined) {
    return { ...result, identity: { ...result.identity, orgId: null } };
  }
  return result;
}

// Хранилище метрик для экспорта
let metricsStore = {
  scenario_executions_total: 0,
  scenario_success_total: 0,
  scenario_failures_total: 0,
  agent_tool_calls_total: 0,
  agent_tokens_used_total: 0,
  agent_llm_calls_total: 0,
  lastUpdate: null
};

// Глобальное хранилище событий Event Bus (сохраняется между запросами)
let eventBusEvents = [];
const MAX_EVENT_BUFFER_SIZE = 1000;

const demoScenario = {
  id: 'demo-order-support',
  name: 'Демо: обработка обращения по заказу',
  goal: 'Показать сквозную работу сценария: входящее обращение → проверка заказа → ответ клиенту.',
  trigger: 'POST /api/demo-e2e/run',
  prefilledInput: {
    customerId: 'cust-1024',
    orderId: 'ord-7781',
    message: 'Где мой заказ? Статус не меняется уже 2 дня.'
  }
};

const demoState = {
  totalRuns: 0,
  successfulRuns: 0,
  totalDurationMs: 0,
  totalCostUsd: 0,
  lastRun: null
};

// In-memory guardrails configuration (shared for full server runtime)
let guardrailsConfig = {
  sensitivity: 'medium',
  risks: {
    promptInjection: {
      enabled: true,
      label: 'Prompt Injection',
      description:
        'Блокировать попытки переписать системные инструкции или заставить агента игнорировать правила.'
    },
    insecureOutput: {
      enabled: true,
      label: 'Опасные команды в ответах',
      description:
        'Запрещать вывод реально опасных команд (rm -rf /, DROP TABLE и т.п.) в ответах модели.'
    },
    excessiveAgency: {
      enabled: true,
      label: 'Excessive Agency',
      description:
        'Ограничивать количество вызовов инструментов за один ответ, чтобы агент не делал слишком много действий автоматически.',
      maxToolCallsPerResponse: 10
    },
    unauthorizedCode: {
      enabled: true,
      label: 'Опасные инструменты',
      description:
        'Блокировать инструменты, запускающие произвольный код/команды (system/exec/shell и подобные).'
    },
    dataLeakage: {
      enabled: false,
      label: 'Защита от утечки данных',
      description:
        'Дополнительные проверки на возможную утечку конфиденциальных данных из контекста и памяти.'
    }
  },
  customPatterns: {
    promptInjection: [],
    insecureOutput: [],
    toolInputDangerous: []
  }
};

function getDemoMetricsSnapshot() {
  const averageDurationMs = demoState.totalRuns > 0
    ? Math.round(demoState.totalDurationMs / demoState.totalRuns)
    : 0;
  const averageCostUsd = demoState.totalRuns > 0
    ? Number((demoState.totalCostUsd / demoState.totalRuns).toFixed(4))
    : 0;
  const successRatePct = demoState.totalRuns > 0
    ? Math.round((demoState.successfulRuns / demoState.totalRuns) * 100)
    : 0;

  return {
    totalRuns: demoState.totalRuns,
    successfulRuns: demoState.successfulRuns,
    successRatePct,
    averageDurationMs,
    averageCostUsd,
    lastRun: demoState.lastRun
  };
}

function runDemoScenario() {
  const startedAt = new Date();
  const ttfrMs = 430;
  const durationMs = 2500;
  const estimatedCostUsd = 0.0142;
  const finishedAt = new Date(startedAt.getTime() + durationMs);

  demoState.totalRuns += 1;
  demoState.successfulRuns += 1;
  demoState.totalDurationMs += durationMs;
  demoState.totalCostUsd += estimatedCostUsd;

  const successRatePct = Math.round((demoState.successfulRuns / demoState.totalRuns) * 100);

  const result = {
    executionId: 'demo-exec-' + Date.now(),
    status: 'passed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    stepResults: [
      { step: 'Получение входящего сообщения', action: 'Система принимает prefilled-данные из тестового payload.', expected: 'Сценарий стартует без ручного ввода.', status: 'passed' },
      { step: 'Проверка заказа', action: 'Имитация запроса статуса заказа ord-7781.', expected: 'Найден статус: «Передан в доставку, ETA: завтра до 18:00».', status: 'passed' },
      { step: 'Формирование ответа клиенту', action: 'Агент формирует итоговое сообщение для клиента.', expected: 'Возвращается готовый ответ и рекомендации по следующему шагу.', status: 'passed' }
    ],
    metrics: {
      durationMs,
      estimatedCostUsd,
      successRatePct,
      ttfrMs
    },
    guardrail: {
      status: 'passed',
      checks: [
        'PII redaction: sensitive fields masked before response',
        'Policy compliance: customer-facing response uses allowed template',
        'Low-confidence escalation: fallback path verified'
      ],
      notes: 'Guardrails completed without violations.'
    },
    summary: 'Обращение обработано: статус заказа подтвержден, клиент получил объяснимый ответ и ETA.'
  };

  demoState.lastRun = result;
  return result;
}

function getDemoExportPayload() {
  return {
    generatedAt: new Date().toISOString(),
    scenario: demoScenario,
    metrics: getDemoMetricsSnapshot(),
    latestRun: demoState.lastRun
  };
}

function renderDemoPdfLite(payload) {
  const run = payload.latestRun;
  const metrics = payload.metrics;
  const guardrailChecks = run.guardrail.checks.map(check => `- ${check}`).join('\n');
  const steps = run.stepResults
    .map((step, index) => `${index + 1}. **${step.step}** — ${step.expected}`)
    .join('\n');

  return [
    '# Demo Run Report (PDF-lite)',
    '',
    `Generated at: ${payload.generatedAt}`,
    `Execution ID: ${run.executionId}`,
    `Scenario: ${payload.scenario.name} (${payload.scenario.id})`,
    '',
    '## KPI',
    `- Success rate: ${metrics.successRatePct}%`,
    `- Average duration: ${metrics.averageDurationMs} ms`,
    `- Average cost: $${metrics.averageCostUsd}`,
    `- Last run TTFR: ${run.metrics.ttfrMs} ms`,
    '',
    '## Guardrails',
    guardrailChecks,
    '',
    '## Scenario steps',
    steps,
    '',
    '## Summary',
    run.summary,
    ''
  ].join('\n');
}

// Проверка существования файлов
function checkFile(filePath) {
  try {
    return fs.existsSync(path.join(__dirname, filePath));
  } catch {
    return false;
  }
}

const components = [
  { name: 'Scenario Spec', file: 'src/spec/scenario-spec.ts', status: checkFile('src/spec/scenario-spec.ts') ? 'ok' : 'error' },
  { name: 'Scenario Builder', file: 'src/builder/scenario-builder.ts', status: checkFile('src/builder/scenario-builder.ts') ? 'ok' : 'error' },
  { name: 'Tool Registry', file: 'src/registry/tool-registry.ts', status: checkFile('src/registry/tool-registry.ts') ? 'ok' : 'error' },
  { name: 'Tool Gateway', file: 'src/gateway/tool-gateway.ts', status: checkFile('src/gateway/tool-gateway.ts') ? 'ok' : 'error' },
  { name: 'Runtime Orchestrator', file: 'src/runtime/orchestrator.ts', status: checkFile('src/runtime/orchestrator.ts') ? 'ok' : 'error' }
];

const testFiles = [
  { name: 'scenario-spec', file: 'tests/scenario-spec.test.ts', status: checkFile('tests/scenario-spec.test.ts') ? 'ready' : 'missing' },
  { name: 'scenario-builder', file: 'tests/scenario-builder.test.ts', status: checkFile('tests/scenario-builder.test.ts') ? 'ready' : 'missing' },
  { name: 'tool-registry', file: 'tests/tool-registry.test.ts', status: checkFile('tests/tool-registry.test.ts') ? 'ready' : 'missing' },
  { name: 'tool-gateway', file: 'tests/tool-gateway.test.ts', status: checkFile('tests/tool-gateway.test.ts') ? 'ready' : 'missing' }
];

const okCount = components.filter(c => c.status === 'ok').length;
const totalCount = components.length;

function getHealthPayload() {
  return {
    status: 'ok',
    service: 'scenario-builder-server',
    uptimeSec: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString()
  };
}

function getReadinessPayload() {
  return {
    ...getHealthPayload(),
    checks: {
      staticAssetsAccessible: fs.existsSync(path.join(__dirname, 'admin-dashboard.html')),
      apiStatusEndpointAvailable: true,
      guardrailsConfigAvailable: true
    }
  };
}

const HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Конструктор сценариев - Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .summary {
            background: rgba(255,255,255,0.2);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            color: white;
            text-align: center;
            font-size: 1.2em;
        }
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .card h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.5em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .status {
            display: inline-block;
            padding: 8px 15px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9em;
            margin-top: 10px;
        }
        .status.ok { background: #10b981; color: white; }
        .status.error { background: #ef4444; color: white; }
        .status.ready { background: #3b82f6; color: white; }
        .status.missing { background: #9ca3af; color: white; }
        .info { margin: 10px 0; color: #666; font-size: 0.9em; }
        code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        ul { list-style: none; margin-top: 15px; }
        li {
            padding: 8px;
            margin: 5px 0;
            background: #f3f4f6;
            border-radius: 6px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Конструктор автономных сценариев</h1>
        
        <div class="summary">
            <strong>Статус системы:</strong>
            <span style="margin: 0 20px;">Всего: ${totalCount}</span>
            <span style="margin: 0 20px; color: #10b981;">✓ Работает: ${okCount}</span>
            <span style="margin: 0 20px; color: #ef4444;">✗ Ошибки: ${totalCount - okCount}</span>
        </div>
        
        <div class="dashboard" id="dashboard"></div>
        
        <button onclick="location.reload()" style="display: block; width: 100%; padding: 15px; background: #667eea; color: white; border: none; border-radius: 8px; font-size: 1.1em; font-weight: bold; cursor: pointer; margin-top: 20px;">🔄 Обновить данные</button>
    </div>
    
    <script>
        const components = ${JSON.stringify(components)};
        const tests = ${JSON.stringify(testFiles)};
        
        function render() {
            const dashboard = document.getElementById('dashboard');
            dashboard.innerHTML = '';
            
            components.forEach(comp => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = '<h2>' + comp.name + '</h2><div class="info">Файл: <code>' + comp.file + '</code></div><span class="status ' + comp.status + '">' + (comp.status === 'ok' ? '✓ Работает' : '✗ Ошибка') + '</span>';
                dashboard.appendChild(card);
            });
            
            const testCard = document.createElement('div');
            testCard.className = 'card';
            const ready = tests.filter(t => t.status === 'ready').length;
            testCard.innerHTML = '<h2>Тесты</h2><div class="info">Готово: ' + ready + ' из ' + tests.length + '</div><ul>' + tests.map(t => '<li><span class="status ' + t.status + '">' + (t.status === 'ready' ? '✓' : '○') + '</span> <strong>' + t.name + '</strong></li>').join('') + '</ul>';
            dashboard.appendChild(testCard);
        }
        
        render();
    </script>
</body>
</html>`;

// Импорт модулей для Agent Runtime (динамический импорт)
let agentRuntimeModule = null;
let ollamaProviderModule = null;

async function loadAgentModules() {
  try {
    // Динамический импорт ES модулей
    agentRuntimeModule = await import('./src/agent/agent-runtime.js');
    ollamaProviderModule = await import('./src/agent/llm-providers/ollama-provider.js');
    return true;
  } catch (error) {
    console.error('Failed to load agent modules:', error);
    return false;
  }
}

// Проверка Ollama
function checkOllama() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get('http://localhost:11434/api/tags', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;

  // API v1 prefix normalization: /api/v1/foo -> /api/foo internally
  if (pathname.startsWith('/api/v1/')) {
    pathname = '/api/' + pathname.slice(8);
  } else if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/')) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Mon, 01 Mar 2027 00:00:00 GMT');
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // --- Public API routes (no auth required) ---
  if (pathname === '/api/docs') {
    const swaggerHtml = `<!DOCTYPE html>
<html><head><title>Scenario Builder API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });</script>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(swaggerHtml);
    return;
  }

  if (pathname === '/api/openapi.json') {
    try {
      const specPath = path.join(__dirname, 'docs', 'api', 'openapi.json');
      const spec = fs.readFileSync(specPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(spec);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OpenAPI spec not found' }));
    }
    return;
  }

  // --- Auth middleware for /api/* routes ---
  const authExemptPaths = ['/api/status', '/api/health', '/api/metrics', '/metrics', '/api/docs', '/api/openapi.json'];
  if (pathname.startsWith('/api/') && !authExemptPaths.includes(pathname)) {
    const auth = await resolveAuth(req);
    if (!auth.ok) {
      // Fire-and-forget auth failure audit
      (async () => {
        try {
          const p = await getPrisma();
          await p.auditLog.create({
            data: {
              action: 'auth_failure',
              actor: 'anonymous',
              outcome: 'failure',
              severity: 'warning',
              message: auth.error || null,
              tenantId: null,
              orgId: null,
            },
          });
        } catch {}
      })();
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: auth.error }));
      return;
    }
    req.auth = auth.identity;

    // Fire-and-forget auth success audit
    (async () => {
      try {
        const p = await getPrisma();
        await p.auditLog.create({
          data: {
            action: 'auth_success',
            actor: auth.identity?.keyId || (auth.identity?.method === 'admin_password' ? 'admin' : 'anonymous'),
            outcome: 'success',
            severity: 'info',
            message: null,
            tenantId: auth.identity?.tenantId || null,
            orgId: auth.identity?.orgId || null,
          },
        });
      } catch {}
    })();
  }

  // Отладка: логируем запросы к admin-страницам
  if (pathname.startsWith('/admin')) {
    console.log('[DEBUG] Admin request:', pathname);
  }

  // Главная страница: видимая точка входа в админку
  if (pathname === '/' || pathname === '/index.html') {
    const entryHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scenario Builder</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #fff;
    }
    h1 { font-size: 1.75rem; margin-bottom: 8px; font-weight: 600; }
    p { color: rgba(255,255,255,0.85); margin-bottom: 32px; font-size: 1rem; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    .btn-admin {
      display: inline-block;
      padding: 16px 32px;
      background: #3b82f6;
      color: white;
      text-decoration: none;
      font-weight: 600;
      font-size: 1.1rem;
      border-radius: 12px;
      box-shadow: 0 4px 14px rgba(59,130,246,0.4);
      transition: background .2s, transform .1s;
    }
    .btn-admin:hover { background: #2563eb; transform: translateY(-1px); }
    .btn-demo { background: #0ea5e9; box-shadow: 0 4px 14px rgba(14,165,233,0.45); }
    .btn-demo:hover { background: #0284c7; }
  </style>
</head>
<body>
  <h1>Конструктор сценариев</h1>
  <p>Платформа автономных сценариев и агентных процессов</p>
  <div class="actions">
    <a href="/admin-dashboard.html" class="btn-admin">Админский интерфейс</a>
    <a href="/demo-e2e.html" class="btn-admin btn-demo">Демо сквозного теста</a>
    <a href="/about-trust.html" class="btn-admin" style="background:#0ea5e9;color:#082f49;">About / Trust</a>
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(entryHtml);
    return;
  }

  // /admin и /admin/ — редирект в дашборд
  if (pathname === '/admin' || pathname === '/admin/') {
    res.writeHead(302, { Location: '/admin-dashboard.html' });
    res.end();
    return;
  }

  if (pathname === '/legacy-dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (pathname.startsWith('/admin-') && pathname.endsWith('.html')) {
    // Отдача админ-страниц (сначала из web/admin/, затем из корня)
    try {
      const fileName = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      let adminPagePath = path.join(__dirname, 'web', 'admin', fileName);
      
      // Если файл не найден в web/admin/, ищем в корне
      if (!fs.existsSync(adminPagePath)) {
        adminPagePath = path.join(__dirname, fileName);
      }
      
      if (fs.existsSync(adminPagePath)) {
        const adminPage = fs.readFileSync(adminPagePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(adminPage);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Admin page not found: ' + pathname + ' (tried: ' + adminPagePath + ')');
      }
    } catch (error) {
      console.error('[DEBUG] Error loading admin page:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading admin page: ' + error.message);
    }
  } else if (pathname === '/test-agent.html' || pathname === '/test-agent') {
    // Отдача тестовой страницы (сначала из web/test/, затем из корня)
    try {
      let testPagePath = path.join(__dirname, 'web', 'test', 'test-agent.html');
      if (!fs.existsSync(testPagePath)) {
        testPagePath = path.join(__dirname, 'test-agent.html');
      }
      if (fs.existsSync(testPagePath)) {
        const testPage = fs.readFileSync(testPagePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testPage);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Test page not found: ' + testPagePath);
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading test page: ' + error.message);
    }
  } else if (pathname === '/test-orchestrator.html' || pathname === '/test-orchestrator') {
    // Отдача страницы тестирования Orchestrator (сначала из web/test/, затем из корня)
    try {
      let testPagePath = path.join(__dirname, 'web', 'test', 'test-orchestrator.html');
      if (!fs.existsSync(testPagePath)) {
        testPagePath = path.join(__dirname, 'test-orchestrator.html');
      }
      if (fs.existsSync(testPagePath)) {
        const testPage = fs.readFileSync(testPagePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testPage);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Test orchestrator page not found: ' + testPagePath);
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading test orchestrator page: ' + error.message);
    }
  } else if (pathname === '/test-event-bus.html' || pathname === '/test-event-bus') {
    // Отдача страницы тестирования Event Bus (сначала из web/test/, затем из корня)
    try {
      let testPagePath = path.join(__dirname, 'web', 'test', 'test-event-bus.html');
      if (!fs.existsSync(testPagePath)) {
        testPagePath = path.join(__dirname, 'test-event-bus.html');
      }
      if (fs.existsSync(testPagePath)) {
        const testPage = fs.readFileSync(testPagePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(testPage);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Test event bus page not found');
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading test event bus page: ' + error.message);
    }
  } else if (pathname === '/admin-styles.css' || pathname === '/admin-common.js' || pathname === '/admin-common-rbac.js') {
    // Отдача общих ресурсов админ-панели (сначала из web/admin/, затем из корня)
    try {
      const fileName = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      let resourcePath = path.join(__dirname, 'web', 'admin', fileName);
      
      // Если файл не найден в web/admin/, ищем в корне
      if (!fs.existsSync(resourcePath)) {
        resourcePath = path.join(__dirname, fileName);
      }
      
      if (fs.existsSync(resourcePath)) {
        const content = fs.readFileSync(resourcePath, 'utf-8');
        const contentType = pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
        res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
        res.end(content);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Resource not found: ' + pathname);
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading resource: ' + error.message);
    }
  } else if (pathname === '/docs/contracts/WEBHOOK_DELIVERY.md') {
    try {
      const contractPath = path.join(__dirname, 'docs', 'contracts', 'WEBHOOK_DELIVERY.md');
      if (fs.existsSync(contractPath)) {
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(fs.readFileSync(contractPath, 'utf-8'));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Contract file not found');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err.message || err));
    }
  } else if (pathname === '/observability-dashboard.html' || pathname === '/observability') {
    // Отдача observability dashboard (сначала из web/, затем из корня)
    try {
      let dashboardPath = path.join(__dirname, 'web', 'observability-dashboard.html');
      if (!fs.existsSync(dashboardPath)) {
        dashboardPath = path.join(__dirname, 'observability-dashboard.html');
      }
      if (fs.existsSync(dashboardPath)) {
        const dashboard = fs.readFileSync(dashboardPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboard);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Observability dashboard not found');
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading observability dashboard: ' + error.message);
    }
  } else if (pathname === '/dashboard.html' || pathname === '/dashboard') {
    // Отдача dashboard (сначала из web/, затем из корня)
    try {
      let dashboardPath = path.join(__dirname, 'web', 'dashboard.html');
      if (!fs.existsSync(dashboardPath)) {
        dashboardPath = path.join(__dirname, 'dashboard.html');
      }
      if (fs.existsSync(dashboardPath)) {
        const dashboard = fs.readFileSync(dashboardPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(dashboard);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Dashboard not found: ' + dashboardPath);
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading dashboard: ' + error.message);
    }
  } else if (pathname === '/demo-e2e.html' || pathname === '/demo-e2e') {
    try {
      const demoPath = path.join(__dirname, 'demo-e2e.html');
      if (fs.existsSync(demoPath)) {
        const html = fs.readFileSync(demoPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('demo-e2e.html not found');
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading demo-e2e: ' + error.message);
    }
  } else if (pathname === '/about-trust.html' || pathname === '/about-trust') {
    try {
      const aboutPath = path.join(__dirname, 'about-trust.html');
      if (fs.existsSync(aboutPath)) {
        const html = fs.readFileSync(aboutPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('about-trust.html not found');
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading about-trust: ' + error.message);
    }
  } else if (pathname === '/api/demo-e2e') {
    const instructions = [
      'Откройте страницу /demo-e2e.html.',
      'Нажмите кнопку «1. Проверить предзаполненные данные», чтобы убедиться что тестовый сценарий загружен.',
      'Нажмите кнопку «2. Запустить сквозной тест», чтобы выполнить весь сценарий целиком.',
      'Сверьте шаги и ожидаемый результат в блоке «Результат выполнения» — все шаги должны быть со статусом PASSED.'
    ];
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      scenario: demoScenario,
      instructions,
      presentationMode: {
        oneClickAction: 'POST /api/demo-e2e/presentation-run',
        resetAction: 'POST /api/demo-e2e/reset',
        exportAction: 'GET /api/demo-e2e/export?format=json|pdf-lite'
      }
    }));
  } else if (pathname === '/api/demo-e2e/run') {
    const result = runDemoScenario();
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, result }));
  } else if (pathname === '/api/demo-e2e/presentation-run' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      mode: 'presentation',
      seedApplied: true,
      result: runDemoScenario()
    }));
  } else if (pathname === '/api/demo-e2e/metrics') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, metrics: getDemoMetricsSnapshot() }));
  } else if (pathname === '/api/about-trust') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      trust: {
        health: {
          liveness: getHealthPayload(),
          readiness: getReadinessPayload()
        },
        guardrails: {
          status: demoState.lastRun?.guardrail.status ?? 'passed',
          checks: demoState.lastRun?.guardrail.checks ?? [
            'PII redaction: sensitive fields masked before response',
            'Policy compliance: customer-facing response uses allowed template',
            'Low-confidence escalation: fallback path verified'
          ]
        },
        auditTrail: {
          generatedAt: new Date().toISOString(),
          lastExecutionId: demoState.lastRun?.executionId ?? null,
          traceHint: '/api/demo-e2e/export?format=json'
        },
        observability: getDemoMetricsSnapshot()
      }
    }));
  } else if (pathname === '/api/demo-e2e/reset' && req.method === 'POST') {
    demoState.totalRuns = 0;
    demoState.successfulRuns = 0;
    demoState.totalDurationMs = 0;
    demoState.totalCostUsd = 0;
    demoState.lastRun = null;

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, state: getDemoMetricsSnapshot(), message: 'Demo state reset completed' }));
  } else if (pathname === '/api/demo-e2e/export') {
    if (!demoState.lastRun) {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(409);
      res.end(JSON.stringify({
        success: false,
        error: 'NO_DEMO_RUN',
        message: 'Run demo scenario before exporting report.'
      }));
      return;
    }

    const format = url.searchParams.get('format') || 'json';
    if (format === 'pdf-lite') {
      const payload = getDemoExportPayload();
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="demo-run-${payload.latestRun.executionId}.md"`);
      res.writeHead(200);
      res.end(renderDemoPdfLite(payload));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="demo-run-${demoState.lastRun.executionId}.json"`);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, report: getDemoExportPayload() }, null, 2));
  } else if (pathname === '/api/metrics' || pathname === '/metrics') {
    // Endpoint для метрик Prometheus
    // Сначала пробуем получить метрики с порта 9464 (если PrometheusExporter запущен)
    const http = require('http');
    
    const metricsOptions = {
      hostname: 'localhost',
      port: 9464,
      path: '/metrics',
      method: 'GET',
      timeout: 1000
    };
    
    const metricsReq = http.request(metricsOptions, (metricsRes) => {
      let data = '';
      metricsRes.on('data', (chunk) => {
        data += chunk.toString();
      });
      metricsRes.on('end', () => {
        // Добавляем наши метрики из store
        const serverMetrics = `
# Server metrics (from metrics store)
scenario_executions_total ${metricsStore.scenario_executions_total}
scenario_success_total ${metricsStore.scenario_success_total}
scenario_failures_total ${metricsStore.scenario_failures_total}
agent_tool_calls_total ${metricsStore.agent_tool_calls_total}
agent_tokens_used_total ${metricsStore.agent_tokens_used_total}
agent_llm_calls_total ${metricsStore.agent_llm_calls_total}
`;
        res.writeHead(200, { 
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data + serverMetrics);
      });
    });
    
    metricsReq.on('error', (error) => {
      // Если PrometheusExporter не запущен, возвращаем метрики из store
      const serverMetrics = `# Prometheus metrics (from server store)
# PrometheusExporter not running, using server metrics store
scenario_executions_total ${metricsStore.scenario_executions_total}
scenario_success_total ${metricsStore.scenario_success_total}
scenario_failures_total ${metricsStore.scenario_failures_total}
agent_tool_calls_total ${metricsStore.agent_tool_calls_total}
agent_tokens_used_total ${metricsStore.agent_tokens_used_total}
agent_llm_calls_total ${metricsStore.agent_llm_calls_total}
# Last update: ${metricsStore.lastUpdate || 'never'}
`;
      res.writeHead(200, { 
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(serverMetrics);
    });
    
    metricsReq.on('timeout', () => {
      metricsReq.destroy();
      // Возвращаем метрики из store при timeout
      const serverMetrics = `# Prometheus metrics (from server store)
scenario_executions_total ${metricsStore.scenario_executions_total}
scenario_success_total ${metricsStore.scenario_success_total}
scenario_failures_total ${metricsStore.scenario_failures_total}
agent_tool_calls_total ${metricsStore.agent_tool_calls_total}
agent_tokens_used_total ${metricsStore.agent_tokens_used_total}
agent_llm_calls_total ${metricsStore.agent_llm_calls_total}
`;
      res.writeHead(200, { 
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(serverMetrics);
    });
    
    metricsReq.end();
  } else if (pathname === '/api/orchestrator/execute' && req.method === 'POST') {
    if (!requireScope(req, res, 'executions:write')) return;
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const tt = await trustedTenantOrRespond(req, res, parsed.tenantId ?? parsed._tenantId);
        if (!tt) return;
        const requestData = {
          ...parsed,
          _tenantId: tt.tenantId,
          _orgId: tt.orgId ?? req.auth?.orgId ?? null,
        };
        const { scenarioId, userIntent, workflowType = 'agent-only' } = requestData;
        
        if (!scenarioId || !userIntent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'scenarioId and userIntent are required' }
          }));
          return;
        }

        try {
          const prisma = await getPrisma();
          const qTenantId = requestData._tenantId || 'default';
          const q = await checkQuotaBlockedServer(prisma, qTenantId, 'executions');
          if (q.blocked) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'X-Quota-Remaining': '0' });
            res.end(JSON.stringify({ error: 'Quota exceeded', metric: 'executions', limit: q.limit, current: q.current }));
            return;
          }
        } catch (_e) { /* quota check is best-effort */ }
        
        // Выполняем через tsx
        const tempRequestFile = path.join(__dirname, 'temp-orchestrator-request.json');
        fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
        
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'execute-orchestrator.ts');
        
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout, stderr } = await execAsync(
          `${tsxCmd} "${scriptPath}" "${tempRequestFile}"`,
          { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 }
        );
        
        // Удаляем временный файл
        try {
          fs.unlinkSync(tempRequestFile);
        } catch (e) {
          // Игнорируем ошибки удаления
        }
        
        // Парсим результат
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('No output from script');
        }
        
        const jsonLine = lines[lines.length - 1];
        let result;
        try {
          result = JSON.parse(jsonLine);
        } catch (parseError) {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(`Failed to parse JSON from output. Last line: ${jsonLine.substring(0, 100)}`);
          }
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Error in /api/orchestrator/execute:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: error.message || 'Unknown error'
          }
        }));
      }
    });
  } else if (pathname.startsWith('/api/event-bus/')) {
    if (!requireScope(req, res, 'config:write')) return;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const endpoint = pathname.split('/api/event-bus/')[1];
        let command = '';
        let requestData = {};
        
        if (req.method === 'GET') {
          const url = new URL(req.url, `http://${req.headers.host}`);
          if (endpoint === 'status') {
            requestData = { brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',') };
            command = 'status';
          } else if (endpoint === 'events') {
            const limit = parseInt(url.searchParams.get('limit') || '100', 10);
            // Возвращаем события напрямую из глобального хранилища
            const eventsToReturn = eventBusEvents.slice(0, limit);
            console.log(`[EventBus] Returning ${eventsToReturn.length} events (total in buffer: ${eventBusEvents.length})`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ events: eventsToReturn }));
            return; // Не выполняем через tsx, возвращаем сразу
          }
        } else if (req.method === 'POST') {
          requestData = body ? JSON.parse(body) : {};
          
          if (endpoint === 'connect') {
            command = 'connect';
          } else if (endpoint === 'disconnect') {
            command = 'disconnect';
          } else if (endpoint === 'subscribe') {
            command = 'subscribe';
          } else if (endpoint === 'unsubscribe') {
            command = 'unsubscribe';
          } else if (endpoint === 'publish') {
            // Публикация события - сохраняем в глобальное хранилище сразу
            const { type, topic, payload } = requestData;
            const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const correlationId = payload.executionId || eventId;
            
            const event = {
              type: type,
              payload: payload,
              metadata: {
                eventId: eventId,
                correlationId: correlationId,
                timestamp: new Date().toISOString(),
                source: 'scenario-builder-web',
                version: '1.0.0'
              }
            };
            
            // Сохраняем в глобальное хранилище
            eventBusEvents.unshift(event);
            if (eventBusEvents.length > MAX_EVENT_BUFFER_SIZE) {
              eventBusEvents.pop();
            }
            
            console.log(`[EventBus] Event published to buffer: ${type} (eventId: ${eventId}, total: ${eventBusEvents.length})`);
            
            // Возвращаем успех сразу (событие уже в буфере)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return; // Не выполняем через tsx, возвращаем сразу
          }
        }
        
        // Для команд, которые требуют выполнения через tsx
        if (command && command !== 'events' && command !== 'publish') {
          // Создаем временный файл с запросом
          const tempRequestFile = path.join(__dirname, `temp-event-bus-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
          
          // Выполняем через tsx
          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'event-bus-api.ts');
          
          const { stdout, stderr } = await execAsync(
            `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
            { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 10000 }
          );
          
          // Удаляем временный файл
          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) {
            // Игнорируем ошибки удаления
          }
          
          // Парсим результат
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          const jsonLine = lines[lines.length - 1];
          const result = JSON.parse(jsonLine);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        }
      } catch (error) {
        console.error(`Error in /api/event-bus/${pathname.split('/api/event-bus/')[1]}:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'EVENT_BUS_ERROR',
            message: error.message || 'Unknown error'
          }
        }));
      }
    });
  } else if (pathname.startsWith('/api/queue-processor')) {
    if (!requireScope(req, res, 'queues:write')) return;
    console.log('[DEBUG] Queue Processor API request:', req.method, pathname);
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const pathParts = pathname.split('/').filter(p => p);
    let command = '';
    
    if (pathParts.length === 3) {
      // POST /api/queue-processor/start
      // POST /api/queue-processor/stop
      // GET /api/queue-processor/status
      // POST /api/queue-processor/refresh
      command = pathParts[2];
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: { code: 'INVALID_PATH', message: 'Invalid path' }
      }));
      return;
    }
    
    if (req.method === 'GET' && command === 'status') {
      // GET /api/queue-processor/status
      (async () => {
        try {
          const tempRequestFile = path.join(__dirname, `temp-processor-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify({}), 'utf-8');
          
          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'queue-processor-api.ts');
          
          const { stdout, stderr } = await execAsync(
            `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
            { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 }
          );
          
          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) {}
          
          // Парсим результат (фильтруем PowerShell логи)
          const lines = stdout.trim().split('\n').filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   !trimmed.startsWith('[LOG]') && 
                   !trimmed.startsWith('[WARN]') && 
                   !trimmed.startsWith('[ERROR]') &&
                   !trimmed.includes('prisma:query') &&
                   !trimmed.includes('node.exe') &&
                   !trimmed.includes('At line:') &&
                   !trimmed.includes('CategoryInfo:') &&
                   !trimmed.includes('RemoteException') &&
                   !trimmed.includes('NativeCommandError') &&
                   !trimmed.startsWith('[path]') &&
                   !trimmed.includes('tsx.cmd');
          });
          
          let jsonResult = null;
          
          // Ищем JSON с начала
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              try {
                jsonResult = JSON.parse(line);
                if (jsonResult.success !== undefined) {
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
          
          // Если не нашли с начала, пробуем собрать многострочный JSON
          if (!jsonResult) {
            const jsonLines = lines.filter(l => l.trim().startsWith('{') || l.trim().startsWith('}') || l.trim().includes(':'));
            if (jsonLines.length > 0) {
              try {
                const jsonStr = jsonLines.join('\n');
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                  jsonResult = JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
                }
              } catch (e) {
                // Игнорируем ошибки парсинга
              }
            }
          }
          
          if (!jsonResult) {
            throw new Error(`No valid JSON response from queue-processor-api.ts. Output: ${stdout.substring(0, 500)}`);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jsonResult));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: error.message || 'Unknown error'
            }
          }));
        }
      })();
    } else if (req.method === 'POST' && ['start', 'stop', 'refresh'].includes(command)) {
      // POST /api/queue-processor/start
      // POST /api/queue-processor/stop
      // POST /api/queue-processor/refresh
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const requestData = body ? JSON.parse(body) : {};
          const tempRequestFile = path.join(__dirname, `temp-processor-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
          
          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'queue-processor-api.ts');
          
          const { stdout, stderr } = await execAsync(
            `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
            { cwd: __dirname, maxBuffer: 10 * 1024 * 1024 }
          );
          
          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) {}
          
          // Парсим результат (фильтруем PowerShell логи)
          const lines = stdout.trim().split('\n').filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   !trimmed.startsWith('[LOG]') && 
                   !trimmed.startsWith('[WARN]') && 
                   !trimmed.startsWith('[ERROR]') &&
                   !trimmed.includes('prisma:query') &&
                   !trimmed.includes('node.exe') &&
                   !trimmed.includes('At line:') &&
                   !trimmed.includes('CategoryInfo:') &&
                   !trimmed.includes('RemoteException') &&
                   !trimmed.includes('NativeCommandError') &&
                   !trimmed.startsWith('[path]') &&
                   !trimmed.includes('tsx.cmd');
          });
          
          let jsonResult = null;
          
          // Ищем JSON с начала
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              try {
                jsonResult = JSON.parse(line);
                if (jsonResult.success !== undefined) {
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
          
          // Если не нашли с начала, пробуем собрать многострочный JSON
          if (!jsonResult) {
            const jsonLines = lines.filter(l => l.trim().startsWith('{') || l.trim().startsWith('}') || l.trim().includes(':'));
            if (jsonLines.length > 0) {
              try {
                const jsonStr = jsonLines.join('\n');
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                  jsonResult = JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
                }
              } catch (e) {
                // Игнорируем ошибки парсинга
              }
            }
          }
          
          if (!jsonResult) {
            throw new Error(`No valid JSON response from queue-processor-api.ts. Output: ${stdout.substring(0, 500)}`);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jsonResult));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: error.message || 'Unknown error'
            }
          }));
        }
      });
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      }));
    }
  } else if (pathname.startsWith('/api/eval')) {
    if (!requireScope(req, res, 'executions:write')) return;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Обработка GET запросов сразу (без body)
    if (req.method === 'GET') {
      (async () => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathParts = pathname.split('/').filter(p => p);
          let command = '';
          let requestData = {};

          if (pathParts.length === 4 && pathParts[2] === 'cases') {
            // GET /api/eval/cases/:id
            command = 'get-case';
            requestData = { caseId: pathParts[3] };
          } else if (pathParts.length === 3 && pathParts[2] === 'search') {
            // GET /api/eval/search
            command = 'search-cases';
            requestData = {
              category: url.searchParams.get('category') || undefined,
              severity: url.searchParams.get('severity') || undefined,
              tags: url.searchParams.get('tags') ? url.searchParams.get('tags').split(',') : undefined,
              name: url.searchParams.get('name') || undefined,
            };
          } else if (pathParts.length === 3 && pathParts[2] === 'cases') {
            // GET /api/eval/cases
            command = 'list-cases';
            requestData = {};
          } else {
            // GET /api/eval (fallback to list)
            command = 'list-cases';
            requestData = {};
          }

          const tempRequestFile = path.join(__dirname, `temp-eval-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');

          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'eval-api.ts');

          const { stdout, stderr } = await execAsync(
            `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
            { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
          );

          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) { }

          const lines = stdout.trim().split('\n').filter(line => line.trim());
          let jsonResult = null;
          for (const line of lines) {
            if (line.trim().startsWith('{') || line.trim().startsWith('[')) {
              try {
                jsonResult = JSON.parse(line);
                if (jsonResult.success !== undefined || Array.isArray(jsonResult)) {
                  break;
                }
              } catch (e) {
                // Not valid JSON
              }
            }
          }

          if (!jsonResult) {
            throw new Error('No valid JSON response from eval-api.ts');
          }

          const statusCode = jsonResult.success ? 200 : (jsonResult.error?.code === 'NOT_FOUND' ? 404 : 400);

          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jsonResult));
        } catch (error) {
          console.error('[Eval API] Error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message }
          }));
        }
      })();
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const pathParts = pathname.split('/').filter(p => p);
          let command = '';
          let requestData = {};

          if (pathParts.length === 4 && pathParts[2] === 'cases' && pathParts[3] === 'run') {
            // POST /api/eval/cases/run
            command = 'run-case';
            requestData = JSON.parse(body);
          } else if (pathParts.length === 3 && pathParts[2] === 'suite') {
            // POST /api/eval/suite
            command = 'run-suite';
            requestData = JSON.parse(body);
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: { code: 'INVALID_PATH', message: 'Invalid path for POST /api/eval' }
            }));
            return;
          }

          const tempRequestFile = path.join(__dirname, `temp-eval-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');

          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'eval-api.ts');

          const { stdout, stderr } = await execAsync(
            `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
            { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
          );

          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) { }

          const lines = stdout.trim().split('\n').filter(line => line.trim());
          let jsonResult = null;
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              try {
                jsonResult = JSON.parse(line);
                if (jsonResult.success !== undefined) {
                  break;
                }
              } catch (e) {
                // Not valid JSON
              }
            }
          }

          if (!jsonResult) {
            throw new Error('No valid JSON response from eval-api.ts');
          }

          const statusCode = jsonResult.success ? 200 : (jsonResult.error?.code === 'NOT_FOUND' ? 404 : 400);

          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jsonResult));
        } catch (error) {
          console.error('[Eval API] Error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message }
          }));
        }
      });
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
      }));
    }
  } else if (pathname.startsWith('/api/templates')) {
    const tplScope = (req.method === 'GET') ? 'templates:read' : 'templates:write';
    if (!requireScope(req, res, tplScope)) return;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const pathParts = pathname.split('/').filter(p => p);
        let command = '';
        let requestData = {};
        
        if (req.method === 'GET') {
          if (pathParts.length === 4 && pathParts[3] === 'apply') {
            // GET /api/templates/:id/apply?param1=value1&param2=value2
            command = 'apply-template';
            const url = new URL(req.url, `http://${req.headers.host}`);
            const params = {};
            url.searchParams.forEach((value, key) => {
              params[key] = value;
            });
            requestData = {
              templateId: pathParts[2],
              parameters: params
            };
          } else if (pathParts.length === 3 && pathParts[2] === 'search') {
            // GET /api/templates/search?category=pattern&tags=approval
            command = 'search-templates';
            const url = new URL(req.url, `http://${req.headers.host}`);
            requestData = {
              category: url.searchParams.get('category') || undefined,
              tags: url.searchParams.get('tags') ? url.searchParams.get('tags').split(',') : undefined,
              name: url.searchParams.get('name') || undefined
            };
          } else if (pathParts.length === 3) {
            // GET /api/templates/:id
            command = 'get-template';
            requestData = { templateId: pathParts[2] };
          } else {
            // GET /api/templates
            command = 'list-templates';
            requestData = {};
          }
        } else if (req.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'apply') {
          // POST /api/templates/:id/apply
          command = 'apply-template';
          const bodyData = body ? JSON.parse(body) : {};
          requestData = {
            templateId: pathParts[2],
            parameters: bodyData.parameters || {},
            overrides: bodyData.overrides || {}
          };
        } else if (req.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'instantiate') {
          // POST /api/templates/:id/instantiate
          command = 'instantiate';
          const bodyData = body ? JSON.parse(body) : {};
          requestData = {
            templateId: pathParts[2],
            name: bodyData.name || undefined,
            description: bodyData.description || undefined
          };
        }
        
        if (!command) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'Invalid endpoint' }
          }));
          return;
        }

        const tt = await trustedTenantOrRespond(req, res);
        if (!tt) return;
        requestData = { ...requestData, _tenantId: tt.tenantId };
        
        // Выполняем через tsx
        const tempRequestFile = path.join(__dirname, `temp-templates-${Date.now()}.json`);
        fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
        
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'templates-api.ts');
        
        const { stdout, stderr } = await execAsync(
          `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
          { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
        );
        
        // Удаляем временный файл
        try {
          if (fs.existsSync(tempRequestFile)) {
            fs.unlinkSync(tempRequestFile);
          }
        } catch (e) {
          // Игнорируем ошибки удаления
        }
        
        // Фильтруем PowerShell логи
        const filteredLines = stdout.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed && 
                 !trimmed.startsWith('PS ') && 
                 !trimmed.startsWith('>') &&
                 !trimmed.includes('tsx') &&
                 !trimmed.includes('node_modules');
        });
        
        // Ищем JSON в выводе
        let jsonLine = null;
        for (const line of filteredLines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              JSON.parse(trimmed);
              jsonLine = trimmed;
              break;
            } catch (e) {
              // Продолжаем поиск
            }
          }
        }
        
        if (!jsonLine) {
          const errorOutput = filteredLines.join('\n').substring(0, 500);
          throw new Error('No valid JSON response from templates-api.ts. Output: ' + errorOutput);
        }
        
        // Парсим JSON
        let result;
        try {
          result = JSON.parse(jsonLine);
        } catch (parseError) {
          throw new Error('Invalid JSON in response: ' + parseError.message);
        }
        
        const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Error in /api/templates:', error);
        const errorResponse = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message || 'Unknown error'
          }
        };
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
      }
    });
  } else if (pathname.startsWith('/api/queues')) {
    {
      const qScope = (req.method === 'GET') ? 'queues:read' : 'queues:write';
      if (!requireScope(req, res, qScope)) return;
    }
      console.log('[DEBUG] Queues API request:', req.method, pathname);
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Обработка GET запросов сразу (без body)
      if (req.method === 'GET') {
        (async () => {
          try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const pathParts = pathname.split('/').filter(p => p);
            let command = '';
            let requestData = {};
            
            if (pathParts.length === 4 && pathParts[3] === 'jobs') {
              // GET /api/queues/:id/jobs
              command = 'get-jobs';
              requestData = {
                queueId: pathParts[2],
                status: url.searchParams.get('status'),
                limit: url.searchParams.get('limit'),
                offset: url.searchParams.get('offset'),
              };
            } else if (pathParts.length === 4 && pathParts[3] === 'stats') {
              // GET /api/queues/:id/stats
              command = 'get-stats';
              requestData = { queueId: pathParts[2] };
            } else if (pathParts.length === 3) {
              // GET /api/queues/:id
              command = 'get';
              requestData = { id: pathParts[2] };
            } else {
              // GET /api/queues
              command = 'list';
              requestData = {
                status: url.searchParams.get('status'),
                limit: url.searchParams.get('limit'),
                offset: url.searchParams.get('offset'),
              };
            }

            const tt = await trustedTenantOrRespond(req, res);
            if (!tt) return;
            requestData._tenantId = tt.tenantId;
            
            // Выполняем через tsx
            const tempRequestFile = path.join(__dirname, `temp-queues-${Date.now()}.json`);
            fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
            
            const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
            const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
            const scriptPath = path.join(__dirname, 'src', 'web', 'queues-api.ts');
            
            console.log(`[Queues API] Executing: ${command} with data:`, JSON.stringify(requestData));
            
            let stdout, stderr;
            try {
              const execResult = await execAsync(
                `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
                { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
              );
              stdout = execResult.stdout;
              stderr = execResult.stderr;
            } catch (execError) {
              stdout = execError.stdout || '';
              stderr = execError.stderr || '';
            }
            
            // Удаляем временный файл
            try {
              fs.unlinkSync(tempRequestFile);
            } catch (e) {
              // Игнорируем ошибки удаления
            }
            
            // Парсим результат (используем ту же логику, что и для scenarios)
            if (!stdout || stdout.trim().length === 0) {
              throw new Error('Empty response from queues-api.ts');
            }
            
            const lines = stdout.trim().split('\n').filter(line => line.trim());
            let jsonLine = null;
            
            // Ищем JSON строку в выводе
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              // Пропускаем строки с логами PowerShell
              if (line.startsWith('[LOG]') || line.startsWith('[WARN]') || line.startsWith('[ERROR]') || line.startsWith('[INFO]') || 
                  line.includes('prisma:query') || line.includes('prisma:') || 
                  line.startsWith('node.exe') || line.startsWith('node ') ||
                  line.startsWith('At line:') || line.startsWith('+ CategoryInfo:') ||
                  line.includes('RemoteException') || line.includes('NativeCommandError') ||
                  line.startsWith('& "') || line.startsWith('C:\\Program Files') ||
                  line.startsWith('At C:') || line.startsWith('At ') ||
                  line.includes('CategoryInfo') || line.includes('FullyQualifiedErrorId') ||
                  line.startsWith('[path]') || line.includes('"[path]"') ||
                  /^\s*\+.*CategoryInfo/.test(line) || /^\s*\+.*FullyQualifiedErrorId/.test(line) ||
                  line.startsWith('tsx.cmd')) {
                continue;
              }
              
              if (line.startsWith('{') && line.endsWith('}')) {
                try {
                  const parsed = JSON.parse(line);
                  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                    jsonLine = line;
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }
            }
            
            // Если не нашли в одной строке, пробуем собрать многострочный JSON
            if (!jsonLine) {
              let jsonStartIndex = -1;
              for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed.startsWith('{') && 
                    !trimmed.startsWith('[LOG]') && !trimmed.startsWith('[WARN]') &&
                    !trimmed.startsWith('[ERROR]') && !trimmed.startsWith('[INFO]') &&
                    !trimmed.includes('prisma:query') && !trimmed.includes('prisma:') &&
                    !trimmed.startsWith('node.exe') && !trimmed.startsWith('node ') &&
                    !trimmed.startsWith('At line:') && !trimmed.startsWith('+ CategoryInfo:') &&
                    !trimmed.includes('RemoteException') && !trimmed.includes('NativeCommandError') &&
                    !trimmed.startsWith('& "') && !trimmed.startsWith('C:\\Program Files') &&
                    !trimmed.startsWith('At C:') && !trimmed.startsWith('At ') &&
                    !trimmed.includes('CategoryInfo') && !trimmed.includes('FullyQualifiedErrorId') &&
                    !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"') &&
                    !/^\s*\+.*CategoryInfo/.test(trimmed) && !/^\s*\+.*FullyQualifiedErrorId/.test(trimmed) &&
                    !trimmed.startsWith('tsx.cmd')) {
                  jsonStartIndex = i;
                  break;
                }
              }
              
              if (jsonStartIndex !== -1) {
                let braceCount = 0;
                let jsonLines = [];
                
                for (let i = jsonStartIndex; i < lines.length; i++) {
                  const line = lines[i];
                  jsonLines.push(line);
                  
                  for (const char of line) {
                    if (char === '{') braceCount++;
                    if (char === '}') braceCount--;
                  }
                  
                  if (braceCount === 0) {
                    const jsonStr = jsonLines.join('\n').trim();
                    try {
                      const parsed = JSON.parse(jsonStr);
                      if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                        jsonLine = jsonStr;
                        break;
                      }
                    } catch (e) {
                      // Не валидный JSON
                    }
                    break;
                  }
                }
              }
            }
            
            if (!jsonLine) {
              throw new Error('No valid JSON response from queues-api.ts');
            }
            
            const result = JSON.parse(jsonLine);
            const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
            
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(jsonLine);
          } catch (error) {
            console.error('[Queues API] Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: { code: 'INTERNAL_ERROR', message: error.message }
            }));
          }
        })();
        return;
      }
      
      // Обработка POST, PUT, DELETE запросов (с body)
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathParts = pathname.split('/').filter(p => p);
          let command = '';
          let requestData = {};
          
          if (req.method === 'POST') {
            if (pathParts.length === 4 && pathParts[3] === 'triggers') {
              // POST /api/queues/:id/triggers
              command = 'add-trigger';
              requestData = { ...JSON.parse(body), queueId: pathParts[2] };
            } else if (pathParts.length === 4 && pathParts[3] === 'jobs') {
              // POST /api/queues/:id/jobs
              command = 'add-job';
              requestData = { ...JSON.parse(body), queueId: pathParts[2] };
            } else {
              // POST /api/queues
              command = 'create';
              requestData = JSON.parse(body);
            }
          } else if (req.method === 'PUT') {
            // PUT /api/queues/:id
            command = 'update';
            requestData = { ...JSON.parse(body), id: pathParts[2] };
          } else if (req.method === 'DELETE') {
            if (pathParts.length === 5 && pathParts[3] === 'triggers') {
              // DELETE /api/queues/:id/triggers/:triggerId
              command = 'remove-trigger';
              requestData = { triggerId: pathParts[4] };
            } else {
              // DELETE /api/queues/:id
              command = 'delete';
              requestData = { id: pathParts[2] };
            }
          }
          
          if (!command) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: { code: 'INVALID_METHOD', message: 'Method not supported' }
            }));
            return;
          }

          const tt = await trustedTenantOrRespond(req, res);
          if (!tt) return;
          requestData._tenantId = tt.tenantId;
          
          // Выполняем через tsx
          const tempRequestFile = path.join(__dirname, `temp-queues-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
          
          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'queues-api.ts');
          
          console.log(`[Queues API] Executing: ${command} with data:`, JSON.stringify(requestData));
          
          let stdout, stderr;
          try {
            const execResult = await execAsync(
              `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
              { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
            );
            stdout = execResult.stdout;
            stderr = execResult.stderr;
          } catch (execError) {
            stdout = execError.stdout || '';
            stderr = execError.stderr || '';
          }
          
          // Удаляем временный файл
          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) {
            // Игнорируем ошибки удаления
          }
          
          // Парсим результат (используем ту же логику, что и для scenarios)
          if (!stdout || stdout.trim().length === 0) {
            throw new Error('Empty response from queues-api.ts');
          }
          
          const lines = stdout.trim().split('\n').filter(line => line.trim());
          let jsonLine = null;
          
          // Ищем JSON строку в выводе
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Пропускаем строки с логами PowerShell
            if (line.startsWith('[LOG]') || line.startsWith('[WARN]') || line.startsWith('[ERROR]') || line.startsWith('[INFO]') || 
                line.includes('prisma:query') || line.includes('prisma:') || 
                line.startsWith('node.exe') || line.startsWith('node ') ||
                line.startsWith('At line:') || line.startsWith('+ CategoryInfo:') ||
                line.includes('RemoteException') || line.includes('NativeCommandError') ||
                line.startsWith('& "') || line.startsWith('C:\\Program Files') ||
                line.startsWith('At C:') || line.startsWith('At ') ||
                line.includes('CategoryInfo') || line.includes('FullyQualifiedErrorId') ||
                line.startsWith('[path]') || line.includes('"[path]"') ||
                /^\s*\+.*CategoryInfo/.test(line) || /^\s*\+.*FullyQualifiedErrorId/.test(line) ||
                line.startsWith('tsx.cmd')) {
              continue;
            }
            
            if (line.startsWith('{') && line.endsWith('}')) {
              try {
                const parsed = JSON.parse(line);
                if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                  jsonLine = line;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
          
          // Если не нашли в одной строке, пробуем собрать многострочный JSON
          if (!jsonLine) {
            let jsonStartIndex = -1;
            for (let i = 0; i < lines.length; i++) {
              const trimmed = lines[i].trim();
              if (trimmed.startsWith('{') && 
                  !trimmed.startsWith('[LOG]') && !trimmed.startsWith('[WARN]') &&
                  !trimmed.startsWith('[ERROR]') && !trimmed.startsWith('[INFO]') &&
                  !trimmed.includes('prisma:query') && !trimmed.includes('prisma:') &&
                  !trimmed.startsWith('node.exe') && !trimmed.startsWith('node ') &&
                  !trimmed.startsWith('At line:') && !trimmed.startsWith('+ CategoryInfo:') &&
                  !trimmed.includes('RemoteException') && !trimmed.includes('NativeCommandError') &&
                  !trimmed.startsWith('& "') && !trimmed.startsWith('C:\\Program Files') &&
                  !trimmed.startsWith('At C:') && !trimmed.startsWith('At ') &&
                  !trimmed.includes('CategoryInfo') && !trimmed.includes('FullyQualifiedErrorId') &&
                  !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"') &&
                  !/^\s*\+.*CategoryInfo/.test(trimmed) && !/^\s*\+.*FullyQualifiedErrorId/.test(trimmed) &&
                  !trimmed.startsWith('tsx.cmd')) {
                jsonStartIndex = i;
                break;
              }
            }
            
            if (jsonStartIndex !== -1) {
              let braceCount = 0;
              let jsonLines = [];
              
              for (let i = jsonStartIndex; i < lines.length; i++) {
                const line = lines[i];
                jsonLines.push(line);
                
                for (const char of line) {
                  if (char === '{') braceCount++;
                  if (char === '}') braceCount--;
                }
                
                if (braceCount === 0) {
                  const jsonStr = jsonLines.join('\n').trim();
                  try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                      jsonLine = jsonStr;
                      break;
                    }
                  } catch (e) {
                    // Не валидный JSON
                  }
                  break;
                }
              }
            }
          }
          
          if (!jsonLine) {
            throw new Error('No valid JSON response from queues-api.ts');
          }
          
          const result = JSON.parse(jsonLine);
          const statusCode = result.success ? (req.method === 'POST' ? 201 : 200) : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
          
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(jsonLine);
        } catch (error) {
          console.error('[Queues API] Error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: error.message }
          }));
        }
      }
      );
      return;
  } else if (pathname.startsWith('/api/scenarios')) {
    {
      const sScope = (req.method === 'GET') ? 'scenarios:read' : 'scenarios:write';
      if (!requireScope(req, res, sScope)) return;
    }
    console.log('[DEBUG] Scenarios API request:', req.method, pathname);
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Обработка GET запросов сразу (без body)
    if (req.method === 'GET') {
      (async () => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathParts = pathname.split('/').filter(p => p);
          let command = '';
          let requestData = {};

          const tt = await trustedTenantOrRespond(req, res);
          if (!tt) return;
          
          if (pathParts.length === 4 && pathParts[3] === 'executions') {
            // GET /api/scenarios/:id/executions
            command = 'executions';
            requestData = {
              scenarioId: pathParts[2],
              executionStatus: url.searchParams.get('status'),
              limit: url.searchParams.get('limit'),
              offset: url.searchParams.get('offset'),
              _tenantId: tt.tenantId
            };
          } else if (pathParts.length === 3) {
            // GET /api/scenarios/:id
            command = 'get';
            requestData = { id: pathParts[2], _tenantId: tt.tenantId };
          } else {
            // GET /api/scenarios
            command = 'list';
            requestData = {
              status: url.searchParams.get('status'),
              limit: url.searchParams.get('limit'),
              offset: url.searchParams.get('offset'),
              _tenantId: tt.tenantId
            };
          }
          
          // Выполняем через tsx
          const tempRequestFile = path.join(__dirname, `temp-scenarios-${Date.now()}.json`);
          fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
          
          const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
          const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
          const scriptPath = path.join(__dirname, 'src', 'web', 'scenarios-api.ts');
          
          // Проверяем существование скрипта
          if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script not found: ${scriptPath}`);
          }
          
          console.log(`[Scenarios API] Executing: ${command} with data:`, JSON.stringify(requestData));
          
          let stdout, stderr;
          try {
            const execResult = await execAsync(
              `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
              { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
            );
            stdout = execResult.stdout;
            stderr = execResult.stderr;
          } catch (execError) {
            // Если команда завершилась с ошибкой, но есть stdout, используем его
            stdout = execError.stdout || '';
            stderr = execError.stderr || '';
            
            // Если в stderr есть полезная информация, логируем
            if (stderr && !stderr.includes('PrismaClientConstructorValidationError')) {
              console.log(`[Scenarios API] stderr:`, stderr.substring(0, 500));
            }
          }
          
          // Удаляем временный файл
          try {
            fs.unlinkSync(tempRequestFile);
          } catch (e) {
            // Игнорируем ошибки удаления
          }
          
          // Парсим результат
          if (!stdout || stdout.trim().length === 0) {
            throw new Error('Empty response from scenarios-api.ts');
          }
          
        // Улучшенный парсинг JSON: обрабатываем многострочный JSON и фильтруем PowerShell сообщения
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        let jsonLine = null;
        
        // Сначала пробуем найти JSON в одной строке
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Пропускаем пустые строки
          if (!line) continue;
          
          // Пропускаем строки с логами и служебными сообщениями PowerShell
          if (line.startsWith('[LOG]') || line.startsWith('[WARN]') || line.startsWith('[ERROR]') || line.startsWith('[INFO]') || 
              line.includes('prisma:query') || line.includes('prisma:') || 
              line.startsWith('node.exe') || line.startsWith('node ') ||
              line.startsWith('At line:') || line.startsWith('+ CategoryInfo:') ||
              line.includes('RemoteException') || line.includes('NativeCommandError') ||
              line.startsWith('& "') || line.startsWith('C:\\Program Files') ||
              line.startsWith('At C:') || line.startsWith('At ') ||
              line.includes('CategoryInfo') || line.includes('FullyQualifiedErrorId') ||
              line.startsWith('[path]') || line.includes('"[path]"') ||
              /^\s*\+.*CategoryInfo/.test(line) || /^\s*\+.*FullyQualifiedErrorId/.test(line) ||
              line.startsWith('tsx.cmd')) {
            continue;
          }
          
          // Проверяем, что это валидный JSON (начинается с { и заканчивается })
          if (line.startsWith('{') && line.endsWith('}')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                jsonLine = line;
                break;
              }
            } catch (e) {
              // Не валидный JSON в одной строке, продолжаем
              continue;
            }
          }
        }
        
        // Если не нашли в одной строке, пробуем собрать многострочный JSON
        if (!jsonLine) {
          // Ищем строку, начинающуюся с {
          let jsonStartIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('{') && 
                !trimmed.startsWith('[LOG]') && !trimmed.startsWith('[WARN]') &&
                !trimmed.startsWith('[ERROR]') && !trimmed.startsWith('[INFO]') &&
                !trimmed.includes('prisma:query') && !trimmed.includes('prisma:') &&
                !trimmed.startsWith('node.exe') && !trimmed.startsWith('node ') &&
                !trimmed.startsWith('At line:') && !trimmed.startsWith('+ CategoryInfo:') &&
                !trimmed.includes('RemoteException') && !trimmed.includes('NativeCommandError') &&
                !trimmed.startsWith('& "') && !trimmed.startsWith('C:\\Program Files') &&
                !trimmed.startsWith('At C:') && !trimmed.startsWith('At ') &&
                !trimmed.includes('CategoryInfo') && !trimmed.includes('FullyQualifiedErrorId') &&
                !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"') &&
                !/^\s*\+.*CategoryInfo/.test(trimmed) && !/^\s*\+.*FullyQualifiedErrorId/.test(trimmed) &&
                !trimmed.startsWith('tsx.cmd')) {
              jsonStartIndex = i;
              break;
            }
          }
          
          if (jsonStartIndex !== -1) {
            // Собираем JSON из строк, начиная с найденной
            let braceCount = 0;
            let jsonLines = [];
            
            for (let i = jsonStartIndex; i < lines.length; i++) {
              const line = lines[i];
              jsonLines.push(line);
              
              // Подсчитываем скобки
              for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
              }
              
              // Если скобки сбалансированы, JSON собран
              if (braceCount === 0) {
                const jsonStr = jsonLines.join('\n').trim();
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                    jsonLine = jsonStr;
                    break;
                  }
                } catch (e) {
                  // Не валидный JSON
                }
                break;
              }
            }
          }
        }
          
          if (!jsonLine) {
            console.error('[Scenarios API] No JSON found in output.');
            console.error('[Scenarios API] First 500 chars of stdout:', stdout.substring(0, 500));
            console.error('[Scenarios API] All lines:', lines);
            
            // Очищаем путь к файлу из сообщения об ошибке
            let errorOutput = stdout.substring(0, 500);
            // Фильтруем строки PowerShell перед выводом ошибки
            const filteredLines = lines.filter(line => {
              const lineTrimmed = line.trim();
              return !(lineTrimmed.startsWith('[LOG]') || lineTrimmed.startsWith('[WARN]') || lineTrimmed.startsWith('[ERROR]') || lineTrimmed.startsWith('[INFO]') || 
                       lineTrimmed.includes('prisma:query') || lineTrimmed.includes('prisma:') ||
                       lineTrimmed.startsWith('node.exe') || lineTrimmed.startsWith('node ') ||
                       lineTrimmed.startsWith('At line:') || lineTrimmed.startsWith('+ CategoryInfo:') ||
                       lineTrimmed.includes('RemoteException') || lineTrimmed.includes('NativeCommandError') ||
                       lineTrimmed.startsWith('& "') || lineTrimmed.startsWith('C:\\Program Files') ||
                       lineTrimmed.startsWith('At C:') || lineTrimmed.includes('CategoryInfo') ||
                       lineTrimmed.includes('FullyQualifiedErrorId'));
            });
            // Ищем любую строку, которая выглядит как JSON
            // Исключаем строки с "[path]" в содержимом
            const jsonCandidates = filteredLines.filter(line => {
              const trimmed = line.trim();
              return trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes('"[path]"');
            });
            
            if (jsonCandidates.length > 0) {
              // Пробуем распарсить первый кандидат
              try {
                const candidate = jsonCandidates[0].trim();
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                  jsonLine = candidate;
                }
              } catch (e) {
                // Не валидный JSON, продолжаем
              }
            }
            
            if (!jsonLine) {
              // Если все еще не нашли JSON, формируем сообщение об ошибке
              // Фильтруем строки, которые содержат "[path]" или начинаются с него
              const cleanLines = filteredLines.filter(l => {
                const trimmed = l.trim();
                return !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"');
              });
              let errorOutput = cleanLines.length > 0 ? cleanLines.join('\n').substring(0, 200) : 'No valid JSON found';
              // Убираем пути к файлам из сообщения об ошибке
              errorOutput = errorOutput.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
              errorOutput = errorOutput.replace(/\/[^\s"]+/g, '[path]');
              throw new Error('No valid JSON response from scenarios-api.ts. Output: ' + errorOutput);
            }
          }
          
          // Парсим JSON
          let result;
          try {
            result = JSON.parse(jsonLine);
          } catch (parseError) {
            console.error('[Scenarios API] JSON parse error:', parseError.message);
            console.error('[Scenarios API] Attempted to parse:', jsonLine.substring(0, 200));
            throw new Error('Invalid JSON in response: ' + parseError.message);
          }
          
          const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error('Error in /api/scenarios (GET):', error);
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
          
          // Очищаем сообщение об ошибке от путей к файлам
          let errorMessage = error.message || 'Unknown error';
          errorMessage = errorMessage.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
          errorMessage = errorMessage.replace(/\/[^\s"]+/g, '[path]');
          if (errorMessage.length > 500) {
            errorMessage = errorMessage.substring(0, 500) + '...';
          }
          
          // Убеждаемся, что возвращаем валидный JSON
          const errorResponse = {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: errorMessage
            }
          };
          
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errorResponse));
        }
      })();
      return; // Важно: возвращаемся, чтобы не обрабатывать дальше
    }
    
    // Обработка POST, PUT, DELETE запросов (с body)
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathParts = pathname.split('/').filter(p => p);
        let command = '';
        let requestData = {};
        const parsedBody = body ? JSON.parse(body) : {};

        const tt = await trustedTenantOrRespond(req, res, parsedBody.tenantId ?? parsedBody._tenantId);
        if (!tt) return;
        
        if (req.method === 'POST') {
          // POST /api/scenarios
          command = 'create';
          requestData = { ...parsedBody, _tenantId: tt.tenantId };
        } else if (req.method === 'PUT') {
          // PUT /api/scenarios/:id
          command = 'update';
          requestData = {
            id: pathParts[2],
            ...parsedBody,
            _tenantId: tt.tenantId
          };
        } else if (req.method === 'DELETE') {
          // DELETE /api/scenarios/:id
          command = 'delete';
          requestData = { id: pathParts[2], _tenantId: tt.tenantId };
        }
        
        if (!command) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INVALID_METHOD', message: 'Method not supported' }
          }));
          return;
        }
        
        // Выполняем через tsx
        const tempRequestFile = path.join(__dirname, `temp-scenarios-${Date.now()}.json`);
        fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
        
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'scenarios-api.ts');
        
        // Проверяем существование скрипта
        if (!fs.existsSync(scriptPath)) {
          throw new Error(`Script not found: ${scriptPath}`);
        }
        
        console.log(`[Scenarios API] Executing: ${command} with data:`, JSON.stringify(requestData));
        
        let stdout, stderr;
        try {
          // Используем файл для передачи данных, чтобы избежать проблем с экранированием в PowerShell
          const execResult = await execAsync(
            `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
            { 
              cwd: __dirname, 
              maxBuffer: 10 * 1024 * 1024, 
              timeout: 30000,
              shell: false  // Не используем shell, чтобы избежать проблем с экранированием
            }
          );
          stdout = execResult.stdout;
          stderr = execResult.stderr;
        } catch (execError) {
          // Если команда завершилась с ошибкой, но есть stdout, используем его
          stdout = execError.stdout || '';
          stderr = execError.stderr || '';
          
          // Если в stderr есть полезная информация, логируем
          if (stderr && !stderr.includes('PrismaClientConstructorValidationError')) {
            console.log(`[Scenarios API] stderr:`, stderr.substring(0, 500));
          }
        }
        
        // Удаляем временный файл
        try {
          fs.unlinkSync(tempRequestFile);
        } catch (e) {
          // Игнорируем ошибки удаления
        }
        
        // Парсим результат
        if (!stdout || stdout.trim().length === 0) {
          throw new Error('Empty response from scenarios-api.ts');
        }
        
        // Улучшенный парсинг JSON: обрабатываем многострочный JSON и фильтруем PowerShell сообщения
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        let jsonLine = null;
        
        // Сначала пробуем найти JSON в одной строке
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Пропускаем пустые строки
          if (!line) continue;
          
          // Пропускаем строки с логами и служебными сообщениями PowerShell
          if (line.startsWith('[LOG]') || line.startsWith('[WARN]') || line.startsWith('[ERROR]') || line.startsWith('[INFO]') || 
              line.includes('prisma:query') || line.includes('prisma:') || 
              line.startsWith('node.exe') || line.startsWith('node ') ||
              line.startsWith('At line:') || line.startsWith('+ CategoryInfo:') ||
              line.includes('RemoteException') || line.includes('NativeCommandError') ||
              line.startsWith('& "') || line.startsWith('C:\\Program Files') ||
              line.startsWith('At C:') || line.startsWith('At ') ||
              line.includes('CategoryInfo') || line.includes('FullyQualifiedErrorId') ||
              line.startsWith('[path]') || line.includes('"[path]"') ||
              /^\s*\+.*CategoryInfo/.test(line) || /^\s*\+.*FullyQualifiedErrorId/.test(line) ||
              line.startsWith('tsx.cmd')) {
            continue;
          }
          
          // Проверяем, что это валидный JSON (начинается с { и заканчивается })
          if (line.startsWith('{') && line.endsWith('}')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                jsonLine = line;
                break;
              }
            } catch (e) {
              // Не валидный JSON в одной строке, продолжаем
              continue;
            }
          }
        }
        
        // Если не нашли в одной строке, пробуем собрать многострочный JSON
        if (!jsonLine) {
          // Ищем строку, начинающуюся с {
          let jsonStartIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('{') && 
                !trimmed.startsWith('[LOG]') && !trimmed.startsWith('[WARN]') &&
                !trimmed.startsWith('[ERROR]') && !trimmed.startsWith('[INFO]') &&
                !trimmed.includes('prisma:query') && !trimmed.includes('prisma:') &&
                !trimmed.startsWith('node.exe') && !trimmed.startsWith('node ') &&
                !trimmed.startsWith('At line:') && !trimmed.startsWith('+ CategoryInfo:') &&
                !trimmed.includes('RemoteException') && !trimmed.includes('NativeCommandError') &&
                !trimmed.startsWith('& "') && !trimmed.startsWith('C:\\Program Files') &&
                !trimmed.startsWith('At C:') && !trimmed.startsWith('At ') &&
                !trimmed.includes('CategoryInfo') && !trimmed.includes('FullyQualifiedErrorId') &&
                !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"') &&
                !/^\s*\+.*CategoryInfo/.test(trimmed) && !/^\s*\+.*FullyQualifiedErrorId/.test(trimmed) &&
                !trimmed.startsWith('tsx.cmd')) {
              jsonStartIndex = i;
              break;
            }
          }
          
          if (jsonStartIndex !== -1) {
            // Собираем JSON из строк, начиная с найденной
            let braceCount = 0;
            let jsonLines = [];
            
            for (let i = jsonStartIndex; i < lines.length; i++) {
              const line = lines[i];
              jsonLines.push(line);
              
              // Подсчитываем скобки
              for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
              }
              
              // Если скобки сбалансированы, JSON собран
              if (braceCount === 0) {
                const jsonStr = jsonLines.join('\n').trim();
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                    jsonLine = jsonStr;
                    break;
                  }
                } catch (e) {
                  // Не валидный JSON
                }
                break;
              }
            }
          }
        }
        
        // Если не нашли полную JSON строку, пробуем найти начало и собрать полную строку
        if (!jsonLine) {
          // Ищем строку, начинающуюся с {, но не логи
          const startIndex = lines.findIndex(line => {
            const lineTrimmed = line.trim();
            return lineTrimmed.startsWith('{') && 
                   !(lineTrimmed.startsWith('[LOG]') || lineTrimmed.startsWith('[WARN]') || lineTrimmed.startsWith('[ERROR]') || lineTrimmed.startsWith('[INFO]') || 
                     lineTrimmed.includes('prisma:query') || lineTrimmed.includes('prisma:') ||
                     lineTrimmed.startsWith('node.exe') || lineTrimmed.startsWith('node ') ||
                     lineTrimmed.startsWith('At line:') || lineTrimmed.startsWith('+ CategoryInfo:') ||
                     lineTrimmed.includes('RemoteException') || lineTrimmed.includes('NativeCommandError') ||
                     lineTrimmed.startsWith('& "') || lineTrimmed.startsWith('C:\\Program Files') ||
                     lineTrimmed.startsWith('At C:') || lineTrimmed.includes('CategoryInfo') ||
                     lineTrimmed.includes('FullyQualifiedErrorId'));
          });
          if (startIndex !== -1) {
            // Пробуем собрать JSON из нескольких строк
            let potentialJsonLines = lines.slice(startIndex);
            // Отфильтровываем логи из потенциальных JSON строк
            potentialJsonLines = potentialJsonLines.filter(line => {
              const lineTrimmed = line.trim();
              return !(lineTrimmed.startsWith('[LOG]') || lineTrimmed.startsWith('[WARN]') || lineTrimmed.startsWith('[ERROR]') || lineTrimmed.startsWith('[INFO]') || 
                       lineTrimmed.includes('prisma:query') || lineTrimmed.includes('prisma:') ||
                       lineTrimmed.startsWith('node.exe') || lineTrimmed.startsWith('node ') ||
                       lineTrimmed.startsWith('At line:') || lineTrimmed.startsWith('+ CategoryInfo:') ||
                       lineTrimmed.includes('RemoteException') || lineTrimmed.includes('NativeCommandError') ||
                       lineTrimmed.startsWith('& "') || lineTrimmed.startsWith('C:\\Program Files') ||
                       lineTrimmed.startsWith('At C:') || lineTrimmed.includes('CategoryInfo') ||
                       lineTrimmed.includes('FullyQualifiedErrorId'));
            });
            
            let potentialJson = potentialJsonLines.join('\n').trim();
            
            // Если JSON разбит на несколько строк, пробуем найти конец
            // Ищем последнюю закрывающую скобку
            let braceCount = 0;
            let jsonEnd = -1;
            for (let i = 0; i < potentialJson.length; i++) {
              if (potentialJson[i] === '{') braceCount++;
              if (potentialJson[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                  jsonEnd = i + 1;
                  break;
                }
              }
            }
            
            if (jsonEnd > 0) {
              potentialJson = potentialJson.substring(0, jsonEnd);
              try {
                const parsed = JSON.parse(potentialJson);
                if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                  jsonLine = potentialJson;
                }
              } catch (e) {
                // Не валидный JSON
              }
            }
          }
        }
        
          if (!jsonLine) {
            console.error('[Scenarios API] No JSON found in output.');
            console.error('[Scenarios API] First 500 chars of stdout:', stdout.substring(0, 500));
            console.error('[Scenarios API] All lines:', lines);
            
            // Фильтруем строки PowerShell перед выводом ошибки
            const filteredLines = lines.filter(line => {
              const lineTrimmed = line.trim();
              return !(lineTrimmed.startsWith('[LOG]') || lineTrimmed.startsWith('[WARN]') || lineTrimmed.startsWith('[ERROR]') || lineTrimmed.startsWith('[INFO]') || 
                       lineTrimmed.includes('prisma:query') || lineTrimmed.includes('prisma:') ||
                       lineTrimmed.startsWith('node.exe') || lineTrimmed.startsWith('node ') ||
                       lineTrimmed.startsWith('At line:') || lineTrimmed.startsWith('+ CategoryInfo:') ||
                       lineTrimmed.includes('RemoteException') || lineTrimmed.includes('NativeCommandError') ||
                       lineTrimmed.startsWith('& "') || lineTrimmed.startsWith('C:\\Program Files') ||
                       lineTrimmed.startsWith('At C:') || lineTrimmed.startsWith('At ') ||
                       lineTrimmed.includes('CategoryInfo') || lineTrimmed.includes('FullyQualifiedErrorId') ||
                       lineTrimmed.startsWith('[path]') || lineTrimmed.includes('"[path]"'));
            });
            
            // Ищем любую строку, которая выглядит как JSON (начинается с { и заканчивается })
            // Исключаем строки с "[path]" в содержимом
            const jsonCandidates = filteredLines.filter(line => {
              const trimmed = line.trim();
              return trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes('"[path]"');
            });
            
            if (jsonCandidates.length > 0) {
              // Пробуем распарсить первый кандидат
              try {
                const candidate = jsonCandidates[0].trim();
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === 'object' && 'success' in parsed) {
                  jsonLine = candidate;
                }
              } catch (e) {
                // Не валидный JSON, продолжаем
              }
            }
            
            if (!jsonLine) {
              // Если все еще не нашли JSON, формируем сообщение об ошибке
              // Фильтруем строки, которые содержат "[path]" или начинаются с него
              const cleanLines = filteredLines.filter(l => {
                const trimmed = l.trim();
                return !trimmed.startsWith('[path]') && !trimmed.includes('"[path]"');
              });
              let errorOutput = cleanLines.length > 0 ? cleanLines.join('\n').substring(0, 200) : 'No valid JSON found';
              // Убираем пути к файлам из сообщения об ошибке
              errorOutput = errorOutput.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
              errorOutput = errorOutput.replace(/\/[^\s"]+/g, '[path]');
              throw new Error('No valid JSON response from scenarios-api.ts. Output: ' + errorOutput);
            }
          }
        
        // Парсим JSON
        let result;
        try {
          result = JSON.parse(jsonLine);
        } catch (parseError) {
          console.error('[Scenarios API] JSON parse error:', parseError.message);
          console.error('[Scenarios API] Attempted to parse:', jsonLine.substring(0, 200));
          throw new Error('Invalid JSON in response: ' + parseError.message);
        }
        
        const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Error in /api/scenarios (POST/PUT/DELETE):', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Очищаем сообщение об ошибке от путей к файлам
        let errorMessage = error.message || 'Unknown error';
        errorMessage = errorMessage.replace(/[A-Z]:\\[^\s"]+/g, '[path]');
        errorMessage = errorMessage.replace(/\/[^\s"]+/g, '[path]');
        if (errorMessage.length > 500) {
          errorMessage = errorMessage.substring(0, 500) + '...';
        }
        
        // Убеждаемся, что возвращаем валидный JSON
        const errorResponse = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: errorMessage
          }
        };
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
      }
    });
  } else if (pathname.match(/^\/api\/executions\/[^/]+\/diagnosis$/) && req.method === 'GET') {
    if (!requireScope(req, res, 'executions:read')) return;
    (async () => {
      try {
        const tt = await trustedTenantOrRespond(req, res);
        if (!tt) return;
        const executionId = pathname.split('/')[3];
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'scenarios-api.ts');
        const tempFile = path.join(__dirname, `temp-diag-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify({ executionId, _tenantId: tt.tenantId }), 'utf-8');

        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "execution-get" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}

        let execution;
        try { execution = JSON.parse(stdout); } catch { execution = null; }

        const diagnosis = classifyExecutionError(execution);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(diagnosis));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
  } else if (pathname.startsWith('/api/executions')) {
    if (!requireScope(req, res, 'executions:read')) return;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const tt = await trustedTenantOrRespond(req, res);
        if (!tt) return;
        const pathParts = pathname.split('/').filter(p => p);
        let command = '';
        let requestData = {};
        
        if (req.method === 'GET') {
          if (pathParts.length === 2 && pathParts[0] === 'api' && pathParts[1] === 'executions') {
            // GET /api/executions?limit=&scenarioId=
            command = 'execution-list-recent';
            const lim = url.searchParams.get('limit');
            const scen = url.searchParams.get('scenarioId');
            requestData = {
              limit: lim && lim.trim() !== '' ? lim : '40',
              ...(scen && scen.trim() !== '' ? { scenarioId: scen.trim() } : {}),
              _tenantId: tt.tenantId
            };
          } else if (pathParts.length === 4 && pathParts[3] === 'unified-status') {
            // GET /api/executions/:executionId/unified-status
            command = 'execution-unified-status';
            requestData = { executionId: pathParts[2], _tenantId: tt.tenantId };
          } else if (pathParts.length === 4 && pathParts[3] === 'events') {
            // GET /api/executions/:executionId/events
            command = 'execution-events';
            requestData = { executionId: pathParts[2], _tenantId: tt.tenantId };
          } else if (pathParts.length === 3) {
            // GET /api/executions/:executionId
            command = 'execution';
            requestData = { executionId: pathParts[2], _tenantId: tt.tenantId };
          }
        }
        
        if (!command) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'Invalid endpoint' }
          }));
          return;
        }
        
        // Выполняем через tsx
        const tempRequestFile = path.join(__dirname, `temp-executions-${Date.now()}.json`);
        fs.writeFileSync(tempRequestFile, JSON.stringify(requestData), 'utf-8');
        
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'scenarios-api.ts');
        
        const { stdout, stderr } = await execAsync(
          `${tsxCmd} "${scriptPath}" "${command}" "${tempRequestFile}"`,
          { cwd: __dirname, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }
        );
        
        // Удаляем временный файл
        try {
          fs.unlinkSync(tempRequestFile);
        } catch (e) {
          // Игнорируем ошибки удаления
        }
        
        // Парсим результат
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        const jsonLine = lines[lines.length - 1];
        const result = JSON.parse(jsonLine);
        
        const statusCode = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Error in /api/executions:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message || 'Unknown error'
          }
        }));
      }
    });
  } else if (pathname === '/healthz' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getHealthPayload()));
  } else if (pathname === '/readyz' || pathname === '/api/ready') {
    const readiness = getReadinessPayload();
    const statusCode = Object.values(readiness.checks).every(Boolean) ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readiness));
  } else if (pathname === '/api/guardrails/config' && req.method === 'GET') {
    if (!requireScope(req, res, 'config:read')) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, config: guardrailsConfig }, null, 2));
  } else if (pathname === '/api/guardrails/config' && req.method === 'POST') {
    if (!requireScope(req, res, 'config:write')) return;
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        guardrailsConfig = {
          ...guardrailsConfig,
          ...parsed,
          risks: {
            ...guardrailsConfig.risks,
            ...(parsed.risks || {}),
            excessiveAgency: {
              ...guardrailsConfig.risks.excessiveAgency,
              ...(parsed.risks && parsed.risks.excessiveAgency ? parsed.risks.excessiveAgency : {})
            }
          },
          customPatterns: {
            ...guardrailsConfig.customPatterns,
            ...(parsed.customPatterns || {})
          }
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, config: guardrailsConfig }, null, 2));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: String(error) }));
      }
    });
  } else if (pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      timestamp: new Date().toISOString(),
      components: components,
      summary: { total: totalCount, ok: okCount, error: totalCount - okCount }
    }));
  } else if (pathname === '/api/agent/status') {
    // Статус Agent Runtime
    checkOllama().then(ollamaAvailable => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ollamaAvailable,
        model: 'llama3.2:1b',
        modulesLoaded: agentRuntimeModule !== null
      }));
    });
  } else if (pathname === '/api/agent/execute' && req.method === 'POST') {
    if (!requireScope(req, res, 'agent:execute')) return;
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const tt = await trustedTenantOrRespond(req, res, requestData.tenantId ?? requestData._tenantId);
        if (!tt) return;
        const userIntent = requestData.userIntent || '';
        const scenarioId = requestData.scenarioId || 'web-scenario';

        try {
          const prisma = await getPrisma();
          const qTenantId = tt.tenantId;
          const q = await checkQuotaBlockedServer(prisma, qTenantId, 'agent_calls');
          if (q.blocked) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'X-Quota-Remaining': '0' });
            res.end(JSON.stringify({ error: 'Quota exceeded', metric: 'agent_calls', limit: q.limit, current: q.current }));
            return;
          }
        } catch (_e) { /* quota check is best-effort */ }
        
        // Проверяем наличие зависимостей
        const zodExists = fs.existsSync(path.join(__dirname, 'node_modules', 'zod', 'package.json'));
        const tsxExists = fs.existsSync(path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd')) || 
                         fs.existsSync(path.join(__dirname, 'node_modules', '.bin', 'tsx'));
        const scriptPath = path.join(__dirname, 'src', 'web', 'execute-agent.ts');
        const scriptExists = fs.existsSync(scriptPath);
        
        // Если зависимости не установлены или скрипт не найден - используем упрощенный режим
        if (!zodExists || !tsxExists || !scriptExists) {
          const missingItems = [];
          if (!zodExists) missingItems.push('zod');
          if (!tsxExists) missingItems.push('tsx');
          if (!scriptExists) missingItems.push('execute-agent.ts');
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            output: `Запрос обработан: "${userIntent}"\n\nСценарий: ${scenarioId}\n\n⚠️ Работает в упрощенном режиме.\n\nОтсутствуют: ${missingItems.join(', ')}\n\nДля полной работы:\n1. Установите зависимости: npm install\n2. Убедитесь, что все модули установлены\n3. Перезапустите сервер`,
            toolCallsExecuted: 0,
            totalTokens: 0,
            fallbackUsed: true,
            message: `Работает в упрощенном режиме. Отсутствуют: ${missingItems.join(', ')}`
          }));
          return;
        }
        
        // Используем tsx для выполнения TypeScript модулей
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        // Создаем временный файл с запросом
        const tempRequestFile = path.join(__dirname, 'temp-request.json');
        const tenantId = tt.tenantId;
        fs.writeFileSync(
          tempRequestFile,
          JSON.stringify({
            userIntent,
            scenarioId,
            tenantId,
            _tenantId: tenantId,
            _orgId: tt.orgId ?? req.auth?.orgId ?? null,
          }),
          'utf-8'
        );
        
        // Выполняем Agent Runtime через tsx (используем локальный tsx из node_modules)
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const command = `${tsxCmd} "${scriptPath}" "${tempRequestFile}"`;
        console.log('Executing command:', command);
        
        const { stdout, stderr } = await execAsync(command, {
          cwd: __dirname,
          timeout: 30000, // 30 секунд таймаут
          maxBuffer: 1024 * 1024 * 10 // 10MB буфер
        });
        
        // Удаляем временный файл
        try {
          fs.unlinkSync(tempRequestFile);
        } catch (e) {
          // Игнорируем ошибки удаления
        }
        
        // Если есть stderr, но нет stdout - это ошибка
        if (stderr && stderr.trim() && !stdout) {
          throw new Error(`Execution failed: ${stderr}`);
        }
        
        // Если есть stderr с предупреждениями, но есть stdout - продолжаем
        if (stderr && stderr.trim() && stdout) {
          console.warn('Warning from tsx:', stderr);
        }
        
        // Парсим результат
        // Берем только последнюю строку из stdout (она должна быть JSON)
        // Все остальные строки - это логи, которые могут быть в stdout
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('No output from script');
        }
        
        // Последняя строка должна быть JSON
        const jsonLine = lines[lines.length - 1];
        let result;
        try {
          result = JSON.parse(jsonLine);
        } catch (parseError) {
          // Если последняя строка не JSON, пробуем найти JSON в выводе
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(`Failed to parse JSON from output. Last line: ${jsonLine.substring(0, 100)}`);
          }
        }
        
        // Обновляем метрики из результата выполнения
        if (result && typeof result === 'object') {
          if (result.success) {
            metricsStore.scenario_success_total++;
          } else {
            metricsStore.scenario_failures_total++;
          }
          metricsStore.scenario_executions_total++;
          if (result.toolCallsExecuted) {
            metricsStore.agent_tool_calls_total += result.toolCallsExecuted;
          }
          if (result.totalTokens) {
            metricsStore.agent_tokens_used_total += result.totalTokens;
          }
          // Предполагаем один LLM вызов на запрос
          metricsStore.agent_llm_calls_total++;
          metricsStore.lastUpdate = new Date().toISOString();
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Error in /api/agent/execute:', error);
        console.error('Error stack:', error.stack);
        console.error('Error stderr:', error.stderr);
        console.error('Error stdout:', error.stdout);
        
        // Более детальная информация об ошибке
        let errorMessage = error.message || 'Unknown error';
        let errorDetails = error.stderr || error.stdout || '';
        
        // Если это ошибка выполнения команды, добавляем детали
        if (error.stderr) {
          errorDetails = error.stderr;
        } else if (error.stdout && error.stdout.includes('Error')) {
          errorDetails = error.stdout;
        }
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: { 
            code: 'EXECUTION_ERROR', 
            message: errorMessage,
            details: errorDetails || undefined,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          },
          toolCallsExecuted: 0,
          totalTokens: 0
        }));
      }
    });

  // -----------------------------------------------------------------------
  // /api/audit/export — Audit log export
  // -----------------------------------------------------------------------
  } else if (pathname === '/api/audit/export' && req.method === 'GET') {
    if (!requireScope(req, res, 'audit:export')) return;
    (async () => {
    try {
      const params = {};
      for (const [k, v] of url.searchParams) { params[k] = v; }
      const tt = await trustedTenantOrRespond(req, res, params.tenantId);
      if (!tt) return;
      params.tenantId = tt.tenantId;

      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'audit-export.ts');
      const tempFile = path.join(__dirname, `temp-audit-export-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(params), 'utf-8');

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "export" "${tempFile}"`, { cwd: __dirname, timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      try { fs.unlinkSync(tempFile); } catch {}

      const format = url.searchParams.get('format') || 'json';
      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    })();

  // -----------------------------------------------------------------------
  // /api/audit/cleanup — Audit log retention cleanup
  // -----------------------------------------------------------------------
  } else if (pathname === '/api/audit/cleanup' && req.method === 'POST') {
    if (!requireScope(req, res, 'admin:write')) return;
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'audit-cleanup.ts');
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}"`, { cwd: __dirname, timeout: 30000 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }

  // -----------------------------------------------------------------------
  // /api/webhooks — Webhook endpoints CRUD + test delivery
  // -----------------------------------------------------------------------
  } else if (pathname.startsWith('/api/webhooks')) {
    const wScope = (req.method === 'GET') ? 'config:read' : 'config:write';
    if (!requireScope(req, res, wScope)) return;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        let requestData = {};
        if (body) try { requestData = JSON.parse(body); } catch {}

        const pathParts = pathname.split('/').filter(p => p);
        const webhookId = pathParts[2] || null;
        const subAction = pathParts[3] || null;
        let command = '';

        if (req.method === 'GET' && !webhookId) command = 'list';
        else if (req.method === 'GET' && webhookId) { command = 'get'; requestData.id = webhookId; }
        else if (req.method === 'POST' && !webhookId) command = 'create';
        else if (req.method === 'POST' && subAction === 'test') { command = 'test'; requestData.id = webhookId; }
        else if (req.method === 'PATCH' && webhookId) { command = 'update'; requestData.id = webhookId; }
        else if (req.method === 'DELETE' && webhookId) { command = 'delete'; requestData.id = webhookId; }
        else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown webhook route' }));
          return;
        }

        requestData.orgId = requestData.orgId || 'default';

        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'webhook-api.ts');
        const tempFile = path.join(__dirname, `temp-webhook-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify(requestData), 'utf-8');

        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "${command}" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}

        const status = (req.method === 'POST' && command === 'create') ? 201 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(stdout);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

  // -----------------------------------------------------------------------
  // /api/usage — Usage metering and quota dashboard
  // -----------------------------------------------------------------------
  } else if (pathname.startsWith('/api/usage')) {
    if (!requireScope(req, res, 'org:read')) return;
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      let command = 'current';
      const params = {};
      for (const [k, v] of url.searchParams) { params[k] = v; }
      params.orgId = params.orgId || 'default';
      if (!enforceOrgAccess(req, res, params.orgId)) return;

      const ttUsage = await trustedTenantOrRespond(req, res);
      if (!ttUsage) return;
      if (params.tenantId != null && String(params.tenantId).trim() !== '') {
        const tid = String(params.tenantId).trim();
        if (tid !== ttUsage.tenantId) {
          respondTenantForbidden(res);
          return;
        }
      }

      if (pathname.endsWith('/history')) command = 'history';
      else if (pathname.endsWith('/breakdown')) command = 'breakdown';

      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'usage-api.ts');
      const tempFile = path.join(__dirname, `temp-usage-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(params), 'utf-8');

      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "${command}" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
      try { fs.unlinkSync(tempFile); } catch {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }

  // -----------------------------------------------------------------------
  // /api/quotas — QuotaConfig CRUD
  // -----------------------------------------------------------------------
  } else if (pathname === '/api/quotas' && req.method === 'GET') {
    if (!requireScope(req, res, 'org:read')) return;
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const orgId = url.searchParams.get('orgId') || 'default';
      if (!enforceOrgAccess(req, res, orgId)) return;
      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'quota-api.ts');
      const tempFile = path.join(__dirname, `temp-quota-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify({ orgId }), 'utf-8');
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "list" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
      try { fs.unlinkSync(tempFile); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (pathname === '/api/quotas' && req.method === 'POST') {
    if (!requireScope(req, res, 'org:write')) return;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const orgForQuota = String(data.orgId || 'default');
        if (!enforceOrgAccess(req, res, orgForQuota)) return;
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'quota-api.ts');
        const tempFile = path.join(__dirname, `temp-quota-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify(data), 'utf-8');
        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "upsert" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stdout);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (pathname === '/api/quotas' && req.method === 'DELETE') {
    if (!requireScope(req, res, 'org:write')) return;
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const id = url.searchParams.get('id');
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Query id required' }));
        return;
      }
      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'quota-api.ts');
      const tempFile = path.join(__dirname, `temp-quota-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(orgCheckPayloadForQuota(req, { id })), 'utf-8');
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "delete" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
      try { fs.unlinkSync(tempFile); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }

  // -----------------------------------------------------------------------
  // /api/deployment/operator — Canary / lane (Configuration)
  // -----------------------------------------------------------------------
  } else if (pathname === '/api/deployment/operator' && req.method === 'GET') {
    if (!requireScope(req, res, 'org:read')) return;
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'deployment-api.ts');
      const tempFile = path.join(__dirname, `temp-deploy-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify({}), 'utf-8');
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "get" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
      try { fs.unlinkSync(tempFile); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (pathname === '/api/deployment/operator' && req.method === 'PATCH') {
    if (!requireScope(req, res, 'org:write')) return;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'deployment-api.ts');
        const tempFile = path.join(__dirname, `temp-deploy-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify(data), 'utf-8');
        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "set" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stdout);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

  // -----------------------------------------------------------------------
  // /api/onboarding — Onboarding flow
  // -----------------------------------------------------------------------
  } else if (pathname.startsWith('/api/onboarding')) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        let command = '';
        let requestData = {};
        if (body) try { requestData = JSON.parse(body); } catch {}

        if (pathname === '/api/onboarding/status' && req.method === 'GET') {
          command = 'status';
        } else if (pathname === '/api/onboarding/complete' && req.method === 'POST') {
          command = 'complete';
        } else if (pathname === '/api/onboarding/templates' && req.method === 'GET') {
          command = 'templates';
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown onboarding route' }));
          return;
        }

        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'onboarding-api.ts');
        const tempFile = path.join(__dirname, `temp-onboard-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify(requestData), 'utf-8');

        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "${command}" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(stdout);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

  // -----------------------------------------------------------------------
  // /api/orgs — Org / Workspace / Member management
  // -----------------------------------------------------------------------
  } else if (pathname.startsWith('/api/orgs')) {
    // Org/Workspace/Member management API
    const orgScope = (req.method === 'GET') ? 'org:read' : 'org:write';
    if (!requireScope(req, res, orgScope)) return;

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        const pathParts = pathname.split('/').filter(p => p);
        // /api/orgs -> ['api', 'orgs']
        // /api/orgs/:id -> ['api', 'orgs', ':id']
        // /api/orgs/:id/workspaces -> ['api', 'orgs', ':id', 'workspaces']
        // /api/orgs/:id/members -> ['api', 'orgs', ':id', 'members']

        let command = '';
        let requestData = {};

        if (body) {
          try { requestData = JSON.parse(body); } catch {}
        }

        const orgId = pathParts[2] || null;
        const subResource = pathParts[3] || null;
        const subId = pathParts[4] || null;

        if (!subResource && req.method === 'GET' && !orgId) {
          command = 'org-list';
        } else if (!subResource && req.method === 'GET' && orgId) {
          command = 'org-get';
          requestData.id = orgId;
        } else if (!subResource && req.method === 'POST') {
          command = 'org-create';
        } else if (!subResource && req.method === 'PATCH' && orgId) {
          command = 'org-update';
          requestData.id = orgId;
        } else if (subResource === 'workspaces' && req.method === 'GET' && !subId) {
          command = 'workspace-list';
          requestData.orgId = orgId;
        } else if (subResource === 'workspaces' && req.method === 'POST') {
          command = 'workspace-create';
          requestData.orgId = orgId;
        } else if (subResource === 'workspaces' && req.method === 'GET' && subId) {
          command = 'workspace-get';
          requestData.id = subId;
        } else if (subResource === 'workspaces' && req.method === 'PATCH' && subId) {
          command = 'workspace-update';
          requestData.id = subId;
        } else if (subResource === 'members' && req.method === 'GET') {
          command = 'member-list';
          requestData.orgId = orgId;
        } else if (subResource === 'members' && req.method === 'POST') {
          command = 'member-add';
          requestData.orgId = orgId;
        } else if (subResource === 'members' && req.method === 'PATCH' && subId) {
          command = 'member-update';
          requestData.id = subId;
        } else if (subResource === 'members' && req.method === 'DELETE' && subId) {
          command = 'member-remove';
          requestData.id = subId;
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown org route' }));
          return;
        }

        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'org-api.ts');
        const tempFile = path.join(__dirname, `temp-org-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify(requestData), 'utf-8');

        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "${command}" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}

        if (command === 'workspace-create' || command === 'workspace-update') {
          try {
            const trm = await loadTenantResolver();
            if (typeof trm.clearTenantCache === 'function') trm.clearTenantCache();
          } catch (_) { /* ignore */ }
        }

        const status = (req.method === 'POST') ? 201 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(stdout);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

  // -----------------------------------------------------------------------
  // /api/auth/keys — API key management
  // -----------------------------------------------------------------------
  } else if (pathname === '/api/auth/keys' && req.method === 'GET') {
    if (!requireScope(req, res, 'admin:write')) return;
    (async () => {
    try {
      const tt = await trustedTenantOrRespond(req, res);
      if (!tt) return;
      const tenantId = tt.tenantId;
      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'auth-api.ts');
      const tempFile = path.join(__dirname, `temp-auth-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify({ tenantId }), 'utf-8');

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "list" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
      try { fs.unlinkSync(tempFile); } catch {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    })();

  } else if (pathname === '/api/auth/keys' && req.method === 'POST') {
    if (!requireScope(req, res, 'admin:write')) return;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const tt = await trustedTenantOrRespond(req, res, data.tenantId);
        if (!tt) return;
        data.tenantId = tt.tenantId;

        const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
        const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
        const scriptPath = path.join(__dirname, 'src', 'web', 'auth-api.ts');
        const tempFile = path.join(__dirname, `temp-auth-${Date.now()}.json`);
        fs.writeFileSync(tempFile, JSON.stringify(data), 'utf-8');

        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "create" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
        try { fs.unlinkSync(tempFile); } catch {}

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(stdout);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

  } else if (pathname.startsWith('/api/auth/keys/') && req.method === 'DELETE') {
    if (!requireScope(req, res, 'admin:write')) return;
    try {
      const keyId = pathname.split('/api/auth/keys/')[1];
      if (!keyId) throw new Error('Key ID required');

      let keyHashToEvict = null;
      try {
        const prisma = await getPrisma();
        const row = await prisma.apiKey.findUnique({ where: { id: keyId }, select: { keyHash: true } });
        keyHashToEvict = row?.keyHash || null;
      } catch {
        /* best-effort */
      }

      const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
      const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
      const scriptPath = path.join(__dirname, 'src', 'web', 'auth-api.ts');
      const tempFile = path.join(__dirname, `temp-auth-${Date.now()}.json`);
      fs.writeFileSync(tempFile, JSON.stringify({ id: keyId }), 'utf-8');

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync(`${tsxCmd} "${scriptPath}" "revoke" "${tempFile}"`, { cwd: __dirname, timeout: 15000 });
      try { fs.unlinkSync(tempFile); } catch {}

      try {
        const am = await loadAuthWebModule();
        if (keyHashToEvict && typeof am.invalidateApiKeyCacheByHash === 'function') {
          am.invalidateApiKeyCacheByHash(keyHashToEvict);
        } else if (typeof am.cacheClear === 'function') {
          am.cacheClear();
        }
      } catch (_) { /* ignore */ }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(stdout);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }

  } else if (pathname === '/api/auth/whoami' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ identity: req.auth || null, authMode: AUTH_MODE }));

  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Инициализация observability при старте сервера
async function initializeServerObservability() {
  try {
    // Динамический импорт для ES модулей
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Запускаем инициализацию observability через tsx
    const tsxPath = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
    const tsxCmd = fs.existsSync(tsxPath) ? `"${tsxPath}"` : 'npx tsx';
    const initScript = path.join(__dirname, 'src', 'observability', 'init-server.ts');
    
    // Создаем простой скрипт инициализации
    if (!fs.existsSync(initScript)) {
      const initScriptContent = `
import { initializeObservability } from './index';

initializeObservability({
  serviceName: 'scenario-builder-server',
  enabled: process.env.OTEL_ENABLED !== 'false',
}).catch(console.error);
`;
      fs.writeFileSync(initScript, initScriptContent, 'utf-8');
    }
    
    // Запускаем инициализацию в фоне
    execAsync(`${tsxCmd} "${initScript}"`, { cwd: __dirname }).catch(() => {
      // Игнорируем ошибки - observability не критичен для работы сервера
      console.log('Observability initialization skipped');
    });
  } catch (error) {
    console.log('Observability initialization skipped:', error.message);
  }
}

// WebSocket: поток обновлений для admin-runs (subscribe → сервер опрашивает те же REST API)
let adminRunsWss = null;
try {
  const { WebSocketServer, WebSocket } = require('ws');
  adminRunsWss = new WebSocketServer({ noServer: true });
  adminRunsWss.on('connection', (ws) => {
    const state = {
      executionId: '',
      tenantId: 'default',
      fastPoll: true,
      livePanels: true
    };
    let tickTimer = null;
    function clearTick() {
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
    }
    function scheduleTick(ms) {
      clearTick();
      tickTimer = setTimeout(runTick, ms);
    }
    function lifecycleActive(ls) {
      return ls === 'running' || ls === 'pending';
    }
    async function runTick() {
      clearTick();
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const id = state.executionId;
      if (!id) {
        scheduleTick(4000);
        return;
      }
      const base = `http://127.0.0.1:${PORT}`;
      const headers = { 'X-Tenant-ID': state.tenantId };
      const enc = encodeURIComponent(id);
      try {
        const opts = { headers };
        const [uRes, exRes, evRes] = await Promise.all([
          fetch(`${base}/api/executions/${enc}/unified-status`, opts),
          fetch(`${base}/api/executions/${enc}`, opts),
          fetch(`${base}/api/executions/${enc}/events`, opts)
        ]);
        const [uText, exText, evText] = await Promise.all([uRes.text(), exRes.text(), evRes.text()]);
        function parseMaybe(t) {
          try {
            return JSON.parse(t);
          } catch {
            return { _parseError: true, _rawSnippet: t.slice(0, 200) };
          }
        }
        const uData = parseMaybe(uText);
        const exData = parseMaybe(exText);
        const evData = parseMaybe(evText);
        let ls = '';
        if (uData && uData.success && uData.unifiedStatus && uData.unifiedStatus.lifecycleStatus) {
          ls = uData.unifiedStatus.lifecycleStatus;
        }
        ws.send(
          JSON.stringify({
            type: 'tick',
            unified: { ok: uRes.ok, status: uRes.status, data: uData },
            execution: { ok: exRes.ok, status: exRes.status, data: exData },
            events: { ok: evRes.ok, status: evRes.status, data: evData },
            lifecycleStatus: ls
          })
        );
        let delay = 5000;
        if (lifecycleActive(ls)) {
          delay = state.fastPoll ? 1500 : 2000;
        }
        scheduleTick(delay);
      } catch (e) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: e instanceof Error ? e.message : String(e)
          })
        );
        scheduleTick(5000);
      }
    }
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type !== 'subscribe') {
        return;
      }
      const ex = String(msg.executionId || '').trim().slice(0, 256);
      const ten = String(msg.tenant || msg.tenantId || 'default').trim();
      state.executionId = ex;
      if (!ten || !/^[a-zA-Z0-9._-]{1,64}$/.test(ten)) {
        state.tenantId = 'default';
      } else {
        state.tenantId = ten;
      }
      state.fastPoll = msg.fastPoll !== false && msg.fastPoll !== 'false';
      state.livePanels = msg.livePanels !== false && msg.livePanels !== 'false';
      scheduleTick(80);
    });
    ws.on('close', () => clearTick());
    ws.on('error', () => clearTick());
  });

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host || '127.0.0.1';
    let pathname = '';
    try {
      pathname = new URL(request.url || '/', `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws/admin-runs') {
      socket.destroy();
      return;
    }
    adminRunsWss.handleUpgrade(request, socket, head, (ws) => {
      adminRunsWss.emit('connection', ws, request);
    });
  });
} catch (e) {
  console.warn('[ws] пакет ws не установлен, /ws/admin-runs отключён:', e.message);
}

server.listen(PORT, '0.0.0.0', async () => {
  // Инициализируем observability при старте
  await initializeServerObservability();
  console.log('========================================');
  console.log('🚀 Веб-сервер запущен!');
  console.log('========================================');
  console.log('📱 Откройте в браузере:');
  console.log('   http://localhost:' + PORT + '  ← точка входа (редирект в админку)');
  console.log('   http://localhost:' + PORT + '/admin  ← админский интерфейс');
  console.log('   http://localhost:' + PORT + '/admin-dashboard.html');
  console.log('   http://localhost:' + PORT + '/dashboard.html  (legacy: /legacy-dashboard)');
  console.log('   http://localhost:' + PORT + '/test-agent.html');
  console.log('   http://localhost:' + PORT + '/test-orchestrator.html');
  console.log('   http://localhost:' + PORT + '/test-event-bus.html');
  console.log('   http://localhost:' + PORT + '/observability-dashboard.html');
  console.log('');
  console.log('📡 API Endpoints:');
  console.log('   GET  /api/eval/cases - список eval-кейсов');
  console.log('   GET  /api/eval/cases/:id - получить eval-кейс');
  console.log('   GET  /api/eval/search - поиск eval-кейсов');
  console.log('   POST /api/eval/cases/run - запустить eval-кейс');
  console.log('   POST /api/eval/suite - запустить набор eval-кейсов');
  console.log('   GET  /api/templates - список шаблонов');
  console.log('   GET  /api/templates/:id - получить шаблон');
  console.log('   GET  /api/templates/search - поиск шаблонов');
  console.log('   POST /api/templates/:id/apply - применить шаблон');
  console.log('   GET  /api/scenarios - список сценариев');
  console.log('   POST /api/scenarios - создать сценарий');
  console.log('   GET  /api/scenarios/:id - получить сценарий');
  console.log('   GET  /api/executions?limit=40&scenarioId=… - последние выполнения из БД (заголовок X-Tenant-ID)');
  console.log('   GET  /api/executions/:id - получить выполнение');
  console.log('   GET  /api/executions/:id/unified-status - единый статус (БД + Temporal)');
  console.log('   WS   /ws/admin-runs - live-обновления для admin-runs (при установленном пакете ws)');
  console.log('   http://localhost:' + PORT + '/admin-runs.html - трекер выполнений (UI)');
  console.log('   http://localhost:' + PORT + '/admin-spec-studio.html - конструктор Scenario Spec (форма + JSON)');
  console.log('   GET  /api/queues - список очередей');
  console.log('   POST /api/queues - создать очередь');
  console.log('   GET  /api/queues/:id - получить очередь');
  console.log('   POST /api/queues/:id/triggers - добавить триггер');
  console.log('   POST /api/queues/:id/jobs - добавить задание');
  console.log('   GET  /api/audit/export - экспорт аудит-лога (json/csv/ndjson)');
  console.log('   POST /api/audit/cleanup - очистка старых аудит-записей');
  console.log('   GET  /api/auth/whoami - текущая идентификация');
  console.log('   GET  /api/auth/keys - список API-ключей');
  console.log('   POST /api/auth/keys - создать API-ключ');
  console.log('   DELETE /api/auth/keys/:id - отозвать API-ключ');
  console.log('   GET  /api/quotas?orgId=… — лимиты (QuotaConfig)');
  console.log('   POST /api/quotas — upsert лимита');
  console.log('   DELETE /api/quotas?id=… — удалить лимит');
  console.log('   GET  /api/deployment/operator — canary / lane (Configuration)');
  console.log('   PATCH /api/deployment/operator — обновить canary / lane');
  console.log('');
  console.log('🔑 Auth mode: ' + AUTH_MODE + (ADMIN_PASSWORD ? ' (admin password set)' : ''));
  console.log('   См. API_DOCUMENTATION.md для полной документации');
  console.log('========================================');
  console.log('⏹️  Для остановки: Ctrl+C');
  console.log('========================================');

  // --- Startup validation ---
  if (AUTH_MODE !== 'off' && !ADMIN_PASSWORD) {
    console.warn('⚠️  AUTH_MODE=' + AUTH_MODE + ' but ADMIN_PASSWORD is not set. Bootstrap API keys via DB seed.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.OPA_FAIL_OPEN === 'true') {
    console.warn('⚠️  OPA_FAIL_OPEN=true in production — policy violations will be silently allowed!');
  }
  if (process.env.NODE_ENV === 'production' && AUTH_MODE === 'off') {
    console.warn('⚠️  AUTH_MODE=off in production — all API endpoints are publicly accessible!');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ Порт ' + PORT + ' уже занят!');
    console.log('Попробуйте изменить PORT в server.js');
  } else {
    console.error('❌ Ошибка сервера:', err.message);
  }
});
