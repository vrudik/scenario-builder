@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   Запуск тестового сервера
echo ========================================
echo.
echo Текущая директория:
cd
echo.
echo Проверка файла server.cjs...
if exist "server.cjs" (
    echo [OK] server.cjs найден
) else (
    echo [ERROR] server.cjs не найден!
    echo Проверьте, что вы находитесь в правильной директории
    pause
    exit /b 1
)
echo.
echo Откройте в браузере:
echo   http://localhost:3000/test-agent.html
echo.
echo Или:
echo   http://localhost:3000/dashboard.html
echo.
echo Для остановки нажмите Ctrl+C
echo ========================================
echo.

node server.cjs

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Ошибка запуска сервера
    echo Проверьте, что Node.js установлен: node --version
    pause
)
