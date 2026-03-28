# Product Identity

Единственный источник правды по имени, позиционированию и naming conventions продукта.

## Canonical Name

| Контекст | Значение |
|----------|----------|
| **Product name (EN)** | **Scenario Builder** |
| **Product name (RU)** | **Конструктор сценариев** |
| **npm package** | `scenario-builder` |
| **Docker image** | `scenario-builder` |
| **GitHub repo** | `scenario-builder` |
| **CLI / binary** | `scenario-builder` |

## Tagline

| Язык | Текст |
|------|-------|
| EN | Autonomous scenario platform with quality, cost, and safety gates |
| RU | Конструктор автономных сценариев и агентных процессов |

## One-liner

| Язык | Текст |
|------|-------|
| EN | Scenario Builder lets you define autonomous agent workflows as declarative specs and run them with built-in orchestration, policy gates, and observability — so every action is traceable, safe, and cost-controlled. |
| RU | Scenario Builder позволяет описать автономные агентные сценарии как декларативные спецификации и запускать их со встроенной оркестрацией, policy-гейтами и observability — каждое действие прозрачно, безопасно и контролируемо по стоимости. |

### When to use which

| Формат | Что использовать |
|--------|-----------------|
| HTML subtitle, npm description, meta tags | **Tagline** |
| Pitch deck, README intro, one-pager header | **One-liner** |
| Conversation / elevator pitch | One-liner (сокращённый до «Scenario Builder — платформа для запуска автономных агентных сценариев с гарантиями безопасности и стоимости») |

## Naming Rules

1. **Один бренд** — во всех документах, UI, CI, Docker, docs используется **Scenario Builder** (EN) или **Конструктор сценариев** (RU).
2. **HTML `<title>`** — формат: `<Page Name> — Scenario Builder`. Пример: `Admin Dashboard — Scenario Builder`.
3. **Нет альтернативных имён** — имя `hr-breaker` не относится к этому продукту и не должно упоминаться в репозитории.
4. **Субтитры** — используется tagline, не произвольные описания.
5. **README первая строка** — `# Scenario Builder`.

## ICP — Ideal Customer Profile (Wave 1)

### Target Company

| Параметр | Значение |
|----------|----------|
| Размер | Mid-market → Enterprise (50–5000+ сотрудников) |
| Зрелость | Есть инженерная команда, способная работать с API и декларативными спецификациями |
| Потребность | Автоматизация операционных процессов с участием LLM-агентов, при этом нужен контроль: аудит, policy gates, стоимость |
| Отрасль (приоритет) | FinTech, InsurTech, Enterprise IT / Internal Tooling, Customer Support / CX платформы |
| Отрасль (вторичная) | HealthTech (compliance-heavy), E-commerce ops, Legal tech |

### Buyer Persona

| Роль | Зачем покупает |
|------|---------------|
| **VP Engineering / CTO** | Контролируемая AI-автоматизация без «чёрного ящика» — spec-as-code, audit trail, policy gates |
| **Head of Platform / Infrastructure** | Единая оркестрация агентных процессов вместо россыпи скриптов; durable execution, observability |
| **Head of AI / ML** | Фреймворк для production-ready агентных сценариев с guardrails, а не playground |

### Why They Choose Scenario Builder

1. **Governance by design** — OPA policies, RBAC, cost/token budgets, hallucination gates встроены, а не прикручены сбоку
2. **Spec-as-code** — сценарии декларативны, версионируемы, тестируемы (CI/CD friendly)
3. **Durable execution** — Temporal-backed orchestration с восстановлением после сбоев
4. **Full audit trail** — каждое действие агента прозрачно, экспортируемо, проверяемо
5. **Self-hosted option** — данные остаются внутри периметра клиента

### Anti-ICP (кого НЕ берём в Wave 1)

| Профиль | Почему не берём |
|---------|----------------|
| Индивидуальные разработчики, хотящие «быстрый чатбот» | Нет потребности в orchestration и governance |
| Компании без инженерной команды (нужен no-code) | Продукт требует работы со спецификациями и API |
| Чисто аналитические / BI задачи | Не подходит архитектура (agents + tool calling) |
| Простое RPA без LLM | Переусложнённо; есть более подходящие инструменты |
| Стартапы на ранней стадии без compliance-потребностей | Не оценят governance layer — он им не нужен |

## Top-3 Use Cases

### UC-1: Autonomous Customer Support Triage

**Сценарий:** LLM-агент принимает обращение клиента, запрашивает внутренние системы (CRM, база заказов), классифицирует проблему, решает или маршрутизирует. Каждое действие проходит через policy gates, стоимость контролируется token budget, все решения в audit trail.

**Почему Scenario Builder:**
- Декларативная спецификация описывает допустимые действия, risk class, SLA
- OPA-политики запрещают доступ к данным вне scope (PII masking)
- Durable execution — сценарий завершится даже после перезапуска сервиса
- Полный audit trail для compliance-отчётности

### UC-2: Compliance-Controlled Document Processing

**Сценарий:** Агент обрабатывает входящие документы (контракты, заявки, инвойсы), извлекает данные, валидирует по правилам, запускает последующие действия (уведомления, создание записей). Policy gates гарантируют, что агент не выходит за рамки разрешённых операций.

