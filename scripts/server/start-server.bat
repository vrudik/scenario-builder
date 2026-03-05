@echo off
chcp 65001 >nul
cd /d "C:\scenario-builder"
echo ========================================
echo 🚀 Запуск сервера...
echo ========================================
node server.cjs
pause
