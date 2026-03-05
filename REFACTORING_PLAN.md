# План рефакторинга структуры проекта

## Текущие проблемы

1. **Корневая директория перегружена:**
   - Множество HTML файлов (admin-*, test-*, dashboard.html)
   - Множество скриптов (.bat, .ps1, .sh)
   - Множество документации (.md файлы)
   - Временные файлы (temp-*.json)
   - Системные файлы Windows
   - Старые/дублирующиеся файлы

2. **Отсутствие четкой структуры:**
   - Веб-интерфейсы разбросаны по корню
   - Скрипты не организованы
   - Документация не структурирована

## Новая структура

```
scenario-builder/
├── src/                          # Исходный код (без изменений)
│   ├── agent/
│   ├── builder/
│   ├── db/
│   ├── events/
│   ├── gateway/
│   ├── observability/
│   ├── registry/
│   ├── runtime/
│   ├── spec/
│   ├── tools/
│   └── web/
│
├── web/                          # Веб-интерфейсы
│   ├── admin/
│   │   ├── admin-dashboard.html
│   │   ├── admin-components.html
│   │   ├── admin-config.html
│   │   ├── admin-monitoring.html
│   │   ├── admin-scenarios.html
│   │   ├── admin-testing.html
│   │   ├── admin-styles.css
│   │   └── admin-common.js
│   ├── test/
│   │   ├── test-agent.html
│   │   ├── test-orchestrator.html
│   │   └── test-event-bus.html
│   ├── dashboard.html
│   └── observability-dashboard.html
│
├── scripts/                      # Скрипты
│   ├── server/
│   │   ├── start-server.bat
│   │   ├── start-server.js
│   │   └── start-test-server.bat
│   ├── test/
│   │   ├── test-agent.bat
│   │   └── test-agent.ps1
│   └── setup/
│       ├── install.ps1
│       └── setup-and-run.ps1
│
├── docs/                         # Документация
│   ├── api/
│   │   └── API_DOCUMENTATION.md
│   ├── setup/
│   │   ├── DATABASE_SETUP.md
│   │   ├── EVENT_BUS_SETUP.md
│   │   ├── OBSERVABILITY_TESTING.md
│   │   └── OLLAMA_SETUP.md
│   ├── guides/
│   │   ├── QUICK_START.md
│   │   ├── QUICK_FIX.md
│   │   └── WEB_TESTING.md
│   └── README.md
│
├── tests/                        # Тесты (без изменений)
│
├── examples/                     # Примеры (без изменений)
│
├── server.cjs                    # Главный сервер (остается в корне)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

## Файлы для удаления

- `server.js` (дубликат server.cjs)
- `start-server.js` (дубликат)
- `web-server-simple.js` (старый файл)
- `test-server-simple.bat` (дубликат)
- `temp-*.json` (временные файлы)
- `NTUSER.DAT*` (системные файлы Windows)
- `ntuser.ini` (системный файл)
- `CLAUDE.md` (из другого проекта)
- `pyproject.toml`, `uv.lock` (из другого проекта)
- `3D Objects/`, `ansel/`, `AppData/` (из другого проекта)
- Документация переносится в `docs/`

## Порядок выполнения

1. ✅ Написать тесты для критических компонентов
2. ✅ Запустить существующие тесты
3. ✅ Провести рефакторинг структуры
4. ✅ Обновить пути в коде
5. ✅ Запустить тесты после рефакторинга
6. ✅ Исправить ошибки
