# Тестирование Observability

## Быстрый старт

### 1. Запуск теста

```bash
node test-observability.js
```

Или через tsx:
```bash
npx tsx test-observability.js
```

### 2. Просмотр результатов

#### Трассировки (Jaeger)
1. Убедитесь, что Jaeger запущен (см. `observability-setup.md`)
2. Откройте: http://localhost:16686
3. Выберите сервис: `scenario-builder-test`
4. Нажмите "Find Traces"
5. Кликните на trace для деталей

**Что смотреть:**
- Структура spans (вложенность операций)
- Длительность выполнения
- Атрибуты (scenario_id, tool_calls, tokens)
- События (events)
- Ошибки (если есть)

#### Метрики (Prometheus)
1. Убедитесь, что Prometheus запущен
2. Откройте: http://localhost:9090
3. Введите метрику: `scenario_executions_total`
4. Нажмите "Execute"
5. Посмотрите график

**Полезные запросы:**
```promql
# Общее количество выполнений
scenario_executions_total

# Успешность (rate)
rate(scenario_success_total[5m]) / rate(scenario_executions_total[5m])

# Средняя длительность
rate(scenario_duration_seconds_sum[5m]) / rate(scenario_duration_seconds_count[5m])

# Количество tool calls
agent_tool_calls_total

# Использование токенов
agent_tokens_used_total
```

#### Метрики через HTTP
Откройте: http://localhost:9464/metrics

Вы увидите все метрики в формате Prometheus.

#### Dashboard
Откройте: http://localhost:3000/observability-dashboard.html

Веб-интерфейс для просмотра метрик и статуса сервисов.

### 3. Тестирование через веб-интерфейс

1. Запустите сервер: `node server.cjs`
2. Откройте: http://localhost:3000/test-agent.html
3. Выполните несколько запросов
4. Откройте Jaeger и посмотрите трассировки
5. Откройте Prometheus и посмотрите метрики

## Оценка качества

### Метрики для оценки

1. **Производительность**
   - `scenario_duration_seconds` - длительность выполнения
   - `agent_llm_duration_seconds` - длительность LLM вызовов
   - `tool_duration_seconds` - длительность выполнения инструментов

2. **Надежность**
   - `scenario_success_total / scenario_executions_total` - процент успешных выполнений
   - `scenario_failures_total` - количество ошибок
   - `tool_rate_limit_hits_total` - количество rate limit hits

3. **Использование ресурсов**
   - `agent_tokens_used_total` - использование токенов
   - `agent_llm_calls_total` - количество вызовов LLM
   - `agent_tool_calls_total` - количество tool calls

4. **Качество работы**
   - Количество tool calls на выполнение
   - Соотношение успешных/неудачных выполнений
   - Средняя длительность выполнения

### Анализ трассировок

**Что проверять:**
1. **Структура** - правильная вложенность spans
2. **Длительность** - нет ли долгих операций
3. **Ошибки** - есть ли failed spans
4. **Корреляция** - правильная передача traceId между компонентами

**Пример хорошей трассировки:**
```
agent.execute (100ms)
  ├─ agent.llm.call (50ms)
  └─ agent.tool.execute (30ms)
      └─ tool.search (25ms)
```

### Анализ логов

**Что проверять:**
1. **Структура** - JSON формат в production
2. **Корреляция** - наличие traceId и spanId
3. **Контекст** - достаточная информация для отладки
4. **Уровни** - правильное использование уровней логирования

## Примеры запросов для тестирования

1. **Простой запрос**
   ```
   Find information about TypeScript
   ```
   Ожидается: 1 tool call, быстрый ответ

2. **Сложный запрос**
   ```
   Find information about TypeScript, compare it with JavaScript, and explain the differences
   ```
   Ожидается: несколько tool calls, более длительное выполнение

3. **Запрос с ошибкой**
   ```
   Delete all files
   ```
   Ожидается: guardrail violation, ошибка в трассировке

## Troubleshooting

### Jaeger не показывает трассировки
- Проверьте, что Jaeger запущен: http://localhost:16686
- Проверьте переменную `JAEGER_ENDPOINT`
- Проверьте логи сервера на ошибки

### Prometheus не показывает метрики
- Проверьте, что Prometheus запущен: http://localhost:9090
- Проверьте порт: http://localhost:9464/metrics
- Проверьте конфигурацию Prometheus

### Логи не структурированы
- Убедитесь, что `LOG_LEVEL` установлен правильно
- Проверьте формат вывода (JSON в production)
