# API Documentation

## Scenarios API

### GET /api/scenarios
Получить список всех сценариев.

**Query Parameters:**
- `status` (optional) - Фильтр по статусу: `draft`, `active`, `archived`
- `limit` (optional) - Максимальное количество результатов
- `offset` (optional) - Смещение для пагинации

**Response:**
```json
{
  "success": true,
  "scenarios": [
    {
      "id": "uuid",
      "name": "Scenario Name",
      "description": "Description",
      "spec": { /* ScenarioSpec */ },
      "version": "1.0.0",
      "status": "active",
      "createdBy": "user-id",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/scenarios/:id
Получить сценарий по ID.

**Response:**
```json
{
  "success": true,
  "scenario": {
    "id": "uuid",
    "name": "Scenario Name",
    "spec": { /* ScenarioSpec */ },
    ...
  }
}
```

### POST /api/scenarios
Создать новый сценарий.

**Request Body:**
```json
{
  "name": "Scenario Name",
  "description": "Optional description",
  "spec": { /* ScenarioSpec */ },
  "version": "1.0.0",
  "createdBy": "user-id"
}
```

**Response:**
```json
{
  "success": true,
  "scenario": { /* Created scenario */ }
}
```

### PUT /api/scenarios/:id
Обновить сценарий.

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "spec": { /* Updated ScenarioSpec */ },
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "scenario": { /* Updated scenario */ }
}
```

### DELETE /api/scenarios/:id
Удалить сценарий.

**Response:**
```json
{
  "success": true
}
```

### GET /api/scenarios/:id/executions
Получить список выполнений сценария.

**Query Parameters:**
- `status` (optional) - Фильтр по статусу выполнения
- `limit` (optional) - Максимальное количество результатов
- `offset` (optional) - Смещение для пагинации

**Response:**
```json
{
  "success": true,
  "executions": [
    {
      "id": "uuid",
      "executionId": "exec-uuid",
      "scenarioId": "scenario-uuid",
      "status": "completed",
      "startedAt": "2024-01-01T00:00:00.000Z",
      "completedAt": "2024-01-01T00:01:00.000Z",
      ...
    }
  ]
}
```

## Executions API

### GET /api/executions/:executionId/unified-status
Единый статус выполнения по данным **Prisma** (работает после рестарта `server.cjs`). Для `runtimeKind === temporal` и `USE_TEMPORAL=true` дополнительно вызывается `describe()` Temporal (если сервер доступен).

**Response:**
```json
{
  "success": true,
  "unifiedStatus": {
    "executionId": "exec-uuid",
    "runtimeKind": "temporal",
    "lifecycleStatus": "running",
    "currentNodeId": "temporal-pending",
    "source": "database",
    "temporal": { "workflowId": "exec-uuid", "runId": "...", "statusName": "RUNNING", ... },
    "inMemory": { "completed": false, "failed": false, "temporalAsync": true, ... }
  }
}
```

### GET /api/executions/:executionId
Получить выполнение по executionId.

**Response:**
```json
{
  "success": true,
  "execution": {
    "id": "uuid",
    "executionId": "exec-uuid",
    "scenarioId": "scenario-uuid",
    "status": "completed",
    "events": [ /* ExecutionEvent[] */ ],
    "nodeExecutions": [ /* NodeExecution[] */ ],
    "compensations": [ /* Compensation[] */ ],
    ...
  }
}
```

### GET /api/executions/:executionId/events
Получить историю событий выполнения.

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "id": "uuid",
      "executionId": "exec-uuid",
      "type": "node_completed",
      "nodeId": "node-id",
      "data": { /* Event data */ },
      "metadata": { /* Event metadata */ },
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Error Responses

Все endpoints возвращают ошибки в следующем формате:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message"
  }
}
```

**Error Codes:**
- `NOT_FOUND` - Ресурс не найден (404)
- `VALIDATION_ERROR` - Ошибка валидации (400)
- `INTERNAL_ERROR` - Внутренняя ошибка сервера (500)
- `INVALID_REQUEST` - Неверный запрос (400)

## Примеры использования

### Создание сценария

```bash
curl -X POST http://localhost:3000/api/scenarios \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Scenario",
    "description": "Test description",
    "spec": {
      "version": "0.1.0",
      "id": "test-scenario",
      "name": "Test Scenario",
      "goal": "Test goal",
      "triggers": [{"type": "manual"}],
      "allowedActions": []
    }
  }'
```

### Получение списка сценариев

```bash
curl http://localhost:3000/api/scenarios?status=active&limit=10
```

### Получение выполнения

```bash
curl http://localhost:3000/api/executions/exec-uuid-here
```
