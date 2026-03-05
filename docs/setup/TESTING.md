# Инструкция по тестированию

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск автоматических тестов

```bash
# Все тесты
npm test

# С покрытием
npm test -- --coverage

# В watch режиме
npm test -- --watch

# UI интерфейс
npm test -- --ui
```

### 3. Ручное тестирование

```bash
# Простой ручной тест без установки зависимостей
npx tsx test-manual.ts
```

## Структура тестов

- `tests/scenario-spec.test.ts` - тесты для Scenario Spec валидации
- `tests/scenario-builder.test.ts` - тесты для Scenario Builder/Compiler
- `tests/tool-registry.test.ts` - тесты для Tool Registry
- `tests/tool-gateway.test.ts` - тесты для Tool Gateway

## Примеры использования

Примеры находятся в директории `examples/`:

- `examples/simple-scenario.json` - пример спецификации сценария
- `examples/usage.ts` - пример использования основных компонентов
- `examples/runtime-example.ts` - пример использования Runtime Orchestrator

Запуск примеров:

```bash
npm run example
```

## Проверка типов

```bash
# Проверка без компиляции
npx tsc --noEmit

# Компиляция
npm run build
```

## Линтинг

```bash
npm run lint
```

## Форматирование

```bash
npm run format
```
