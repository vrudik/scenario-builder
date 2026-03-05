# Скрипт для обновления всех путей в HTML файлах

Write-Host "Updating paths in all HTML files..." -ForegroundColor Green

# Функция для обновления путей в файле
function Update-HtmlPaths {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        return
    }
    
    $content = Get-Content $FilePath -Raw -Encoding UTF8
    $originalContent = $content
    
    # Обновляем ссылки на CSS и JS
    $content = $content -replace 'href="admin-styles\.css"', 'href="/admin-styles.css"'
    $content = $content -replace 'src="admin-common\.js"', 'src="/admin-common.js"'
    
    # Обновляем ссылки на admin страницы (но не те, что уже начинаются с /)
    $content = $content -replace 'href="admin-([^"/"]+)"', 'href="/admin-$1"'
    
    # Обновляем ссылки на test страницы
    $content = $content -replace 'href="test-([^"/"]+)"', 'href="/test-$1"'
    
    # Обновляем ссылки на dashboard
    $content = $content -replace 'href="dashboard\.html"', 'href="/dashboard.html"'
    $content = $content -replace 'href="observability-dashboard\.html"', 'href="/observability-dashboard.html"'
    
    if ($content -ne $originalContent) {
        Set-Content -Path $FilePath -Value $content -Encoding UTF8 -NoNewline
        Write-Host "  Updated: $FilePath" -ForegroundColor Gray
        return $true
    }
    return $false
}

# Обновляем файлы в корне
$rootHtmlFiles = Get-ChildItem -Path . -Filter "admin-*.html" -File
$updated = 0
foreach ($file in $rootHtmlFiles) {
    if (Update-HtmlPaths $file.FullName) {
        $updated++
    }
}

# Обновляем test файлы в корне
$testHtmlFiles = Get-ChildItem -Path . -Filter "test-*.html" -File
foreach ($file in $testHtmlFiles) {
    if (Update-HtmlPaths $file.FullName) {
        $updated++
    }
}

# Обновляем dashboard файлы
if (Test-Path "dashboard.html") {
    if (Update-HtmlPaths "dashboard.html") {
        $updated++
    }
}
if (Test-Path "observability-dashboard.html") {
    if (Update-HtmlPaths "observability-dashboard.html") {
        $updated++
    }
}

# Обновляем файлы в web/admin (если они там есть)
if (Test-Path "web\admin") {
    $adminFiles = Get-ChildItem -Path "web\admin" -Filter "*.html" -File
    foreach ($file in $adminFiles) {
        if (Update-HtmlPaths $file.FullName) {
            $updated++
        }
    }
}

# Обновляем файлы в web/test (если они там есть)
if (Test-Path "web\test") {
    $testFiles = Get-ChildItem -Path "web\test" -Filter "*.html" -File
    foreach ($file in $testFiles) {
        if (Update-HtmlPaths $file.FullName) {
            $updated++
        }
    }
}

Write-Host "`nUpdated $updated files" -ForegroundColor Green
