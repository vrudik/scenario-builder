# Product Market Readiness

PM-взгляд на то, чего не хватает проекту, чтобы превратиться из сильной инженерной платформы и investor/demo-ready решения в конкурентный продукт для рынка.

Документ опирается на текущее состояние кодовой базы, админского UI, CI/CD, roadmap-документы и investor materials. Это не технический backlog реализации по файлам, а продуктовый список того, что нужно для:

- понятного позиционирования;
- безопасной эксплуатации у клиентов;
- предсказуемого онбординга;
- коммерциализации;
- enterprise-покупки;
- масштабируемого GTM.

Исполнимый план на ближайшие 3 спринта и разбивка по ролям: `docs/guides/PRODUCT_EXECUTION_PLAN.md`.

## Что уже есть

Проект уже выглядит как сильная platform core:

- есть `spec -> builder -> orchestrator -> gateway -> agent runtime`;
- есть in-memory и Temporal path;
- есть OPA, observability, audit, canary/shadow, cost/token guardrails;
- есть админка, demo flow, smoke/e2e, CI, GHCR, staging contour;
- есть multi-tenant база и tenant-aware API;
- есть investor/demo narrative.

Это хорошая база для "platform MVP". Но для конкурентного рынка этого еще недостаточно.

## Главный вывод

Сейчас продукт ближе к категории:

- `powerful technical platform / prototype platform MVP`

А для рынка нужен переход к категории:

- `secure, packaged, self-explanatory, commercially legible product`

Основной разрыв не в core orchestration, а в пяти зонах:

1. упаковка и позиционирование;
2. security / auth / enterprise trust;
3. onboarding и product UX для не-инженеров;
4. коммерческая модель и ограничения;
5. customer operations: support, SLO, docs, procurement.

## Что критично добавить

### 1. Единая продуктовая упаковка

Сейчас проект технически сильный, но как продукт еще не до конца "собран".

Что нужно:

- определить один канонический продукт и одно имя продукта во всех артефактах;
- убрать смешение контекстов репозитория, где `scenario-builder` и `hr-breaker` создают путаницу;
- сформулировать ICP: кому продукт продается первым;
- зафиксировать 2-3 основных use case, а не "все для всех";
- описать дифференциацию против альтернатив:
  - workflow/orchestration platforms;
  - agent frameworks;
  - internal tools / automation stacks;
  - iPaaS / low-code automation.

Без этого даже сильная платформа воспринимается как набор инженерных возможностей, а не как продукт.

### 2. Auth, RBAC, tenant trust model

Для рынка особенно важен не просто `tenantId`, а доверенная модель идентичности и доступа.

Что нужно:

- API authentication:
  - API keys на организацию/окружение;
  - ротация ключей;
  - revoke / audit;
- RBAC:
  - org admin;
  - builder/editor;
  - operator;
  - viewer/auditor;
- tenant binding:
  - tenant не должен определяться только клиентским заголовком;
  - нужен trust boundary: token/session/key -> organization -> tenant;
- audit trail по пользователю и организации, а не только по execution.

С точки зрения enterprise-продажи это один из главных gaps.

### 3. Security/compliance pack

Для конкурентного рынка мало "у нас есть OPA и guardrails". Нужен пакет доверия.

Что нужно:

- threat model;
- security overview;
- политика fail-open/fail-closed по OPA для production;
- secrets management guide;
- data retention policy;
- privacy posture;
- subprocessors list;
- DPA / security questionnaire starter pack;
- backup/restore и incident response outline.

Это нужно не только для юристов и security review, но и для ускорения сделок.

### 4. Product UX beyond admin UI

Сейчас UI полезен для операторов и разработчиков, но еще не выглядит как продукт для бизнес-команды или customer team.

Что нужно:

- onboarding flow без чтения большого количества markdown;
- first-run wizard:
  - создать workspace/org;
  - выбрать шаблон use case;
  - подключить provider/tools;
  - запустить первый сценарий;
- нормальный scenario catalog / templates UX;
- человеко-понятные guardrail explanations;
- execution troubleshooting UX:
  - "что пошло не так";
  - "что исправить";
  - "повторить с такими параметрами";
- различение режимов:
  - demo;
  - sandbox;
  - staging;
  - production.

Иначе продукт останется "админкой для разработчиков".

### 5. Commercial model

Чтобы стать продуктом, надо понимать, как он продается и ограничивается.

Что нужно:

- тарифы и packaging:
  - free/dev;
  - team;
  - business;
  - enterprise;
