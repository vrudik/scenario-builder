# Настройка Observability для тестирования

## Быстрый старт

### 1. Запуск Jaeger (для трассировок)

**Вариант A: Docker (рекомендуется)**
```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 14268:14268 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

**Вариант B: Windows (если Docker недоступен)**
- Скачайте Jaeger: https://www.jaegertracing.io/download/
- Запустите: `jaeger-all-in-one.exe`

После запуска откройте: http://localhost:16686

### 2. Запуск Prometheus (для метрик)

**Вариант A: Docker**
```bash
docker run -d --name prometheus \
  -p 9090:9090 \
  -v %cd%/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:latest
```

**Вариант B: Скачать**
- Скачайте: https://prometheus.io/download/
- Запустите prometheus.exe

После запуска откройте: http://localhost:9090

### 3. Настройка переменных окружения

Создайте файл `.env` или установите переменные:

```bash
OTEL_ENABLED=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces
PROMETHEUS_PORT=9464
LOG_LEVEL=debug
```

### 4. Запуск системы

```bash
node server.cjs
```

Или через bat-файл:
```bash
start-test-server.bat
```

## Просмотр данных

### Трассировки (Jaeger)
1. Откройте http://localhost:16686
2. Выберите сервис: `scenario-builder`
3. Нажмите "Find Traces"
4. Кликните на trace для деталей

### Метрики (Prometheus)
1. Откройте http://localhost:9090
2. Введите метрику: `scenario_executions_total`
3. Нажмите "Execute"
4. Посмотрите график

### Метрики через HTTP
Откройте: http://localhost:9464/metrics

### Логи
Логи выводятся в консоль в JSON формате (в production) или с цветами (в development).

## Полезные метрики

- `scenario_executions_total` - Общее количество выполнений
- `scenario_duration_seconds` - Длительность выполнения
- `scenario_success_total` - Успешные выполнения
- `scenario_failures_total` - Неудачные выполнения
- `agent_tool_calls_total` - Количество tool calls
- `agent_tokens_used_total` - Использованные токены
- `agent_llm_calls_total` - Вызовы LLM
- `agent_llm_duration_seconds` - Длительность LLM вызовов
- `tool_executions_total` - Выполнения инструментов
- `tool_duration_seconds` - Длительность выполнения инструментов
