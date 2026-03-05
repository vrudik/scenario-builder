# Скрипт тестирования Agent Runtime с Ollama
Set-Location $PSScriptRoot

Write-Host "=== Тестирование Agent Runtime с Ollama ===" -ForegroundColor Cyan
Write-Host ""

# Проверка Ollama
Write-Host "1. Проверка Ollama..." -ForegroundColor Yellow
try {
    $ollamaPath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaPath) {
        $version = & $ollamaPath --version 2>&1
        Write-Host "   ✅ Ollama найден: $version" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Ollama не найден" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Ошибка проверки Ollama" -ForegroundColor Red
    exit 1
}

# Проверка модели
Write-Host "2. Проверка модели..." -ForegroundColor Yellow
try {
    $models = & $ollamaPath list 2>&1
    if ($models -match "llama3.2:1b") {
        Write-Host "   ✅ Модель llama3.2:1b найдена" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Модель llama3.2:1b не найдена" -ForegroundColor Yellow
        Write-Host "   Загружаю модель..." -ForegroundColor Yellow
        & $ollamaPath pull llama3.2:1b
    }
} catch {
    Write-Host "   ❌ Ошибка проверки модели" -ForegroundColor Red
}

# Запуск теста
Write-Host "3. Запуск теста Agent Runtime..." -ForegroundColor Yellow
Write-Host ""

npx tsx examples/agent-ollama-example.ts
