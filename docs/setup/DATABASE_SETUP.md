# Настройка базы данных

## Быстрый старт

### 1. Установка зависимостей

Зависимости уже установлены (`@prisma/client@7.4.2` и `prisma@7.4.2` в `package.json`).

### 2. Создание файла .env

Создайте файл `.env` в корне проекта:

```env
DATABASE_URL="file:./dev.db"
```

**Важно:** В Prisma 7 URL базы данных передается через переменную окружения `DATABASE_URL` и используется в конструкторе `PrismaClient` (см. `src/db/index.ts`), а не через `schema.prisma`.

### 3. Инициализация базы данных

```bash
# Генерация Prisma Client
npm run db:generate
# или
npx prisma generate

# Создание миграции
npm run db:migrate
# или
npx prisma migrate dev --name init

# Применить миграции в production
npm run db:deploy
# или
npx prisma migrate deploy
```

### 4. Просмотр базы данных (опционально)

```bash
# Открыть Prisma Studio (веб-интерфейс для БД)
npm run db:studio
# или
npx prisma studio
```

## Структура базы данных

### Основные таблицы:

1. **Scenario** - Сценарии (Scenario Spec)
2. **Execution** - Выполнения сценариев
3. **ExecutionEvent** - События выполнения (для восстановления состояния)
4. **NodeExecution** - Выполнения узлов workflow
5. **Compensation** - Компенсации (Saga pattern)
6. **Tool** - Инструменты и их метаданные
7. **AgentMemory** - Память агента (short-term и long-term)
8. **Configuration** - Конфигурации системы
9. **Template** - Шаблоны сценариев
10. **Metric** - Исторические метрики

## Использование в коде

```typescript
import { prisma } from './src/db';
import { ScenarioRepository, ExecutionRepository } from './src/db/repositories';

// Использование Prisma Client напрямую
const scenario = await prisma.scenario.findUnique({
  where: { id: 'scenario-id' }
});

// Использование репозиториев (рекомендуется)
const scenarioRepo = new ScenarioRepository();
const scenario = await scenarioRepo.findById('scenario-id');

const executionRepo = new ExecutionRepository();
const execution = await executionRepo.findByExecutionId('execution-id');
```

## Миграции

```bash
# Создать новую миграцию после изменения schema.prisma
npx prisma migrate dev --name migration_name

# Применить миграции в production
npx prisma migrate deploy

# Откатить последнюю миграцию (development)
npx prisma migrate reset
```

## Резервное копирование

SQLite база данных хранится в файле `dev.db`. Для резервного копирования:

```bash
# Простое копирование файла
cp dev.db dev.db.backup

# Или экспорт в SQL
sqlite3 dev.db .dump > backup.sql
```

## Примечания по Prisma 7

В Prisma 7 изменился способ конфигурации:
- URL базы данных **не указывается** в `schema.prisma`
- URL передается через переменную окружения `DATABASE_URL`
- В конструкторе `PrismaClient` используется параметр `datasourceUrl`

См. `src/db/index.ts` для примера правильной инициализации.
