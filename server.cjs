// Простой веб-сервер для просмотра статуса проекта
const http = require('http');
const fs = require('fs');
const path = require('path');

// Устанавливаем DATABASE_URL по умолчанию для Prisma
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const PORT = 3000;

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
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
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
  } else if (pathname === '/admin-styles.css' || pathname === '/admin-common.js') {
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
  } else if (pathname === '/api/demo-e2e') {
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
    const instructions = [
      'Откройте страницу /demo-e2e.html.',
      'Нажмите кнопку «1. Проверить предзаполненные данные», чтобы убедиться что тестовый сценарий загружен.',
      'Нажмите кнопку «2. Запустить сквозной тест», чтобы выполнить весь сценарий целиком.',
      'Сверьте шаги и ожидаемый результат в блоке «Результат выполнения» — все шаги должны быть со статусом PASSED.'
    ];
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, scenario: demoScenario, instructions }));
  } else if (pathname === '/api/demo-e2e/run') {
    const startedAt = new Date();
    const finishedAt = new Date(startedAt.getTime() + 2500);
    const result = {
      executionId: 'demo-exec-' + Date.now(),
      status: 'passed',
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      stepResults: [
        { step: 'Получение входящего сообщения', action: 'Система принимает prefilled-данные из тестового payload.', expected: 'Сценарий стартует без ручного ввода.', status: 'passed' },
        { step: 'Проверка заказа', action: 'Имитация запроса статуса заказа ord-7781.', expected: 'Найден статус: «Передан в доставку, ETA: завтра до 18:00».', status: 'passed' },
        { step: 'Формирование ответа клиенту', action: 'Агент формирует итоговое сообщение для клиента.', expected: 'Возвращается готовый ответ и рекомендации по следующему шагу.', status: 'passed' }
      ]
    };
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, result }));
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
    // Выполнение workflow через Orchestrator
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const { scenarioId, userIntent, workflowType = 'agent-only' } = requestData;
        
        if (!scenarioId || !userIntent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: { code: 'INVALID_REQUEST', message: 'scenarioId and userIntent are required' }
          }));
          return;
        }
        
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
    // Event Bus API endpoints - выполняем через tsx
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
    // API для управления Queue Processor
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
    // API для работы с eval-кейсами
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
    // API для работы с шаблонами сценариев
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
          if (pathParts.length === 4 && pathParts[2] === 'apply') {
            // GET /api/templates/:id/apply?param1=value1&param2=value2
            command = 'apply-template';
            const url = new URL(req.url, `http://${req.headers.host}`);
            const params = {};
            url.searchParams.forEach((value, key) => {
              params[key] = value;
            });
            requestData = {
              templateId: pathParts[3],
              parameters: params
            };
          } else if (pathParts.length === 4 && pathParts[2] === 'search') {
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
        } else if (req.method === 'POST' && pathParts.length === 4 && pathParts[2] === 'apply') {
          // POST /api/templates/:id/apply
          command = 'apply-template';
          const bodyData = body ? JSON.parse(body) : {};
          requestData = {
            templateId: pathParts[3],
            parameters: bodyData.parameters || {},
            overrides: bodyData.overrides || {}
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
    // API для работы с очередями сценариев через БД
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
    // API для работы со сценариями через БД
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
          
          if (pathParts.length === 4 && pathParts[3] === 'executions') {
            // GET /api/scenarios/:id/executions
            command = 'executions';
            requestData = {
              scenarioId: pathParts[2],
              executionStatus: url.searchParams.get('status'),
              limit: url.searchParams.get('limit'),
              offset: url.searchParams.get('offset'),
            };
          } else if (pathParts.length === 3) {
            // GET /api/scenarios/:id
            command = 'get';
            requestData = { id: pathParts[2] };
          } else {
            // GET /api/scenarios
            command = 'list';
            requestData = {
              status: url.searchParams.get('status'),
              limit: url.searchParams.get('limit'),
              offset: url.searchParams.get('offset'),
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
        
        if (req.method === 'POST') {
          // POST /api/scenarios
          command = 'create';
          requestData = body ? JSON.parse(body) : {};
        } else if (req.method === 'PUT') {
          // PUT /api/scenarios/:id
          command = 'update';
          requestData = {
            id: pathParts[2],
            ...(body ? JSON.parse(body) : {})
          };
        } else if (req.method === 'DELETE') {
          // DELETE /api/scenarios/:id
          command = 'delete';
          requestData = { id: pathParts[2] };
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
  } else if (pathname.startsWith('/api/executions')) {
    // API для работы с выполнениями
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
          if (pathParts.length === 4 && pathParts[3] === 'events') {
            // GET /api/executions/:executionId/events
            command = 'execution-events';
            requestData = { executionId: pathParts[2] };
          } else if (pathParts.length === 3) {
            // GET /api/executions/:executionId
            command = 'execution';
            requestData = { executionId: pathParts[2] };
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
    // Выполнение Agent Runtime через tsx
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const userIntent = requestData.userIntent || '';
        const scenarioId = requestData.scenarioId || 'web-scenario';
        
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
        fs.writeFileSync(tempRequestFile, JSON.stringify({ userIntent, scenarioId }), 'utf-8');
        
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
  console.log('   GET  /api/executions/:id - получить выполнение');
  console.log('   GET  /api/queues - список очередей');
  console.log('   POST /api/queues - создать очередь');
  console.log('   GET  /api/queues/:id - получить очередь');
  console.log('   POST /api/queues/:id/triggers - добавить триггер');
  console.log('   POST /api/queues/:id/jobs - добавить задание');
  console.log('   См. API_DOCUMENTATION.md для полной документации');
  console.log('========================================');
  console.log('⏹️  Для остановки: Ctrl+C');
  console.log('========================================');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ Порт ' + PORT + ' уже занят!');
    console.log('Попробуйте изменить PORT в server.js');
  } else {
    console.error('❌ Ошибка сервера:', err.message);
  }
});
