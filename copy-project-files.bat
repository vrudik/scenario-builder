@echo off
chcp 65001 >nul
echo ========================================
echo   Копирование проекта
echo ========================================
echo.

set "SOURCE=%~dp0"
set "DEST=C:\scenario-builder"

echo Источник: %SOURCE%
echo Назначение: %DEST%
echo.

if exist "%DEST%" (
    echo [WARNING] Папка %DEST% уже существует!
    echo Удалить? (Y/N)
    set /p choice=
    if /i "%choice%"=="Y" (
        rmdir /S /Q "%DEST%"
    ) else (
        echo Отмена
        pause
        exit /b
    )
)

echo Создаю папку назначения...
mkdir "%DEST%"

echo Копирую файлы проекта...
echo.

REM Копируем только файлы проекта, исключая системные папки
xcopy "%SOURCE%*" "%DEST%\" /E /I /Y /EXCLUDE:exclude-list.txt 2>nul

REM Если exclude-list не работает, копируем основные файлы вручную
if not exist "%DEST%\package.json" (
    echo Копирую основные файлы...
    copy "%SOURCE%package.json" "%DEST%\" >nul 2>&1
    copy "%SOURCE%tsconfig.json" "%DEST%\" >nul 2>&1
    copy "%SOURCE%server.js" "%DEST%\" >nul 2>&1
    copy "%SOURCE%*.html" "%DEST%\" >nul 2>&1
    copy "%SOURCE%*.bat" "%DEST%\" >nul 2>&1
    copy "%SOURCE%*.md" "%DEST%\" >nul 2>&1
    
    REM Копируем папки
    xcopy "%SOURCE%src" "%DEST%\src\" /E /I /Y >nul 2>&1
    xcopy "%SOURCE%examples" "%DEST%\examples\" /E /I /Y >nul 2>&1
    xcopy "%SOURCE%tests" "%DEST%\tests\" /E /I /Y >nul 2>&1
)

if exist "%DEST%\package.json" (
    echo.
    echo ========================================
    echo   ✅ Проект скопирован!
    echo ========================================
    echo.
    echo Новый путь: %DEST%
    echo.
    echo Перейдите в новую папку:
    echo   cd %DEST%
    echo.
    echo Запустите сервер:
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
