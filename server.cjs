// Простой веб-сервер для просмотра статуса проекта
const http = require('http');
const fs = require('fs');
const path = require('path');

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
  if (pathname.startsWith('/admin-')) {
    console.log('[DEBUG] Admin page request:', pathname);
  }

  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else if (pathname.startsWith('/admin-') && pathname.endsWith('.html')) {
    // Отдача админ-страниц (проверяем раньше других маршрутов)
    try {
      // Убираем начальный слэш для правильного формирования пути
      const fileName = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      const adminPagePath = path.join(__dirname, fileName);
      console.log('[DEBUG] Trying to load admin page:', adminPagePath);
      if (fs.existsSync(adminPagePath)) {
        const adminPage = fs.readFileSync(adminPagePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(adminPage);
      } else {
        console.log('[DEBUG] Admin page not found:', adminPagePath);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Admin page not found: ' + pathname + ' (tried: ' + adminPagePath + ')');
      }
    } catch (error) {
      console.error('[DEBUG] Error loading admin page:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading admin page: ' + error.message);
    }
  } else if (pathname === '/test-agent.html' || pathname === '/test-agent') {
    // Отдача тестовой страницы
    try {
      const testPagePath = path.join(__dirname, 'test-agent.html');
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
    // Отдача страницы тестирования Orchestrator
    try {
      const testPagePath = path.join(__dirname, 'test-orchestrator.html');
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
    // Отдача страницы тестирования Event Bus
    try {
      const testPagePath = path.join(__dirname, 'test-event-bus.html');
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
    // Отдача общих ресурсов админ-панели
    try {
      // Убираем начальный слэш для правильного формирования пути
      const fileName = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      const resourcePath = path.join(__dirname, fileName);
      if (fs.existsSync(resourcePath)) {
        const content = fs.readFileSync(resourcePath, 'utf-8');
        const contentType = pathname.endsWith('.css') ? 'text/css' : 'application/javascript';
        res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
        res.end(content);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Resource not found: ' + pathname + ' (tried: ' + resourcePath + ')');
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading resource: ' + error.message);
    }
  } else if (pathname === '/observability-dashboard.html' || pathname === '/observability') {
    // Отдача observability dashboard
    try {
      const dashboardPath = path.join(__dirname, 'observability-dashboard.html');
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
    // Отдача dashboard
    try {
      const dashboardPath = path.join(__dirname, 'dashboard.html');
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
  console.log('   http://localhost:' + PORT);
  console.log('   http://localhost:' + PORT + '/admin-dashboard.html  ⭐ НОВЫЙ Admin Dashboard');
  console.log('   http://localhost:' + PORT + '/dashboard.html');
  console.log('   http://localhost:' + PORT + '/test-agent.html');
  console.log('   http://localhost:' + PORT + '/test-orchestrator.html');
  console.log('   http://localhost:' + PORT + '/test-event-bus.html');
  console.log('   http://localhost:' + PORT + '/observability-dashboard.html');
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
