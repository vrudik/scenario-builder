# 🌐 Инструкция по запуску веб-интерфейса

## Два варианта сервера

| Команда | Файл | Назначение |
|--------|------|------------|
| `npm run web` | `src/web/server.ts` | Лёгкий сервер: главная, админка, demo-e2e, статика, API-заглушки |
| `node server.cjs` | `server.cjs` | Полный сервер: Agent Runtime, сценарии, очереди, eval, БД, все API |

Для теста агента на `/test-agent.html` нужен **node server.cjs**. При `npm run web` страница покажет подсказку «Запустите node server.cjs».

## Быстрый запуск

### Вариант 1: Лёгкий сервер (рекомендуется для разработки UI)

```bash
npm run web
```

Порт по умолчанию **3000**. Задать другой порт:

- **PowerShell:** `$env:PORT=3001; npm run web`
- **Linux/macOS:** `PORT=3001 npm run web`

### Вариант 2: Полный сервер (агент, сценарии, очереди)

```bash
node server.cjs
```

Сервер слушает порт 3000 и выводит в консоль список URL.

### Вариант 3: Через PowerShell скрипт (Windows)

```powershell
.\start-web.ps1
```

## Главная страница

После запуска откройте **http://localhost:3000** (или http://localhost:PORT).

На главной две кнопки:

- **Админский интерфейс** → `/admin-dashboard.html`
- **Демо сквозного теста** → `/demo-e2e.html`

## Основные страницы

- `/` — главная (точка входа)
- `/admin-dashboard.html` — админ-дашборд
- `/admin-testing.html` — eval-кейсы
- `/admin-templates.html` — шаблоны сценариев
- `/admin-scenarios.html` — сценарии
- `/admin-monitoring.html` — мониторинг
- `/demo-e2e.html` — демо сквозного теста
- `/test-agent.html` — тест Agent Runtime (полный функционал при `node server.cjs`)
- `/observability-dashboard.html` — observability

## Если порт 3000 занят

1. Освободить порт (PowerShell):
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
   ```

2. Либо запустить на другом порту:
   ```powershell
   $env:PORT=3001; npm run web
   ```
   Затем открыть http://localhost:3001

## Зависимости

```bash
npm install
```

Для полного сервера (`node server.cjs`) могут понадобиться БД (Prisma), Ollama (для агента) и т.д. — см. документацию по компонентам.
