# Запуск Kafka для Event Bus

## Быстрый старт

### 1. Запуск Docker Desktop

**Windows:**
- Откройте Docker Desktop из меню Пуск
- Дождитесь полного запуска (иконка в трее станет зеленой)

**Проверка:**
```bash
docker ps
```

Если команда выполняется без ошибок - Docker запущен.

### 2. Запуск Kafka

```bash
docker-compose up -d
```

Эта команда запустит:
- **Zookeeper** на порту `2181`
- **Kafka** на порту `9092`

### 3. Проверка статуса

```bash
docker-compose ps
```

Должны быть запущены оба контейнера:
- `zookeeper` - статус `Up`
- `kafka` - статус `Up`

### 4. Проверка в веб-интерфейсе

Откройте `http://localhost:3000/test-event-bus.html` и проверьте:
- **Kafka Status** должен показать `Available`
- Кнопка **Connect** должна быть активна

## Остановка Kafka

```bash
docker-compose down
```

## Очистка данных

Если нужно полностью очистить данные Kafka:

```bash
docker-compose down -v
```

## Troubleshooting

### Порт 9092 занят

Если порт 9092 уже занят другим процессом:

1. Найдите процесс:
   ```bash
   netstat -ano | findstr :9092
   ```

2. Остановите процесс или измените порт в `docker-compose.yml`:
   ```yaml
   ports:
     - "9093:9092"  # Используйте другой порт
   ```

3. Обновите переменную окружения:
   ```bash
   set KAFKA_BROKERS=localhost:9093
   ```

### Kafka не запускается

1. Проверьте логи:
   ```bash
   docker-compose logs kafka
   ```

2. Убедитесь, что Zookeeper запущен:
   ```bash
   docker-compose logs zookeeper
   ```

3. Перезапустите контейнеры:
   ```bash
   docker-compose restart
   ```

### Docker Desktop не запускается

- Убедитесь, что виртуализация включена в BIOS
- Проверьте, что WSL2 установлен (для Windows)
- Перезапустите компьютер

## Работа без Kafka

Система работает и без Kafka в режиме **graceful degradation**:
- ✅ События сохраняются в локальной памяти
- ✅ Orchestrator продолжает работу
- ✅ Все функции доступны, кроме публикации в Kafka

Для полной функциональности рекомендуется запустить Kafka.
