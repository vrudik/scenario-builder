# Скрипт запуска веб-сервера
Set-Location $PSScriptRoot

Write-Host "🚀 Запуск веб-сервера..." -ForegroundColor Green

# Проверка установки зависимостей
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Установка зависимостей..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Ошибка установки зависимостей, но продолжаем..." -ForegroundColor Yellow
    }
}

# Запуск веб-сервера
Write-Host "🌐 Запуск веб-интерфейса на http://localhost:3000" -ForegroundColor Cyan
Write-Host "📊 Откройте браузер и перейдите по адресу http://localhost:3000" -ForegroundColor Cyan
Write-Host "⏹️  Для остановки нажмите Ctrl+C" -ForegroundColor Yellow
Write-Host ""

npx tsx src/web/simple-server.ts
