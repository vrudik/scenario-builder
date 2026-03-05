@echo off
chcp 65001 >nul
echo ========================================
echo   Перенос проекта
echo ========================================
echo.
echo Текущий путь: %~dp0
echo.
echo Создаю копию проекта в C:\scenario-builder
echo.

set "SOURCE=%~dp0"
set "DEST=C:\scenario-builder"

if exist "%DEST%" (
    echo [WARNING] Папка %DEST% уже существует!
    echo Удалить существующую папку? (Y/N)
    set /p choice=
    if /i "%choice%"=="Y" (
        rmdir /S /Q "%DEST%"
    ) else (
        echo Отмена операции
        pause
        exit /b
    )
)

echo Копирование файлов...
xcopy /E /I /Y "%SOURCE%" "%DEST%"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   ✅ Проект успешно скопирован!
    echo ========================================
    echo.
    echo Новый путь: %DEST%
    echo.
    echo Перейдите в новую папку и запустите:
    echo   cd %DEST%
    echo   node server.js
    echo.
    echo Откройте в браузере:
    echo   http://localhost:3000/test-agent.html
    echo.
) else (
    echo.
    echo ❌ Ошибка копирования
    echo Попробуйте скопировать вручную через проводник
)

pause
