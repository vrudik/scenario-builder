# Веб-тестирование Agent Runtime

## Быстрый старт

### 1. Запустите сервер

**Вариант A: Через bat файл (рекомендуется)**
```
Дважды кликните на: start-test-server.bat
```

**Вариант B: Через командную строку**
```cmd
cd /d "C:\Всякое\Конструктор сценариев"
node server.js
```

**Вариант C: Через PowerShell**
```powershell
node server.js
```

### 2. Откройте тестовую страницу

После запуска сервера откройте в браузере:

**Основные страницы:**
- http://localhost:3000/test-agent.html - Тестирование Agent Runtime
- http://localhost:3000/dashboard.html - Dashboard системы
- http://localhost:3000/ - Главная страница

## Использование тестовой страницы

1. **Введите запрос** в поле "Ваш запрос"
   - Например: "Find information about TypeScript programming language"

2. **Проверьте ID сценария** (по умолчанию: test-scenario)

3. **Нажмите "Запустить Agent Runtime"**

4. **Дождитесь результатов:**
   - Статус выполнения
   - Вывод агента
   - Количество tool calls
   - Использованные токены

## Устранение проблем

### Ошибка "Failed to fetch"

**Причина:** Сервер не запущен или страница открыта напрямую (file://)

**Решение:**
1. Убедитесь, что сервер запущен (`node server.js`)
2. Откройте страницу через сервер: http://localhost:3000/test-agent.html
3. Не открывайте файл напрямую (file://)

### Ошибка "Ollama недоступен"

**Причина:** Ollama не запущен

**Решение:**
1. Запустите Ollama вручную
2. Или через командную строку:
   ```cmd
   "%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
   ```

### Порт 3000 занят

**Решение:**
1. Измените PORT в `server.js` (строка 5)
2. Или остановите другой процесс на порту 3000

## API Endpoints

- `GET /api/status` - Статус компонентов системы
- `GET /api/agent/status` - Статус Agent Runtime и Ollama
- `POST /api/agent/execute` - Выполнение Agent Runtime

### Пример запроса к API:

```javascript
fetch('http://localhost:3000/api/agent/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userIntent: 'Find information about TypeScript',
    scenarioId: 'test-scenario'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## Структура ответа API

```json
{
  "success": true,
  "output": "Результат выполнения агента",
  "toolCallsExecuted": 2,
  "totalTokens": 150,
  "error": null,
  "fallbackUsed": false
}
```

## Следующие шаги

После компиляции TypeScript (`npm run build`) можно подключить реальный Agent Runtime вместо заглушки.
