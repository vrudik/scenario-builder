# Полный скрипт рефакторинга: перемещение файлов и обновление путей

$ErrorActionPreference = 'Stop'

Write-Host "=== Complete Refactoring Script ===" -ForegroundColor Cyan
Write-Host ""

# 1. Создаем структуру директорий
Write-Host "1. Creating directory structure..." -ForegroundColor Green
$dirs = @(
    "web\admin",
    "web\test",
    "scripts\server",
    "scripts\test",
    "scripts\setup",
    "docs\api",
    "docs\setup",
    "docs\guides"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  Created: $dir" -ForegroundColor Gray
    }
}

# 2. Перемещаем admin файлы
Write-Host "`n2. Moving admin files..." -ForegroundColor Green
$adminFiles = @(
    "admin-dashboard.html",
    "admin-components.html",
    "admin-config.html",
    "admin-monitoring.html",
    "admin-scenarios.html",
    "admin-testing.html",
    "admin-styles.css",
    "admin-common.js"
)

foreach ($file in $adminFiles) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "web\admin\" -Force -ErrorAction SilentlyContinue
        Write-Host "  Moved: $file" -ForegroundColor Gray
    }
}

# 3. Перемещаем test файлы
Write-Host "`n3. Moving test files..." -ForegroundColor Green
$testFiles = @(
    "test-agent.html",
    "test-orchestrator.html",
    "test-event-bus.html"
)

foreach ($file in $testFiles) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "web\test\" -Force -ErrorAction SilentlyContinue
        Write-Host "  Moved: $file" -ForegroundColor Gray
    }
}

# 4. Перемещаем dashboard файлы
Write-Host "`n4. Moving dashboard files..." -ForegroundColor Green
if (Test-Path "dashboard.html") {
    Move-Item -Path "dashboard.html" -Destination "web\" -Force -ErrorAction SilentlyContinue
    Write-Host "  Moved: dashboard.html" -ForegroundColor Gray
}
if (Test-Path "observability-dashboard.html") {
    Move-Item -Path "observability-dashboard.html" -Destination "web\" -Force -ErrorAction SilentlyContinue
    Write-Host "  Moved: observability-dashboard.html" -ForegroundColor Gray
}

# 5. Обновляем пути в HTML файлах
Write-Host "`n5. Updating paths in HTML files..." -ForegroundColor Green

$adminHtmlFiles = Get-ChildItem -Path "web\admin" -Filter "*.html" -ErrorAction SilentlyContinue
foreach ($file in $adminHtmlFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Обновляем ссылки на CSS и JS
    $content = $content -replace 'href="admin-styles\.css"', 'href="/admin-styles.css"'
    $content = $content -replace 'src="admin-common\.js"', 'src="/admin-common.js"'
    
    # Обновляем ссылки на admin страницы (но не в href="/admin-...")
    $content = $content -replace 'href="admin-([^"/"]+)"', 'href="/admin-$1"'
    
    # Обновляем ссылки на test страницы
    $content = $content -replace 'href="test-([^"/"]+)"', 'href="/test-$1"'
    
    # Обновляем ссылки на dashboard
    $content = $content -replace 'href="dashboard\.html"', 'href="/dashboard.html"'
    $content = $content -replace 'href="observability-dashboard\.html"', 'href="/observability-dashboard.html"'
    
    Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
    Write-Host "  Updated: $($file.Name)" -ForegroundColor Gray
}

$testHtmlFiles = Get-ChildItem -Path "web\test" -Filter "*.html" -ErrorAction SilentlyContinue
foreach ($file in $testHtmlFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Обновляем ссылки на admin-dashboard
    $content = $content -replace 'href="admin-dashboard\.html"', 'href="/admin-dashboard.html"'
    $content = $content -replace 'href="dashboard\.html"', 'href="/dashboard.html"'
    
    Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
    Write-Host "  Updated: $($file.Name)" -ForegroundColor Gray
}

Write-Host "`n=== Refactoring Complete! ===" -ForegroundColor Cyan
Write-Host "Next: Run 'npm test' to verify everything works" -ForegroundColor Yellow
