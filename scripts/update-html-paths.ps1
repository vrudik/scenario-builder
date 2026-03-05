# Скрипт для обновления путей в HTML файлах

Write-Host "Updating paths in HTML files..." -ForegroundColor Green

$adminFiles = Get-ChildItem -Path "web\admin" -Filter "*.html"
$testFiles = Get-ChildItem -Path "web\test" -Filter "*.html"

# Обновляем admin файлы
foreach ($file in $adminFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Обновляем ссылки на CSS и JS
    $content = $content -replace 'href="admin-styles.css"', 'href="/admin-styles.css"'
    $content = $content -replace 'src="admin-common.js"', 'src="/admin-common.js"'
    
    # Обновляем ссылки на admin страницы
    $content = $content -replace 'href="admin-([^"]+)"', 'href="/admin-$1"'
    
    # Обновляем ссылки на test страницы
    $content = $content -replace 'href="test-([^"]+)"', 'href="/test-$1"'
    
    # Обновляем ссылки на dashboard
    $content = $content -replace 'href="dashboard.html"', 'href="/dashboard.html"'
    $content = $content -replace 'href="observability-dashboard.html"', 'href="/observability-dashboard.html"'
    
    Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
    Write-Host "Updated: $($file.Name)" -ForegroundColor Gray
}

# Обновляем test файлы
foreach ($file in $testFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    # Обновляем ссылки на admin-dashboard
    $content = $content -replace 'href="admin-dashboard.html"', 'href="/admin-dashboard.html"'
    $content = $content -replace 'href="dashboard.html"', 'href="/dashboard.html"'
    
    Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
    Write-Host "Updated: $($file.Name)" -ForegroundColor Gray
}

Write-Host "`nDone!" -ForegroundColor Green
