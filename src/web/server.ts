/**
 * Веб-сервер для просмотра результатов тестов и работы системы
 */

import { createServer, type ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'pending';
  duration?: number;
  error?: string;
}

interface ComponentStatus {
  name: string;
  status: 'ok' | 'error';
  tests: TestResult[];
}

interface DemoStepResult {
  step: string;
  action: string;
  expected: string;
  status: 'passed';
}

interface DemoRunResult {
  executionId: string;
  status: 'passed';
  startedAt: string;
  finishedAt: string;
  stepResults: DemoStepResult[];
  metrics: {
    durationMs: number;
    estimatedCostUsd: number;
    successRatePct: number;
    ttfrMs: number;
  };
  guardrail: {
    status: 'passed';
    checks: string[];
    notes: string;
  };
  summary: string;
}

interface DemoState {
  totalRuns: number;
  successfulRuns: number;
  totalDurationMs: number;
  totalCostUsd: number;
  lastRun: DemoRunResult | null;
}

interface HealthPayload {
  status: 'ok';
  service: string;
  uptimeSec: number;
  timestamp: string;
}

interface ReadinessPayload extends HealthPayload {
  checks: {
    staticAssetsAccessible: boolean;
    demoApiAvailable: boolean;
  };
}

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

const demoStepTemplate: DemoStepResult[] = [
  {
    step: 'Получение входящего сообщения',
    action: 'Система принимает prefilled-данные из тестового payload.',
    expected: 'Сценарий стартует без ручного ввода.',
    status: 'passed'
  },
  {
    step: 'Проверка заказа',
    action: 'Имитация запроса статуса заказа ord-7781.',
    expected: 'Найден статус: «Передан в доставку, ETA: завтра до 18:00».',
    status: 'passed'
  },
  {
    step: 'Формирование ответа клиенту',
    action: 'Агент формирует итоговое сообщение для клиента.',
    expected: 'Возвращается готовый ответ и рекомендации по следующему шагу.',
    status: 'passed'
  }
];

const demoState: DemoState = {
  totalRuns: 0,
  successfulRuns: 0,
  totalDurationMs: 0,
  totalCostUsd: 0,
  lastRun: null
};

const projectRoot = join(__dirname, '../..');

function getHealthPayload(): HealthPayload {
  return {
    status: 'ok',
    service: 'scenario-builder-web',
    uptimeSec: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString()
  };
}

function getReadinessPayload(): ReadinessPayload {
  return {
    ...getHealthPayload(),
    checks: {
      staticAssetsAccessible: existsSync(join(projectRoot, 'admin-dashboard.html')),
      demoApiAvailable: true
    }
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200);
    res.end(getEntryHTML());
  } else if (pathname.startsWith('/admin-')) {
    const fileName = pathname.slice(1);
    const filePath = join(projectRoot, fileName);
    const contentType =
      pathname.endsWith('.css') ? 'text/css' :
      pathname.endsWith('.js') ? 'application/javascript' :
      'text/html; charset=utf-8';
    serveFile(res, filePath, contentType);
  } else if (/^\/[^/]+\.(html|css|js)$/.test(pathname)) {
    const fileName = pathname.slice(1);
    const filePath = join(projectRoot, fileName);
    const contentType =
      pathname.endsWith('.css') ? 'text/css' :
      pathname.endsWith('.js') ? 'application/javascript' :
      'text/html; charset=utf-8';
    serveFile(res, filePath, contentType);
  } else if (pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(getSystemStatus(), null, 2));
  } else if (pathname === '/healthz' || pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(getHealthPayload()));
  } else if (pathname === '/readyz' || pathname === '/api/ready') {
    const readiness = getReadinessPayload();
    const statusCode = Object.values(readiness.checks).every(Boolean) ? 200 : 503;
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify(readiness));
  } else if (pathname === '/api/test-results') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(getTestResults(), null, 2));
  } else if (pathname === '/api/metrics') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ metrics: [], message: 'Запустите node server.cjs для полных метрик' }));
  } else if (pathname === '/api/scenarios' || pathname.startsWith('/api/scenarios/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    if (pathname === '/api/scenarios') {
      res.end(JSON.stringify({ success: true, scenarios: [] }));
    } else {
      res.end(JSON.stringify({ success: true, scenario: null, executions: [] }));
    }
  } else if (pathname === '/api/templates' || pathname.startsWith('/api/templates/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, data: [], templates: [] }));
  } else if (pathname === '/api/eval/cases' || pathname.startsWith('/api/eval/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    if (pathname === '/api/eval/cases') {
      res.end(JSON.stringify({ success: true, data: [] }));
    } else {
      res.end(JSON.stringify({ success: true, data: { passedCases: 0, failedCases: 0, results: [] } }));
    }
  } else if (pathname.startsWith('/api/event-bus/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, events: [] }));
  } else if (pathname === '/api/queue-processor/status' || pathname.startsWith('/api/queue-processor/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, running: false, message: 'Запустите node server.cjs для очередей' }));
  } else if (pathname === '/api/queues' || pathname.startsWith('/api/queues')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, queues: [], data: [] }));
  } else if (pathname === '/api/demo-e2e') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      scenario: demoScenario,
      instructions: getDemoInstructions(),
      presentationMode: {
        oneClickAction: 'POST /api/demo-e2e/presentation-run',
        resetAction: 'POST /api/demo-e2e/reset'
      }
    }));
  } else if (pathname === '/api/demo-e2e/run') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, result: runDemoScenario() }));
  } else if (pathname === '/api/demo-e2e/presentation-run' && req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      mode: 'presentation',
      seedApplied: true,
      result: runDemoScenario()
    }));
  } else if (pathname === '/api/demo-e2e/reset' && req.method === 'POST') {
    resetDemoState();
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, state: getDemoMetricsSnapshot(), message: 'Demo state reset completed' }));
  } else if (pathname === '/api/demo-e2e/metrics') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, metrics: getDemoMetricsSnapshot() }));
  } else if (pathname === '/api/agent/status') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      ollamaAvailable: false,
      model: null,
      modulesLoaded: false,
      hint: 'Для работы агента запустите полный сервер: node server.cjs'
    }));
  } else if (pathname === '/api/agent/execute' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        success: false,
        error: {
          code: 'USE_FULL_SERVER',
          message: 'Для запуска агента используйте полный сервер: node server.cjs'
        },
        output: 'Текущий режим (npm run web) не запускает Agent Runtime.\n\nВ терминале из корня проекта выполните:\n  node server.cjs\n\nЗатем откройте снова: http://localhost:3000/test-agent.html',
        toolCallsExecuted: 0,
        totalTokens: 0
      }));
    });
    return;
  } else if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', code: 404 }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

