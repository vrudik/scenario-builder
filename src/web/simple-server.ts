/**
 * Упрощенный веб-сервер без зависимостей
 */

import { createServer } from 'http';
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

interface ComponentStatus {
  name: string;
  status: 'ok' | 'error';
  filePath: string;
  lastModified?: string;
}

function getSystemStatus() {
  const basePath = join(__dirname, '..');
  const components: ComponentStatus[] = [
    {
      name: 'Scenario Spec',
      status: existsSync(join(basePath, 'spec/scenario-spec.ts')) ? 'ok' : 'error',
      filePath: 'src/spec/scenario-spec.ts'
    },
    {
      name: 'Scenario Builder',
      status: existsSync(join(basePath, 'builder/scenario-builder.ts')) ? 'ok' : 'error',
      filePath: 'src/builder/scenario-builder.ts'
    },
    {
      name: 'Tool Registry',
      status: existsSync(join(basePath, 'registry/tool-registry.ts')) ? 'ok' : 'error',
      filePath: 'src/registry/tool-registry.ts'
    },
    {
      name: 'Tool Gateway',
      status: existsSync(join(basePath, 'gateway/tool-gateway.ts')) ? 'ok' : 'error',
      filePath: 'src/gateway/tool-gateway.ts'
    },
    {
      name: 'Runtime Orchestrator',
      status: existsSync(join(basePath, 'runtime/orchestrator.ts')) ? 'ok' : 'error',
      filePath: 'src/runtime/orchestrator.ts'
    }
  ];

  // Добавляем информацию о времени изменения
  components.forEach(comp => {
    const fullPath = join(basePath, comp.filePath.replace('src/', ''));
    if (existsSync(fullPath)) {
      try {
        const stats = statSync(fullPath);
        comp.lastModified = stats.mtime.toISOString();
      } catch (e) {
        // Игнорируем ошибки
      }
    }
  });

  return {
    timestamp: new Date().toISOString(),
    components,
    summary: {
      total: components.length,
      ok: components.filter(c => c.status === 'ok').length,
      error: components.filter(c => c.status === 'error').length
    }
  };
}

function getTestResults() {
  // Проверяем наличие тестовых файлов
  const testFiles = [
    'tests/scenario-spec.test.ts',
    'tests/scenario-builder.test.ts',
    'tests/tool-registry.test.ts',
    'tests/tool-gateway.test.ts'
  ];

  return testFiles.map(file => ({
    name: file.replace('tests/', '').replace('.test.ts', ''),
    file: file,
    exists: existsSync(join(process.cwd(), file)),
    status: existsSync(join(process.cwd(), file)) ? 'ready' : 'missing' as 'ready' | 'missing'
  }));
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
        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transition: transform 0.3s ease;
        }
        .card:hover { transform: translateY(-5px); }
        .card h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.5em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        .status {
            display: inline-block;
            padding: 5px 15px;
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
        .refresh-btn {
            display: block;
            width: 100%;
            padding: 15px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1.1em;
            font-weight: bold;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.3s ease;
        }
        .refresh-btn:hover { background: #5568d3; }
        .loading {
            text-align: center;
            padding: 20px;
            color: white;
        }
        .spinner {
            border: 4px solid rgba(255,255,255,0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .summary {
            background: rgba(255,255,255,0.2);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            color: white;
        }
        .summary-item {
            display: inline-block;
            margin: 0 15px;
            font-size: 1.1em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Конструктор автономных сценариев</h1>
        
        <div id="summary" class="summary" style="display: none;">
            <strong>Статус системы:</strong>
            <span class="summary-item">Всего компонентов: <span id="total">0</span></span>
            <span class="summary-item">✓ Работает: <span id="ok">0</span></span>
            <span class="summary-item">✗ Ошибки: <span id="error">0</span></span>
        </div>
        
        <div id="loading" class="loading">
            <div class="spinner"></div>
            <p>Загрузка данных...</p>
        </div>
        
        <div id="dashboard" class="dashboard" style="display: none;"></div>
        
        <button class="refresh-btn" onclick="loadData()">🔄 Обновить данные</button>
    </div>
    
    <script>
        async function loadData() {
            const loading = document.getElementById('loading');
            const dashboard = document.getElementById('dashboard');
            const summary = document.getElementById('summary');
            
            loading.style.display = 'block';
            dashboard.style.display = 'none';
            summary.style.display = 'none';
            
            try {
                const [statusRes, testsRes] = await Promise.all([
                    fetch('/api/status'),
                    fetch('/api/test-results')
                ]);
                
                const status = await statusRes.json();
                const tests = await testsRes.json();
                
                renderDashboard(status, tests);
                
                document.getElementById('total').textContent = status.summary.total;
                document.getElementById('ok').textContent = status.summary.ok;
                document.getElementById('error').textContent = status.summary.error;
                
                loading.style.display = 'none';
                dashboard.style.display = 'grid';
                summary.style.display = 'block';
            } catch (error) {
                loading.innerHTML = '<p style="color: #ef4444;">Ошибка: ' + error.message + '</p>';
            }
        }
        
        function renderDashboard(status, tests) {
            const dashboard = document.getElementById('dashboard');
            dashboard.innerHTML = '';
            
            // Карточки компонентов
            status.components.forEach(comp => {
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = \`
                    <h2>\${comp.name}</h2>
                    <div class="info">Файл: <code>\${comp.filePath}</code></div>
                    \${comp.lastModified ? '<div class="info">Изменен: ' + new Date(comp.lastModified).toLocaleString('ru-RU') + '</div>' : ''}
                    <span class="status \${comp.status}">\${comp.status === 'ok' ? '✓ Работает' : '✗ Ошибка'}</span>
                \`;
                dashboard.appendChild(card);
            });
            
            // Карточка тестов
            if (tests && tests.length > 0) {
                const testCard = document.createElement('div');
                testCard.className = 'card';
                const ready = tests.filter(t => t.status === 'ready').length;
                testCard.innerHTML = \`
                    <h2>Тесты</h2>
                    <div class="info">Готово к запуску: \${ready} из \${tests.length}</div>
                    <ul style="list-style: none; margin-top: 15px;">
                        \${tests.map(t => \`
                            <li style="padding: 8px; margin: 5px 0; background: #f3f4f6; border-radius: 6px;">
                                <span class="status \${t.status}">\${t.status === 'ready' ? '✓' : '○'}</span>
                                <strong>\${t.name}</strong>
                            </li>
                        \`).join('')}
                    </ul>
                \`;
                dashboard.appendChild(testCard);
            }
        }
        
        loadData();
        setInterval(loadData, 5000);
    </script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (pathname === '/' || pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.end(HTML);
  } else if (pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(getSystemStatus(), null, 2));
  } else if (pathname === '/api/test-results') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(getTestResults(), null, 2));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Веб-сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 Откройте браузер и перейдите по адресу http://localhost:${PORT}`);
  console.log(`⏹️  Для остановки нажмите Ctrl+C`);
});
