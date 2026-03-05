# Скрипт установки и запуска
Set-Location $PSScriptRoot

Write-Host "📦 Шаг 1: Установка зависимостей..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка установки зависимостей" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Зависимости установлены" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Шаг 2: Запуск веб-сервера..." -ForegroundColor Yellow
Write-Host "Откройте браузер: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx tsx src/web/simple-server.ts"

Start-Sleep -Seconds 2

Write-Host "🧪 Шаг 3: Запуск тестов с UI..." -ForegroundColor Yellow
Write-Host "Vitest UI откроется автоматически" -ForegroundColor Cyan
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run test:ui"

Write-Host "✅ Оба сервера запущены в отдельных окнах" -ForegroundColor Green
Write-Host "Нажмите любую клавишу для выхода..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