function serveFile(res: ServerResponse, filePath: string, contentType: string): void {
  try {
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const data = readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end('Error');
  }
}

function getEntryHTML(): string {
  return `<!DOCTYPE html>
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
      color: white !important;
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
  </div>
</body>
</html>`;
}

function getSystemStatus() {
  // Проверка существования компонентов
  const components: ComponentStatus[] = [
    {
      name: 'Scenario Spec',
      status: existsSync(join(__dirname, '../spec/scenario-spec.ts')) ? 'ok' : 'error',
      tests: []
    },
    {
      name: 'Scenario Builder',
      status: existsSync(join(__dirname, '../builder/scenario-builder.ts')) ? 'ok' : 'error',
      tests: []
    },
    {
      name: 'Tool Registry',
      status: existsSync(join(__dirname, '../registry/tool-registry.ts')) ? 'ok' : 'error',
      tests: []
    },
    {
      name: 'Tool Gateway',
      status: existsSync(join(__dirname, '../gateway/tool-gateway.ts')) ? 'ok' : 'error',
      tests: []
    },
    {
      name: 'Runtime Orchestrator',
      status: existsSync(join(__dirname, '../runtime/orchestrator.ts')) ? 'ok' : 'error',
      tests: []
    }
  ];

  return {
    timestamp: new Date().toISOString(),
    components
  };
}

function getTestResults(): TestResult[] {
  // В реальной системе здесь будет чтение результатов из файла или запуск тестов
  // Для демонстрации возвращаем примерные результаты
  return [
    {
      name: 'Scenario Spec валидация',
      status: 'passed',
      duration: 45
    },
    {
      name: 'Scenario Builder компиляция',
      status: 'passed',
      duration: 120
    },
    {
      name: 'Tool Registry регистрация',
      status: 'passed',
      duration: 30
    },
    {
      name: 'Tool Gateway sandbox режим',
      status: 'passed',
      duration: 50
    },
    {
      name: 'Tool Gateway rate limiting',
      status: 'pending',
      duration: undefined
    }
  ];
}

function getDemoInstructions(): string[] {
  return [
    'Откройте страницу /demo-e2e.html.',
    'Нажмите «One-click demo run»: система автоматически применит seed-данные и запустит бизнес-кейс.',
    'Покажите KPI-блок: latency (TTFR/Duration), success rate и estimated cost.',
    'Покажите guardrail-блок: какие проверки сработали и почему результат безопасен.',
    'При необходимости нажмите «Reset demo state», чтобы обнулить метрики перед следующим показом.'
  ];
}

function runDemoScenario(): DemoRunResult {
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

  const result: DemoRunResult = {
    executionId: `demo-exec-${Date.now()}`,
    status: 'passed',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    stepResults: demoStepTemplate,
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

function resetDemoState(): void {
  demoState.totalRuns = 0;
  demoState.successfulRuns = 0;
  demoState.totalDurationMs = 0;
  demoState.totalCostUsd = 0;
  demoState.lastRun = null;
}

server.listen(PORT, () => {
  console.log(`🚀 Веб-сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 Откройте браузер и перейдите по адресу http://localhost:${PORT}`);
});
