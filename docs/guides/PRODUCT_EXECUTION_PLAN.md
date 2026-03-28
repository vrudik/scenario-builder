# Product Execution Plan

Практический план на базе `PRODUCT_MARKET_READINESS.md`: что делать дальше, в каком порядке и кто за это отвечает, чтобы довести проект до market-ready v1.

Трекер в формате `Owner / Priority / ETA / Status`: `docs/guides/PRODUCT_DELIVERY_CHECKLIST.md`.

Этот документ отвечает на 3 вопроса:

1. Что делать в ближайшие 3 спринта.
2. Что является настоящим `P0`.
3. Кто должен быть owner по каждому блоку: PM, Design, Backend, DevOps, Security, GTM.

## Принцип планирования

Если цель именно "готовый для конкурентного рынка продукт", то ближайшие спринты должны быть не про еще одну инфраструктурную фичу, а про закрытие самых дорогих продуктовых рисков:

- непонятно, что это за продукт и кому он нужен;
- нет доверенной identity/access модели;
- онбординг пока developer-heavy;
- нет customer-facing security/commercial package;
- нет явной модели коммерциализации.

## Product goal на 3 спринта

К концу этого плана продукт должен перейти из состояния:

- `engineering platform with strong demo`

в состояние:

- `commercial pilot-ready product`

То есть:

- можно запускать пилоты;
- можно проходить базовый security review;
- можно показывать buyer-friendly narrative;
- можно объяснить pricing и deployment;
- можно вести клиента к first value предсказуемо.

## Спринт 1

### Цель

Собрать продуктовую упаковку и убрать главную путаницу в позиционировании.

### Ожидаемый результат

- любой новый человек понимает, что это за продукт;
- в репозитории есть одна каноническая история продукта;
- есть базовый buyer-facing narrative;
- появляется основа для сайта, презентации и sales conversations.

### Scope

#### 1. Product positioning pack

- определить:
  - один product name;
  - one-liner;
  - ICP;
  - top-3 use cases;
  - top-3 anti-use-cases;
- описать конкурентное поле:
  - orchestration platforms;
  - agent frameworks;
  - internal automation stacks;
  - iPaaS/low-code;
- сформулировать differentiators.

#### 2. Canonical docs cleanup

- убрать narrative-конфликт между `scenario-builder` и `hr-breaker`;
- определить, какой артефакт является source of truth для:
  - product story;
  - technical architecture;
  - deployment story;
  - demo story;
- привести README и product docs к единому языку и терминологии.

#### 3. Public docs skeleton

- создать публичный docs skeleton:
  - What is this product
  - Who it is for
  - Core use cases
  - How to start
  - Deployment modes
  - Security overview

#### 4. Buyer/demo narrative

- оформить:
  - elevator pitch;
  - 3-minute demo story;
  - 1-page product summary;
  - "why now / why us" narrative.

### Sprint 1 checklist

- [ ] Зафиксирован один канонический product name.
- [ ] Определен ICP для первой коммерческой волны.
- [ ] Зафиксированы top-3 use cases.
- [ ] Зафиксированы top-3 "не для кого / не для чего".
- [ ] Есть сравнительная таблица против альтернатив.
- [ ] README и docs не конфликтуют по product story.
- [ ] Есть buyer-friendly one-pager.
- [ ] Есть сайтоподобная docs structure.

## Спринт 2

### Цель

Закрыть базовый enterprise trust layer: auth, RBAC, tenant trust model и security stance.

### Ожидаемый результат

- продукт можно обсуждать с enterprise customer без провала на первом security review;
- tenant isolation больше не выглядит как "header-only";
- появляется foundation для org/workspace model.

### Scope

#### 1. Auth foundation

- API keys:
  - create;
  - rotate;
  - revoke;
  - audit;
- связка key -> organization -> environment/tenant.

#### 2. Org and RBAC model

- минимальные роли:
  - org admin;
  - builder/editor;
  - operator;
  - viewer/auditor;
- определить permissions matrix.