**Почему Scenario Builder:**
- Spec-as-code: сценарий обработки версионируется, тестируется в CI
- Tool Gateway с rate limiting и circuit breaking для внешних API
- Observability — tracing каждого шага через OpenTelemetry
- Multi-tenant: разные клиенты / отделы получают изолированные policy bundles

### UC-3: Internal Operations Automation

**Сценарий:** Многошаговые внутренние процессы (онбординг сотрудников, provisioning инфраструктуры, incident response) с LLM-агентами, принимающими решения на каждом шаге. Human-in-the-loop для high-risk действий.

**Почему Scenario Builder:**
- Orchestrator с saga pattern и компенсацией транзакций
- Temporal-backed execution для long-running процессов (часы/дни)
- Cost guardrails предотвращают бесконтрольный расход на LLM API
- Canary/stable lanes для безопасного rollout новых версий сценариев

## Anti-Use-Cases (что НЕ делать на Scenario Builder)

| Задача | Почему не подходит | Что использовать вместо |
|--------|--------------------|------------------------|
| Простой чатбот / Q&A | Нет потребности в оркестрации и governance | LangChain, простой API-wrapper |
| BI / Data analytics dashboards | Архитектура agent + tool calling не подходит для аналитики | Metabase, Superset, dbt |
| Простая интеграция webhook → webhook | Избыточна инфраструктура оркестрации | Zapier, n8n, simple middleware |
| Одноразовая генерация текста | Нет сценария/workflow, не нужен orchestrator | Прямой вызов OpenAI API |
| Batch data processing / ETL | Не оптимизирован для массовой обработки данных | Apache Airflow, Prefect, Spark |

## Competitive Positioning

### Категории альтернатив

| Категория | Примеры | В чём проигрывают Scenario Builder |
|-----------|---------|-----------------------------------|
| **Agent frameworks** | LangChain, CrewAI, AutoGen | Нет встроенной оркестрации, policy gates, durable execution. Нужно собирать самим. |
| **Workflow / orchestration** | Temporal (raw), Apache Airflow, Prefect | Нет agent runtime, LLM tool calling, guardrails. Это инфраструктура, не продукт. |
| **iPaaS / low-code automation** | Zapier, n8n, Make | Нет LLM-агентов, нет spec-as-code, нет OPA policies, ограниченная кастомизация. |
| **Internal tool builders** | Retool, Superblocks | Фокус на UI/dashboards, не на автономном исполнении сценариев с агентами. |
| **AI agent platforms** | Relevance AI, Beam AI, Lyzr | Часто SaaS-only, нет self-hosted, ограниченный governance и audit. |

### Differentiators (что делает Scenario Builder уникальным)

| # | Differentiator | Описание |
|---|---------------|----------|
| 1 | **Spec-as-code governance** | Сценарий = декларативная спецификация с явными ограничениями (risk class, SLA, cost budget, allowed actions). Версионируется, тестируется в CI, ревьюится как код. Ни один agent framework этого не даёт. |
| 2 | **Built-in policy gates** | OPA integration, tool-level rate limiting, circuit breaking, PII masking, cost guardrails — всё из коробки, а не плагинами. |
| 3 | **Durable + lightweight execution** | Temporal для production (saga, recovery, long-running) + in-memory для dev/demo. Один и тот же spec, два runtime — без изменения кода. |
| 4 | **Full audit trail** | Каждое действие агента логируется с контекстом (tenant, tool, input/output, cost, policy decision). Экспорт для compliance. |
| 5 | **Self-hosted first** | Данные и модели остаются внутри периметра клиента. Критично для FinTech, HealthTech, enterprise. |
| 6 | **Multi-tenant native** | Tenant-aware API, policy isolation, execution isolation — не afterthought, а архитектурное решение. |

### Positioning Statement

> For **engineering teams in regulated industries** who need to automate complex operational processes with LLM agents,
> **Scenario Builder** is a **declarative scenario platform** that provides **built-in orchestration, policy gates, and full audit trail**.
> Unlike **agent frameworks** (LangChain, CrewAI) that require assembling governance from scratch,
> or **workflow platforms** (Airflow, Temporal raw) that lack agent capabilities,
> Scenario Builder delivers **governance-ready autonomous execution out of the box**.

## What Scenario Builder Is

Платформа для создания и запуска автономных сценариев на основе декларативной спецификации.

Ключевые свойства:
- Spec-as-source-of-truth: декларативная спецификация как единственный вход
- Orchestration-first: durable execution (Temporal / in-memory)
- Agent Runtime: tool calling, memory, guardrails
- Policy gates: OPA, RBAC, cost/quality/safety checks
- Event-driven: Kafka event streaming
- Observability: OpenTelemetry tracing + metrics

## Tech Stack

- **Language**: TypeScript (Node.js 20+)
- **Orchestration**: Temporal / in-memory runtime
- **Event Streaming**: Apache Kafka
- **Policy Engine**: OPA (Open Policy Agent)
- **Database**: SQLite (Prisma ORM), PostgreSQL-ready
- **LLM**: OpenAI Function Calling API, Ollama
- **Observability**: OpenTelemetry
- **CI/CD**: GitHub Actions, Docker, GHCR

## Related Documents

- Product readiness analysis: `docs/guides/PRODUCT_MARKET_READINESS.md`
- Execution plan: `docs/guides/PRODUCT_EXECUTION_PLAN.md`
- Delivery checklist: `docs/guides/PRODUCT_DELIVERY_CHECKLIST.md`
