#!/bin/bash
# Скрипт запуска веб-сервера для Linux/Mac

echo "🚀 Запуск веб-сервера..."

# Проверка установки зависимостей
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
fi

# Запуск веб-сервера
echo "🌐 Запуск веб-интерфейса на http://localhost:3000"
npx tsx src/web/server.ts
