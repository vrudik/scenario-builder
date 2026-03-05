@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Тестирование Agent Runtime с Ollama ===
echo.

echo 1. Проверка Ollama...
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" --version
if %errorlevel% neq 0 (
    echo ❌ Ollama не найден
    exit /b 1
)
echo ✅ Ollama работает
echo.

echo 2. Проверка модели...
"%LOCALAPPDATA%\Programs\Ollama\ollama.exe" list | findstr "llama3.2:1b" >nul
if %errorlevel% neq 0 (
    echo ⚠️  Модель не найдена, загружаю...
    "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" pull llama3.2:1b
)
echo ✅ Модель готова
echo.

echo 3. Запуск теста Agent Runtime...
echo.
npx tsx examples/agent-ollama-example.ts

pause