- billing dimensions:
  - executions;
  - LLM/tool spend;
  - seats;
  - environments;
- quota enforcement:
  - hard/soft limits;
  - alerts;
  - overage behavior;
- usage dashboard для клиента.

Сейчас cost-tracking есть как engineering control, но еще не как коммерческий слой.

### 6. Customer-facing API productization

API уже есть, но для рынка нужна продуктовая оболочка вокруг API.

Что нужно:

- versioned public API policy;
- OpenAPI/spec publish;
- SDKs хотя бы для:
  - TypeScript/Node;
  - Python;
- examples for top use cases;
- deprecation policy;
- changelog для API breaking changes;
- rate limit docs и response conventions;
- webhook/event contract.

Это сильно влияет на adoption.

### 7. Reliability promises and operating model

Нужно превратить "система работает" в "система работает предсказуемо".

Что нужно:

- SLO/SLA table:
  - availability;
  - p95 execution latency;
  - MTTR / RTO;
  - queue recovery expectations;
- production runbooks;
- alerting matrix;
- status page approach;
- support model:
  - response times;
  - escalation;
  - severity policy.

Для конкурентного рынка наличие Temporal/metrics само по себе не заменяет operating model.

### 8. Template and ecosystem strategy

Для platform-style продукта time-to-value часто решает не engine, а скорость запуска use case.

Что нужно:

- curated template library;
- template quality bar;
- vertical starter kits;
- reusable integrations catalog;
- import/export and sharing;
- в долгую:
  - marketplace;
  - partner ecosystem.

Сейчас это скорее backlog, а для рынка это может быть одним из главных accelerators.

### 9. Customer success artifacts

Нужны материалы не только для инженера, но и для покупателя и champion inside the customer.

Что нужно:

- website-ready product narrative;
- 3-5 customer stories / demo narratives;
- ROI framing:
  - cost reduction;
  - SLA improvement;
  - faster operations;
- deployment decision guide:
  - SaaS;
  - single-tenant;
  - on-prem / VPC;
- migration guide from manual ops / scripts / Zapier-like flows / internal bots.

### 10. Global readiness

Часть текущей документации и интерфейсов ориентирована на локальный/русскоязычный контур и investor-demo.

Для конкурентного рынка нужно:

- English-first docs pack;
- English UI copy for core surfaces;
- consistent terminology;
- public-facing docs information architecture.

## Приоритеты PM

### P0: must-have before real market push

Это то, без чего продукт трудно продавать и внедрять.

- [ ] Зафиксировать единое product positioning:
  - один product name;
  - ICP;
  - top-3 use cases;
  - comparison against alternatives.
- [x] Убрать repo/product narrative confusion (`scenario-builder` vs `hr-breaker`) в упаковке, docs и release story. *(Done: CLAUDE.md rewritten, pyproject.toml removed, all HTML titles unified — see `docs/product/PRODUCT_IDENTITY.md`)*
- [ ] Добавить API authentication model:
  - API keys;
  - secret rotation;
  - organization binding.
- [ ] Добавить RBAC и org/user model.
- [ ] Сделать tenant model trusted-by-design, а не только через `X-Tenant-ID`.
- [ ] Описать production security stance:
  - OPA fail-open/fail-closed;
  - secret handling;
  - audit boundaries.
- [ ] Выпустить public product docs pack:
  - quick start;
  - architecture;
  - API;
  - deployment options;
  - troubleshooting.
- [ ] Подготовить SLO/SLA и support model.
- [ ] Сформировать pricing/packaging hypothesis.
- [ ] Сделать onboarding "первый value за 15 минут".

### P1: should-have in first commercial phase

- [ ] Template catalog с opinionated starter kits.
- [ ] Usage dashboard и quota UX.
- [ ] OpenAPI + SDK roadmap, минимум TypeScript SDK.
- [ ] Customer-facing changelog и deprecation policy.
- [ ] Security overview + privacy/data retention docs.
- [ ] Procurement pack:
  - security FAQ;
  - DPA starter;
  - subprocessors list.
- [ ] Better operator UX:
  - понятные ошибки;
  - remediation steps;
  - replay/debug flow.
- [ ] Clear deployment packaging:
  - SaaS;
  - self-hosted;
  - single-tenant enterprise.

### P2: differentiation and scale

- [ ] Marketplace strategy.
- [ ] Partner/integration ecosystem.
- [ ] Vertical solutions page/templates.
- [ ] Benchmarking against competitors.
- [ ] Advanced governance:
  - policy federation;
  - tenant-specific bundles;
  - compliance packs by industry.
