# Быстрое тестирование Observability

## Шаг 1: Запуск сервера

```bash
node server.cjs
```

Или:
```bash
start-test-server.bat
```

## Шаг 2: Откройте Dashboard

Откройте в браузере:
**http://localhost:3000/observability-dashboard.html**

Здесь вы увидите:
- Статус Jaeger и Prometheus
- Метрики системы в реальном времени
- Ссылки на все инструменты

## Шаг 3: Выполните тестовые запросы

Откройте: **http://localhost:3000/test-agent.html**

Выполните несколько запросов:
1. "Find information about TypeScript"
2. "Compare TypeScript and JavaScript"
3. "Explain observability in software"

## Шаг 4: Просмотр результатов

### Вариант A: Через Dashboard
Откройте: http://localhost:3000/observability-dashboard.html
- Нажмите "🔄 Обновить метрики"
- Посмотрите метрики в реальном времени

### Вариант B: Через Jaeger (если запущен)
1. Откройте: http://localhost:16686
2. Выберите сервис: `scenario-builder-agent`
3. Нажмите "Find Traces"
4. Кликните на trace для деталей

### Вариант C: Через Prometheus (если запущен)
1. Откройте: http://localhost:9090
2. Введите: `scenario_executions_total`
3. Нажмите "Execute"

### Вариант D: Прямой доступ к метрикам
Откройте: http://localhost:9464/metrics

## Что смотреть

### Метрики
- **scenario_executions_total** - сколько раз выполнялись сценарии
- **scenario_success_total** - успешные выполнения
- **scenario_failures_total** - неудачные выполнения
- **agent_tool_calls_total** - количество tool calls
- **agent_tokens_used_total** - использованные токены
- **agent_llm_calls_total** - вызовы LLM

### Трассировки (в Jaeger)
- Структура выполнения (какие операции выполнялись)
- Длительность каждой операции
- Атрибуты (scenario_id, tool_calls, tokens)
- Ошибки (если есть)

### Логи (в консоли сервера)
- Структурированные логи с traceId/spanId
- Уровни логирования (DEBUG, INFO, WARN, ERROR)
- Контекстные метаданные

## Оценка качества

### Хорошие показатели:
- ✅ Высокий процент успешных выполнений (>95%)
- ✅ Быстрое выполнение (<5 секунд для простых запросов)
- ✅ Правильное количество tool calls (1-3 для простых запросов)
- ✅ Нет ошибок в трассировках

### Проблемы для проверки:
- ⚠️ Много неудачных выполнений
- ⚠️ Долгие выполнения (>10 секунд)
- ⚠️ Слишком много tool calls (>10)
- ⚠️ Ошибки в трассировках

## Запуск Jaeger и Prometheus (опционально)

Если хотите использовать Jaeger и Prometheus:

### Jaeger (Docker)
```bash
docker run -d --name jaeger -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one:latest
```

### Prometheus (Docker)
```bash
docker run -d --name prometheus -p 9090:9090 -v %cd%/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus:latest
```

Подробнее: см. `observability-setup.md`
