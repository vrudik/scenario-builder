# 🚀 Быстрый старт

## Шаг 1: Установка зависимостей

```bash
npm install
```

Если возникают проблемы с путями в PowerShell, используйте:

```powershell
Set-Location "C:\Всякое\Конструктор сценариев"
npm install
```

## Шаг 2: Запуск веб-интерфейса

```powershell
.\start-web.ps1
```

Или:

```bash
npm run web
```

## Шаг 3: Открыть браузер

Перейдите по адресу: **http://localhost:3000**

## Шаг 4: Запуск тестов

В новом терминале:

```bash
npm test
```

Или с UI интерфейсом:

```bash
npm run test:ui
```

## Что вы увидите в веб-интерфейсе

1. **Статус системы** - общая информация о компонентах
2. **Карточки компонентов** - детальный статус каждого модуля:
   - Scenario Spec
   - Scenario Builder
   - Tool Registry
   - Tool Gateway
   - Runtime Orchestrator
3. **Информация о тестах** - какие тесты готовы к запуску

## Примеры использования

```bash
# Запуск примера использования
npm run example

# Ручной тест
npm run test:manual

# Проверка типов
npm run typecheck
```