- [ ] Customer analytics:
  - activation;
  - retention;
  - template adoption;
  - execution success by org/use case.

## Market-ready checklist

### A. Product strategy

- [ ] Есть one-liner, который объясняет продукт за 10 секунд.
- [ ] Есть ICP для первой коммерческой фазы.
- [ ] Есть explicit "not for whom" list.
- [ ] Есть 3 основных сценария внедрения.
- [ ] Есть таблица differentiators против 3-5 альтернатив.

### B. Packaging

- [ ] Один продукт = одно имя = одна история.
- [ ] README, сайт, release notes и demo narrative не противоречат друг другу.
- [ ] Есть понятные deployment modes.
- [ ] Есть migration/upgrade story.

### C. Security and trust

- [ ] Есть auth.
- [ ] Есть RBAC.
- [ ] Есть trustworthy tenant isolation model.
- [ ] Есть audit export.
- [ ] Есть security overview.
- [ ] Есть documented production defaults для policy engine.

### D. Compliance and procurement

- [ ] Есть privacy/data retention docs.
- [ ] Есть subprocessors list.
- [ ] Есть DPA / security questionnaire starter pack.
- [ ] Есть backup/restore и incident response summary.

### E. User experience

- [ ] Есть onboarding без ручного чтения 10 документов.
- [ ] Есть "first successful scenario" flow.
- [ ] Есть понятный templates experience.
- [ ] Есть execution debugging UX.
- [ ] Есть разделение ролей: builder / operator / auditor / admin.

### F. API and integrations

- [ ] Есть versioned API strategy.
- [ ] Есть OpenAPI/spec publication.
- [ ] Есть client examples.
- [ ] Есть webhook/event contract.
- [ ] Есть rate limit and error contract docs.

### G. Reliability and operations

- [ ] Есть SLO/SLA table.
- [ ] Есть status page / incident communication plan.
- [ ] Есть alerting and runbooks.
- [ ] Есть reproducible restore/recovery story.
- [ ] Есть production acceptance checklist перед релизом.

### H. Commercialization

- [ ] Есть pricing hypothesis.
- [ ] Есть metering and quota model.
- [ ] Есть usage/billing visibility для клиента.
- [ ] Есть plan limits, not only technical limits.

### I. GTM and adoption

- [ ] Есть English-first external docs.
- [ ] Есть website/demo storyline.
- [ ] Есть ROI framing.
- [ ] Есть case-study ready narratives.
- [ ] Есть sales engineering checklist для пилота.

## Рекомендуемая последовательность

### Wave 1: превратить платформу в продаваемый продукт

1. Packaging and positioning.
2. Auth + RBAC + trusted tenant model.
3. Public docs pack.
4. Onboarding flow.
5. SLO/support/security stance.

### Wave 2: ускорить внедрение и пилоты

1. Templates and starter kits.
2. Usage dashboard.
3. SDK/OpenAPI.
4. Procurement pack.
5. Better operator UX.

### Wave 3: строить moat

1. Marketplace/ecosystem.
2. Vertical packs.
3. Advanced governance/compliance.
4. Deeper analytics and commercial controls.

## Definition of Market-Ready v1

Можно считать, что продукт вышел из стадии "tech-heavy MVP" в "competitive market-ready v1", когда одновременно выполнены условия:

- [ ] покупатель понимает, что это за продукт и для кого он;
- [ ] инженер клиента может запустить first value без ручной археологии по репозиторию;
- [ ] security review не упирается в отсутствие auth/RBAC/tenant trust model;
- [ ] ops-команда клиента понимает, как это мониторить, обновлять и восстанавливать;
- [ ] коммерческая модель и лимиты понятны;
- [ ] docs, UI и deployment story согласованы между собой;
- [ ] demo story совпадает с реальным продуктом, а не живет отдельно от него.

## Что бы я делал следующим спринтом

Если смотреть строго как PM, я бы поставил в следующий продуктовый спринт такой набор:

1. Product positioning pack:
   ICP, one-liner, top use cases, differentiation.
2. Security baseline for market:
   API keys, org model, RBAC draft, trusted tenant mapping.
3. Product docs pack:
   public quick start, deployment modes, API overview, security overview.
4. Guided onboarding:
   first-run path и template-first entry.
5. Commercial skeleton:
   pricing hypothesis, metering model, quota model.

Это даст больше product leverage, чем еще один технический инфраструктурный инкремент сам по себе.
