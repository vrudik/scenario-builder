# Декомпозиция investor deploy roadmap в задачи

Источник: `docs/guides/INVESTOR_DEPLOY_ROADMAP.md`.

## Принципы приоритизации

## Горячий трек — исправление ошибок (стартуем с этого)

- [x] Добавить отдельный трек исправления compile/test ошибок в roadmap-план.
- [x] Уменьшать количество TypeScript ошибок до green `typecheck/build` (батчами).
  - [x] Батч 1: cleanup неиспользуемых импортов/переменных в `src/web/*`.
  - [x] Батч 2: исправление типовых контрактов в `src/tools/*`.
  - [x] Батч 3: исправление строгих типов в `src/agent/*` и `src/runtime/*`.
- [x] Починить нестабильный тест `tests/scenarios-api.test.ts` (hook timeout).

1. Сначала снимаем блокеры сборки/демо (time-to-demo).
2. Затем закрываем reliability и recoverability.
3. После этого — CI/CD и release discipline.
4. Параллельно готовим investor packaging и narrative.

## Фаза 0 — Stabilization baseline (1–2 дня)

- [ ] Починить compile/typecheck/build с нуля.
  - [ ] Проверить `npm run typecheck`.
  - [ ] Проверить `npm run build`.
  - [ ] Проверить `npm test -- --run`.
- [ ] Синхронизировать quick-start инструкции для demo/prod режимов.
- [ ] Добавить/актуализировать `env.example` (DB/Kafka/Temporal/Ollama/OpenAI).

## Фаза 1 — Investor-demo contour (1 неделя)

- [x] Выделить единый бизнес-кейс demo (customer support/order status).
- [x] Добавить one-click run (presentation mode) с seed-данными.
- [x] Добавить reset demo state.
- [x] Вывести KPI на одном экране:
  - [x] success rate,
  - [x] latency (TTFR/duration),
  - [x] estimated cost per run.
- [x] Добавить explainable guardrail-блок в результат запуска.
- [x] Добавить экспорт отчёта demo run (JSON/PDF-lite) для встречи с инвесторами.

## Фаза 2 — Production reliability (1–2 недели)

- [ ] Реализовать non-stub durable execution path с Temporal.
- [ ] Выровнять статусы execution между in-memory и durable режимом.
- [ ] Добавить recovery после рестарта и тесты на идемпотентность.
- [x] Формализовать readiness/health endpoints.

## Фаза 3 — CI/CD & release discipline (1 неделя)

- [x] Добавить `.github/workflows/ci.yml` (lint/typecheck/test/build).
- [x] Добавить smoke e2e для demo API.
- [x] Ввести semver + changelog/release notes.
- [x] Добавить container runbook + healthchecks.

## Фаза 4 — Investor packaging (параллельно)

- [ ] Сформировать demo-пакет (architecture/business-case/KPI/risks).
- [x] Добавить экран About/Trust (guardrails, audit trail, observability).
- [ ] Подготовить демонстрационный отчёт выполнения (download/export).

## Пошаговый execution plan (следующие инкременты)

1. **Инкремент A (текущий):** demo one-click + KPI + guardrails + reset state.
2. **Инкремент B:** smoke-тест demo API и автопроверка narrative контрактов.
3. **Инкремент C:** CI pipeline для защитного quality gate.
4. **Инкремент D:** начало durable-path реализации на Temporal + recovery tests.

## Критерии готовности investor demo

- Demo показывается за 3–5 минут без CLI.
- На одном экране есть narrative + KPI + guardrails.
- Есть reset между прогонами и стабильный повторяемый сценарий.
