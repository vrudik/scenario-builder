# Template Catalog

Curated набор шаблонов сценариев для быстрого старта и демонстрации возможностей платформы.

## Starter Templates (Onboarding)

Минимальная сложность, работают из коробки с mock-инструментами.

### 1. Customer Ticket Triage

| Field | Value |
|-------|-------|
| ID | `tpl-ticket-triage` |
| Category | `starter` |
| Difficulty | Simple |
| Tools | `get-ticket`, `classify-ticket` |
| Risk class | low |
| Cost budget | $0.05/run |
| Token budget | 2,000 |

**Сценарий:** Получить данные тикета → LLM-агент классифицирует (billing, technical, general) → маршрутизация на соответствующую очередь.

**Ценность для демо:** Показывает базовый agent flow с двумя tool calls и policy gate.

### 2. Order Status Lookup

| Field | Value |
|-------|-------|
| ID | `tpl-order-status` |
| Category | `starter` |
| Difficulty | Simple |
| Tools | `get-order`, `send-notification` |
| Risk class | low |
| Cost budget | $0.03/run |
| Token budget | 1,500 |

**Сценарий:** Получить статус заказа → сформировать сообщение клиенту → отправить уведомление.

**Ценность для демо:** Простейший end-to-end сценарий, минимальный порог входа.

### 3. Data Enrichment Pipeline

| Field | Value |
|-------|-------|
| ID | `tpl-data-enrichment` |
| Category | `starter` |
| Difficulty | Medium |
| Tools | `fetch-record`, `enrich-from-api`, `update-record` |
| Risk class | low |
| Cost budget | $0.10/run |
| Token budget | 3,000 |

**Сценарий:** Загрузить запись → обогатить данными из внешнего API → обновить запись.

**Ценность для демо:** Показывает multi-step pipeline без LLM-зависимости.

## Standard Templates (Production Recipes)

Более сложные сценарии для реальных задач.

### 4. Document Intake & Processing

| Field | Value |
|-------|-------|
| ID | `tpl-document-intake` |
| Category | `standard` |
| Difficulty | Medium |
| Tools | `parse-document`, `extract-fields`, `validate-data`, `store-record` |
| Risk class | moderate |
| Cost budget | $0.20/run |
| Token budget | 5,000 |

**Сценарий:** Разобрать документ → извлечь структурированные поля → валидировать по правилам → сохранить. Для moderate risk class — PII masking в OPA input.

### 5. Incident Response Automation

| Field | Value |
|-------|-------|
| ID | `tpl-incident-response` |
| Category | `standard` |
| Difficulty | Medium |
| Tools | `get-alert`, `assess-severity`, `notify-team`, `create-ticket` |
| Risk class | moderate |
| Cost budget | $0.15/run |
| Token budget | 4,000 |

**Сценарий:** Получить алерт → оценить severity (LLM) → уведомить on-call команду → создать тикет в трекере. Human-in-the-loop для critical severity.

### 6. Customer Onboarding Flow

| Field | Value |
|-------|-------|
| ID | `tpl-customer-onboarding` |
| Category | `standard` |
| Difficulty | Medium |
| Tools | `create-account`, `send-welcome-email`, `provision-resources`, `schedule-call` |
| Risk class | low |
| Cost budget | $0.10/run |
| Token budget | 3,000 |

**Сценарий:** Создать аккаунт → отправить welcome email → провизионировать ресурсы → запланировать onboarding call. Saga pattern: при ошибке — компенсация (удаление аккаунта, отмена звонка).

### 7. Compliance Check Pipeline

| Field | Value |
|-------|-------|
| ID | `tpl-compliance-check` |
| Category | `standard` |
| Difficulty | Advanced |
| Tools | `fetch-entity`, `run-kyc-check`, `check-sanctions-list`, `generate-report`, `submit-for-review` |
| Risk class | high |
| Cost budget | $0.50/run |
| Token budget | 10,000 |

**Сценарий:** KYC/AML проверка: загрузить данные → проверить по sanctions list → сгенерировать отчёт → отправить на ревью. High risk = requires_approval для submit-for-review.

### 8. Content Moderation

| Field | Value |
|-------|-------|
| ID | `tpl-content-moderation` |
| Category | `standard` |
| Difficulty | Medium |
| Tools | `fetch-content`, `analyze-content`, `apply-action`, `log-decision` |
| Risk class | moderate |
| Cost budget | $0.08/run |
| Token budget | 3,000 |

**Сценарий:** Получить пользовательский контент → LLM-анализ на нарушения → применить действие (approve/flag/remove) → залогировать решение в audit.

### 9. Lead Qualification

| Field | Value |
|-------|-------|
| ID | `tpl-lead-qualification` |
| Category | `standard` |
| Difficulty | Medium |
| Tools | `get-lead-data`, `enrich-company-info`, `score-lead`, `update-crm` |
| Risk class | low |
| Cost budget | $0.12/run |
| Token budget | 4,000 |

**Сценарий:** Получить данные лида → обогатить информацией о компании → LLM оценивает fit (scoring) → обновить CRM с оценкой.

### 10. Scheduled Report Generation

| Field | Value |
|-------|-------|
| ID | `tpl-scheduled-report` |
| Category | `standard` |
| Difficulty | Simple |
| Tools | `query-data`, `generate-summary`, `send-report` |
| Risk class | low |
| Cost budget | $0.15/run |
| Token budget | 5,000 |

**Сценарий:** Запросить данные → LLM генерирует текстовый summary → отправить отчёт по email/Slack. Подходит для cron-triggered сценариев.

## Catalog Summary

| Tier | Count | Difficulty Range |
|------|-------|-----------------|
| Starter | 3 | Simple — Medium |
| Standard | 7 | Simple — Advanced |
| **Total Wave 1** | **10** | |

## Seeding

Templates stored in `templates/catalog/` as JSON files and seeded on first server start:

```
templates/catalog/
├── starter/
│   ├── ticket-triage.json
│   ├── order-status.json
│   └── data-enrichment.json
└── standard/
    ├── document-intake.json
    ├── incident-response.json
    ├── customer-onboarding.json
    ├── compliance-check.json
    ├── content-moderation.json
    ├── lead-qualification.json
    └── scheduled-report.json
```

## Dependencies

- N-18 (Template-first entry) — UX for template selection
- Existing `Template` model in Prisma
- Existing `admin-templates.html` page