#### 3. Trusted tenant model

- tenant не должен приниматься как "любой валидный заголовок";
- tenant должен вытекать из identity;
- описать trusted boundary:
  - request credential;
  - organization;
  - tenant/workspace;
  - доступные ресурсы.

#### 4. Security posture docs

- Security Overview;
- OPA production stance:
  - fail-open vs fail-closed;
  - когда что используется;
- secrets handling;
- audit boundaries;
- baseline incident response.

### Sprint 2 checklist

- [ ] Есть API key model.
- [ ] Есть key rotation / revoke flow.
- [ ] Есть org model.
- [ ] Есть permissions matrix по ролям.
- [ ] Tenant определяется через trusted auth model.
- [ ] Есть Security Overview document.
- [ ] Есть documented policy-engine production defaults.
- [ ] Есть audit model по org/user, не только execution.

## Спринт 3

### Цель

Сделать продукт pilot-ready: first-run onboarding, pricing skeleton, customer docs и operational promises.

### Ожидаемый результат

- новый клиент может получить first value без ручной археологии;
- есть понятный pricing hypothesis;
- есть deployment and support story;
- продукт выглядит как pilotable solution, а не только как инженерная платформа.

### Scope

#### 1. First-run onboarding

- onboarding path:
  - создать org/workspace;
  - выбрать шаблон;
  - подключить provider/tools;
  - запустить первый сценарий;
- template-first entry;
- troubleshooting для first run.

#### 2. Commercial skeleton

- pricing hypothesis:
  - free/dev;
  - team;
  - business;
  - enterprise;
- metering model:
  - execution volume;
  - token/tool spend;
  - seats;
  - environments;
- quota model:
  - hard/soft limits;
  - alerts;
  - upgrade path.

#### 3. Customer docs pack

- deployment modes:
  - SaaS;
  - self-hosted;
  - single-tenant;
- pilot checklist;
- support model;
- SLO/SLA draft;
- procurement starter:
  - privacy;
  - retention;
  - subprocessors;
  - security FAQ.

#### 4. Operator experience

- сделать ошибки и remediation понятнее;
- оформить replay/debug narrative;
- привести admin/operator surfaces к понятной модели ролей.

### Sprint 3 checklist

- [ ] Есть first-run onboarding flow.
- [ ] Есть template-first start path.
- [ ] Есть pricing hypothesis.
- [ ] Есть metering/quota model.
- [ ] Есть deployment modes guide.
- [ ] Есть pilot checklist.
- [ ] Есть SLO/SLA draft.
- [ ] Есть support/severity model.
- [ ] Есть procurement starter pack.

## P0 only

Если ресурсов мало, а нужно выбрать только то, что реально критично для выхода на рынок, то вот настоящий `P0`.

### P0 themes

#### P0.1 Product clarity

- [ ] Один product name.
- [ ] ICP.
- [ ] 3 use cases.
- [ ] 1-page positioning.

#### P0.2 Trust model

- [ ] API auth.
- [ ] Org model.
- [ ] RBAC draft.
- [ ] Trusted tenant mapping.

#### P0.3 Security stance

- [ ] Security overview.
- [ ] OPA production defaults.
- [ ] secrets handling guide.
- [ ] audit/export story.

#### P0.4 Adoption

- [ ] First-run path.
- [ ] Public quick start.
- [ ] Deployment modes.
- [ ] Troubleshooting guide.

#### P0.5 Commercial readiness

- [ ] Pricing hypothesis.
- [ ] Quota/metering model.
- [ ] SLO/support model.

## Owners by role

### PM

Owner of:

- positioning;
- ICP;
- packaging;
- pricing hypothesis;
- pilot definition;
- roadmap sequencing;
- success metrics.

PM checklist:

- [ ] Написан one-liner.
- [ ] Утвержден ICP.
- [ ] Описаны 3 ключевых use case.
- [ ] Описан конкурентный landscape.
- [ ] Согласован pricing hypothesis.
- [ ] Согласованы pilot entry criteria.

