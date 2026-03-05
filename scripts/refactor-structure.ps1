# Скрипт для рефакторинга структуры проекта

Write-Host "Creating directory structure..." -ForegroundColor Green

# Создаем директории
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
        Write-Host "Created: $dir" -ForegroundColor Gray
    }
}

Write-Host "`nMoving files..." -ForegroundColor Green

# Перемещаем admin файлы
$adminFiles = Get-ChildItem -Path . -Filter "admin-*" -File
foreach ($file in $adminFiles) {
    Move-Item -Path $file.FullName -Destination "web\admin\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: $($file.Name) -> web\admin\" -ForegroundColor Gray
}

# Перемещаем test файлы
$testFiles = Get-ChildItem -Path . -Filter "test-*.html" -File
foreach ($file in $testFiles) {
    Move-Item -Path $file.FullName -Destination "web\test\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: $($file.Name) -> web\test\" -ForegroundColor Gray
}

# Перемещаем dashboard файлы
if (Test-Path "dashboard.html") {
    Move-Item -Path "dashboard.html" -Destination "web\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: dashboard.html -> web\" -ForegroundColor Gray
}
if (Test-Path "observability-dashboard.html") {
    Move-Item -Path "observability-dashboard.html" -Destination "web\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: observability-dashboard.html -> web\" -ForegroundColor Gray
}

# Перемещаем скрипты сервера
$serverScripts = Get-ChildItem -Path . -Filter "start-*" -File
foreach ($file in $serverScripts) {
    Move-Item -Path $file.FullName -Destination "scripts\server\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: $($file.Name) -> scripts\server\" -ForegroundColor Gray
}

# Перемещаем тестовые скрипты
$testScripts = Get-ChildItem -Path . -Filter "test-*.bat","test-*.ps1" -File
foreach ($file in $testScripts) {
    Move-Item -Path $file.FullName -Destination "scripts\test\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: $($file.Name) -> scripts\test\" -ForegroundColor Gray
}

# Перемещаем setup скрипты
$setupFiles = @("install.ps1", "setup-and-run.ps1")
foreach ($file in $setupFiles) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "scripts\setup\" -Force -ErrorAction SilentlyContinue
        Write-Host "Moved: $file -> scripts\setup\" -ForegroundColor Gray
    }
}

# Перемещаем документацию API
if (Test-Path "API_DOCUMENTATION.md") {
    Move-Item -Path "API_DOCUMENTATION.md" -Destination "docs\api\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: API_DOCUMENTATION.md -> docs\api\" -ForegroundColor Gray
}

# Перемещаем документацию setup
$setupDocs = Get-ChildItem -Path . -Filter "*_SETUP.md","*TESTING.md" -File
foreach ($file in $setupDocs) {
    Move-Item -Path $file.FullName -Destination "docs\setup\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: $($file.Name) -> docs\setup\" -ForegroundColor Gray
}

# Перемещаем гайды
$guides = Get-ChildItem -Path . -Filter "QUICK_*.md","WEB_*.md" -File
foreach ($file in $guides) {
    Move-Item -Path $file.FullName -Destination "docs\guides\" -Force -ErrorAction SilentlyContinue
    Write-Host "Moved: $($file.Name) -> docs\guides\" -ForegroundColor Gray
}

Write-Host "`nCleaning up temporary files..." -ForegroundColor Green

# Удаляем временные файлы
$tempFiles = Get-ChildItem -Path . -Filter "temp-*.json" -File
foreach ($file in $tempFiles) {
    Remove-Item -Path $file.FullName -Force -ErrorAction SilentlyContinue
    Write-Host "Removed: $($file.Name)" -ForegroundColor Gray
}

# Удаляем старые файлы
$oldFiles = @("server.js", "start-server.js", "web-server-simple.js", "test-server-simple.bat")
foreach ($file in $oldFiles) {
    if (Test-Path $file) {
        Remove-Item -Path $file -Force -ErrorAction SilentlyContinue
        Write-Host "Removed: $file" -ForegroundColor Gray
    }
}

Write-Host "`nRefactoring complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Update paths in server.cjs" -ForegroundColor White
Write-Host "2. Update paths in HTML files" -ForegroundColor White
Write-Host "3. Run tests: npm test" -ForegroundColor White