### Design / UX

Owner of:

- first-run flow;
- template-first UX;
- role-based UI model;
- buyer/operator/admin information architecture.

Design checklist:

- [ ] Есть карта основных ролей.
- [ ] Есть first-run UX flow.
- [ ] Есть template catalog UX.
- [ ] Есть error/remediation UX.
- [ ] Есть понятное разделение demo/sandbox/staging/prod.

### Backend

Owner of:

- API auth;
- org/user/RBAC models;
- trusted tenant binding;
- usage metering foundation;
- public API contracts.

Backend checklist:

- [ ] Есть API key entities and flows.
- [ ] Есть org/user/role model.
- [ ] Tenant привязан к identity.
- [ ] Есть quota enforcement design.
- [ ] Есть versioning policy для API.

### DevOps / Platform

Owner of:

- deployment modes;
- production defaults;
- SLO/SLA instrumentation baseline;
- backup/restore/runbooks;
- supportability foundations.

DevOps checklist:

- [ ] Есть deployment matrix.
- [ ] Есть production config baseline.
- [ ] Есть backup/restore runbook.
- [ ] Есть alerting matrix.
- [ ] Есть release acceptance checklist.

### Security

Owner of:

- security overview;
- threat model;
- OPA posture;
- secrets management;
- audit model;
- procurement/security FAQ.

Security checklist:

- [ ] Есть threat model.
- [ ] Есть security overview.
- [ ] Есть policy-engine stance.
- [ ] Есть secrets guide.
- [ ] Есть incident response summary.
- [ ] Есть customer-facing security FAQ.

### GTM / Founder / Sales

Owner of:

- website narrative;
- category framing;
- ROI messaging;
- customer stories;
- pilot motion.

GTM checklist:

- [ ] Есть 3-minute pitch.
- [ ] Есть website narrative.
- [ ] Есть ROI framing.
- [ ] Есть sales demo script.
- [ ] Есть pilot checklist for prospects.

## Suggested milestones

### Milestone 1: Narrative-ready

Достигнут, если:

- [ ] продукт объясняется за 10 секунд;
- [ ] buyer-facing docs не конфликтуют;
- [ ] есть ICP и core use cases.

### Milestone 2: Security-review-ready

Достигнут, если:

- [ ] есть auth;
- [ ] есть RBAC draft;
- [ ] tenant model trusted;
- [ ] есть security overview.

### Milestone 3: Pilot-ready

Достигнут, если:

- [ ] есть first-run onboarding;
- [ ] есть deployment options;
- [ ] есть support/SLO model;
- [ ] есть pricing/quota skeleton.

## Success metrics for this plan

Нужно мерить не только инженерный прогресс, но и product readiness.

### Business / PM metrics

- [ ] Time to first successful scenario.
- [ ] Time to explain product to new prospect.
- [ ] Number of docs needed for first pilot.
- [ ] Number of unresolved trust/security objections.

### Adoption metrics

- [ ] Template-based first runs / all first runs.
- [ ] First-week activation rate.
- [ ] Share of scenarios launched without engineering help.

### Commercial metrics

- [ ] Clear mapping from usage to price.
- [ ] Share of pilot conversations with accepted packaging.

## Что не делать сейчас

Чтобы не потерять фокус, я бы не ставил в ближайшие 3 спринта как главный приоритет:

- полноценный marketplace;
- сложную partner ecosystem strategy;
- глубокие отраслевые compliance packs;
- большие UI refactors ради красоты без first-run effect;
- новые low-level инфраструктурные фичи без влияния на trust, onboarding или commercialization.

## Самый короткий ответ PM

Если совсем коротко, то рынку сейчас не хватает не еще одного workflow feature, а вот этого:

1. понятной упаковки;
2. доверенной identity/access модели;
3. онбординга;
4. pricing/quota logic;
5. security/compliance/support story.

Пока это не закрыто, продукт будет восприниматься как сильная технологическая основа, но не как зрелое конкурентное решение.
