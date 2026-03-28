# Product Delivery Checklist

Операционный продуктовый board для weekly tracking в формате `Next / Later / Backlog`.

Связанные документы:

- стратегия и gaps: `docs/guides/PRODUCT_MARKET_READINESS.md`
- план по спринтам и ролям: `docs/guides/PRODUCT_EXECUTION_PLAN.md`

## Как пользоваться

- `Bucket`:
  - `Next` — брать в работу сейчас
  - `Later` — следующий слой после `Next`
  - `Backlog` — не фокус до закрытия первых двух слоёв
- `Priority`:
  - `P0` — критично до market push
  - `P1` — нужно для первой коммерческой фазы
  - `P2` — усиление differentiation / scale
- `Status`:
  - `todo`
  - `in_progress`
  - `blocked`
  - `done`

Главное правило:

- пока не закрыт основной `Next/P0`, не тратить основной фокус на marketplace, глубокие ecosystem-фичи и косметические UI-рефакторы.

## Master Sequential Order

Если задача уходит в модель на последовательную разработку, отправляй **строго сверху вниз** по этому списку.  
Логика порядка такая:

1. сначала product clarity и packaging;
2. потом trust/security foundation;
3. потом onboarding, operations и commercial skeleton;
4. потом customer-facing expansion;
5. потом moat / long-tail backlog.

| Order | ID | Bucket | Task | Почему здесь |
|------:|----|--------|------|--------------|
| 1 | N-01 | Next | Зафиксировать один канонический product name | Без этого все остальные артефакты будут расходиться |
| 2 | N-02 | Next | Сформулировать one-liner продукта | Нужно для docs, pitch, сайта, sales |
| 3 | N-03 | Next | Утвердить ICP первой коммерческой волны | Определяет, для кого делается продукт |
| 4 | N-04 | Next | Зафиксировать top-3 use cases и anti-use-cases | Сужает scope и убирает "для всех" |
| 5 | N-05 | Next | Собрать differentiators vs alternatives | Нужна конкурентная рамка |
| 6 | N-06 | Next | Убрать narrative-conflict между `scenario-builder` и `hr-breaker` | Иначе packaging останется сломанным |
| 7 | N-07 | Next | Привести README, quick start и demo-story к одному narrative | Документы должны говорить одно и то же |
| 8 | N-08 | Next | Собрать public docs skeleton | База для внешней документации |
| 9 | N-09 | Next | Подготовить buyer-friendly one-pager | Первый GTM-артефакт после positioning |
| 10 | N-10 | Next | Спроектировать API auth model | Первый обязательный слой enterprise trust |
| 11 | N-11 | Next | Спроектировать org/workspace model | Основа для auth, RBAC и tenancy |
| 12 | N-12 | Next | Спроектировать RBAC matrix | Без ролей нет enterprise access story |
| 13 | N-13 | Next | Спроектировать trusted tenant mapping | Убирает header-only tenancy модель |
| 14 | N-14 | Next | Подготовить Security Overview | Нужен buyer-facing trust document |
| 15 | N-15 | Next | Зафиксировать production stance для OPA и secrets | Нужна production security позиция |
| 16 | N-16 | Next | Описать audit/export boundaries | Завершает trust model на уровне governance |
| 17 | N-17 | Next | Спроектировать first-run onboarding flow | После product clarity и trust можно делать onboarding |
| 18 | N-18 | Next | Спроектировать template-first entry path | Ускоряет first value поверх onboarding |
| 19 | N-19 | Next | Подготовить deployment modes guide | Нужно для self-hosted / enterprise обсуждений |
| 20 | N-20 | Next | Подготовить SLO/SLA draft и support/severity model | Формирует operating promise |
| 21 | N-21 | Next | Подготовить pricing hypothesis | После ICP и deployment modes pricing уже осмыслен |
| 22 | N-22 | Next | Зафиксировать metering/quota model | Коммерческая логика должна опираться на pricing |
| 23 | L-01 | Later | Собрать curated template catalog | Следующий рычаг ускорения внедрения |
| 24 | L-02 | Later | Спроектировать templates UX и scenario catalog | После определения каталога |
| 25 | L-03 | Later | Сделать понятный troubleshooting / remediation flow | Усиливает операторский UX после first-run |
| 26 | L-04 | Later | Развести роли builder/operator/auditor/admin в UX | UX-слой на базе RBAC |
| 27 | L-05 | Later | Зафиксировать public API versioning policy | После auth/trust и packaging API можно продуктировать |
| 28 | L-06 | Later | Подготовить OpenAPI/spec publication plan | Следует после versioning policy |
| 29 | L-07 | Later | Описать webhook/event contract | Следующий шаг внешней интеграции |
| 30 | L-08 | Later | Спроектировать usage dashboard | Нужен после metering/quota model |
| 31 | L-09 | Later | Подготовить privacy/data retention docs | Procurement-ready слой |
| 32 | L-10 | Later | Подготовить subprocessors list | Идет рядом с privacy posture |
| 33 | L-11 | Later | Подготовить DPA / security questionnaire starter pack | Завершает procurement starter |
| 34 | L-12 | Later | Подготовить website-ready narrative | Имеет смысл после positioning и trust docs |
| 35 | L-13 | Later | Подготовить ROI framing и pilot story | Делается после packaging и commercial skeleton |
| 36 | L-14 | Later | Подготовить sales engineering pilot checklist | Готовит системный pilot motion |
| 37 | L-15 | Later | Определить product success metrics | Нужны для product management цикла |
| 38 | L-16 | Later | Определить commercial metrics | Нужны для GTM и pricing validation |
| 39 | B-06 | Backlog | Сформировать SDK roadmap | После стабилизации API contracts |
| 40 | B-07 | Backlog | Спроектировать customer billing UX | После pricing/metering/usage visibility |
| 41 | B-03 | Backlog | Подготовить vertical starter kits | После template catalog и pilot learnings |
| 42 | B-01 | Backlog | Оформить marketplace strategy | Имеет смысл только на базе каталога и adoption |
| 43 | B-02 | Backlog | Описать partner/integration motion | Следствие ecosystem strategy |
| 44 | B-04 | Backlog | Спроектировать tenant-specific OPA bundle / policy federation | Глубокий enterprise governance layer |
| 45 | B-05 | Backlog | Спроектировать deeper tenant isolation in runtime | Самый поздний platform-hardening layer |

### Rule For Sequential Model Work

Если отправляешь задачи в модель по одной:

- бери следующую незакрытую задачу из `Master Sequential Order`;
- не прыгай через пункты 10-22, потому что это foundation layer;
- в `Later` переходи только после закрытия всего `Next`;
- в `Backlog` переходи только после явного product-review решения.

## Next

Это то, что имеет смысл запускать немедленно.

| ID | Workstream | Task | Owner | Priority | ETA | Status | Deliverable |
|----|------------|------|-------|----------|-----|--------|-------------|
| N-01 | Positioning | Зафиксировать один канонический product name | PM | P0 | Sprint 1 | done | `docs/product/PRODUCT_IDENTITY.md`, CLAUDE.md rewritten, pyproject.toml removed, all HTML titles unified |
| N-02 | Positioning | Сформулировать one-liner продукта | PM | P0 | Sprint 1 | done | One-liner EN/RU в `PRODUCT_IDENTITY.md`, README.md обновлён |
| N-03 | Positioning | Утвердить ICP первой коммерческой волны | PM / GTM | P0 | Sprint 1 | done | ICP в `docs/product/PRODUCT_IDENTITY.md` — target company, buyer persona, anti-ICP |
| N-04 | Positioning | Зафиксировать top-3 use cases и anti-use-cases | PM | P0 | Sprint 1 | done | UC-1/2/3 + anti-use-cases в `PRODUCT_IDENTITY.md` |
| N-05 | Positioning | Собрать differentiators vs alternatives | PM / GTM | P0 | Sprint 1 | done | Competitive positioning + 6 differentiators + positioning statement в `PRODUCT_IDENTITY.md` |
| N-06 | Packaging | Убрать narrative-conflict между `scenario-builder` и `hr-breaker` | PM / Tech Lead | P0 | Sprint 1 | done | CLAUDE.md rewritten, pyproject.toml removed, PRODUCT_IDENTITY.md naming rules |
| N-07 | Docs | Привести README, quick start и demo-story к одному narrative | PM / DevRel | P0 | Sprint 1 | done | README rewritten (product-first), QUICK_START.md cleaned, demo-e2e.html branded |
| N-08 | Docs | Собрать public docs skeleton | PM / DevRel | P0 | Sprint 1 | done | `docs/PUBLIC_DOCS_INDEX.md` — полная структура, mapping существующих docs, gaps |
| N-09 | Sales Enablement | Подготовить buyer-friendly one-pager | PM / GTM | P0 | Sprint 1 | done | `docs/product/ONE_PAGER.md` — problem, solution, differentiators, use cases, CTA |
| N-10 | Trust | Спроектировать API auth model | Backend / Security | P0 | Sprint 2 | done | `docs/design/API_AUTH_MODEL.md` — API keys, session auth, service tokens, middleware, migration path |
| N-11 | Trust | Спроектировать org/workspace model | Backend | P0 | Sprint 2 | done | `docs/design/ORG_WORKSPACE_MODEL.md` — Org, Workspace, OrgMember models, tenant mapping, APIs |
| N-12 | Trust | Спроектировать RBAC matrix | Backend / PM / Security | P0 | Sprint 2 | done | `docs/design/RBAC_MATRIX.md` — 5 roles, full permission matrix, scope mapping, OPA integration |
| N-13 | Trust | Спроектировать trusted tenant mapping | Backend / Security | P0 | Sprint 2 | done | `docs/design/TRUSTED_TENANT_MAPPING.md` — identity-bound resolution, OPA enhancement, migration |
| N-14 | Security | Подготовить Security Overview | Security / PM | P0 | Sprint 2 | done | `docs/product/SECURITY_OVERVIEW.md` — auth, RBAC, isolation, audit, guardrails, compliance |
| N-15 | Security | Зафиксировать production stance для OPA и secrets | Security / DevOps | P0 | Sprint 2 | done | `docs/design/PRODUCTION_STANCE_OPA_SECRETS.md` — fail-closed, secrets tiers, rotation, Docker example |
| N-16 | Security | Описать audit/export boundaries | Security / Backend | P0 | Sprint 2 | done | `docs/design/AUDIT_EXPORT_BOUNDARIES.md` — org-scoped, export API, retention, compliance mapping |
| N-17 | Onboarding | Спроектировать first-run onboarding flow | Design / PM | P0 | Sprint 3 | done | `docs/design/ONBOARDING_FLOW.md` — 6-step flow, templates, API, metrics |
| N-18 | Onboarding | Спроектировать template-first entry path | Design / Backend | P0 | Sprint 3 | done | `docs/design/TEMPLATE_FIRST_ENTRY.md` — template tiers, 5 starters, UX flow, mock tools |
| N-19 | Ops | Подготовить deployment modes guide | DevOps / PM | P0 | Sprint 3 | done | `docs/product/DEPLOYMENT_MODES.md` — Single/Compose/K8s, feature matrix, migration |
| N-20 | Ops | Подготовить SLO/SLA draft и support/severity model | PM / DevOps / Founder | P0 | Sprint 3 | done | `docs/product/SLO_SLA_SUPPORT.md` — SLO targets, SLA tiers, severity levels, alerting |
| N-21 | Commercial | Подготовить pricing hypothesis | PM / Founder | P0 | Sprint 3 | done | `docs/product/PRICING_HYPOTHESIS.md` — 4 tiers, usage-based, feature gates, self-hosted |
| N-22 | Commercial | Зафиксировать metering/quota model | PM / Backend | P0 | Sprint 3 | done | `docs/design/METERING_QUOTA_MODEL.md` — 6 dimensions, quota enforcement, usage API, batched writes |

## Later

Это следующий слой после закрытия `Next`.

| ID | Workstream | Task | Owner | Priority | ETA | Status | Deliverable |
|----|------------|------|-------|----------|-----|--------|-------------|
| L-01 | Templates | Собрать curated template catalog | PM / Design / Backend | P1 | Sprint 4 | done | `docs/product/TEMPLATE_CATALOG.md` + 8 JSON templates в `templates/catalog/` |
| L-02 | UX | Спроектировать templates UX и scenario catalog | Design | P1 | Sprint 4 | done | `docs/design/TEMPLATES_UX.md` — gallery layout, cards, instantiation flow |
| L-03 | UX | Сделать понятный troubleshooting / remediation flow | Design / Backend | P1 | Sprint 4 | done | `docs/design/TROUBLESHOOTING_UX.md` — error classification, remediation actions, health status |
| L-04 | UX | Развести роли builder/operator/auditor/admin в UX | Design / PM | P1 | Sprint 4 | done | `docs/design/ROLE_BASED_UX.md` — nav visibility, action visibility, dashboard variants |
| L-05 | API | Зафиксировать public API versioning policy | Backend / PM | P1 | Sprint 4 | done | `docs/design/API_VERSIONING_POLICY.md` — URL-based major + date-based minor |
| L-06 | API | Подготовить OpenAPI/spec publication plan | Backend / DevRel | P1 | Sprint 4 | done | `docs/design/OPENAPI_PUBLICATION_PLAN.md` — 3-phase plan, Swagger UI |
| L-07 | API | Описать webhook/event contract | Backend | P1 | Sprint 4 | done | `docs/design/WEBHOOK_EVENT_CONTRACT.md` — 9 event types, HMAC signing, delivery guarantees |
| L-08 | Commercial | Спроектировать usage dashboard | PM / Design / Backend | P1 | Sprint 4 | done | `docs/design/USAGE_DASHBOARD_UX.md` — layout, quota bars, trend charts |
| L-09 | Trust | Подготовить privacy/data retention docs | PM / Security / Legal | P1 | Sprint 4 | done | `docs/product/PRIVACY_DATA_RETENTION.md` — data categories, retention, deletion, LLM policy |
| L-10 | Trust | Подготовить subprocessors list | PM / Legal | P1 | Sprint 4 | done | `docs/product/SUBPROCESSORS.md` — self-hosted vs managed, notification process |
| L-11 | Trust | Подготовить DPA / security questionnaire starter pack | PM / Security / Legal | P1 | Sprint 4 | done | `docs/product/DPA_SECURITY_QUESTIONNAIRE.md` — DPA terms, 25+ questionnaire responses |
| L-12 | GTM | Подготовить website-ready narrative | GTM / PM | P1 | Sprint 4 | done | `docs/product/WEBSITE_NARRATIVE.md` — hero, value props, comparison, pricing preview |
| L-13 | GTM | Подготовить ROI framing и pilot story | GTM / PM / Founder | P1 | Sprint 4 | done | `docs/product/ROI_PILOT_STORY.md` — ROI framework, pilot structure, report template |
| L-14 | GTM | Подготовить sales engineering pilot checklist | GTM / Solutions / PM | P1 | Sprint 4 | done | `docs/product/PILOT_CHECKLIST.md` — pre/during/post pilot, red flags |
| L-15 | Analytics | Определить product success metrics | PM / Data | P1 | Sprint 4 | done | `docs/product/PRODUCT_METRICS.md` — activation, engagement, quality, pilot metrics |
| L-16 | Analytics | Определить commercial metrics | PM / Founder | P1 | Sprint 4 | done | `docs/product/PRODUCT_METRICS.md` — revenue, usage-to-revenue, growth, efficiency |

## Backlog

Это важные направления, но не ближайший фокус.

| ID | Workstream | Task | Owner | Priority | ETA | Status | Deliverable |
|----|------------|------|-------|----------|-----|--------|-------------|
| B-01 | Ecosystem | Оформить marketplace strategy | PM / GTM | P2 | Backlog | done | `docs/product/MARKETPLACE_STRATEGY.md` — components, tiers, revenue model, phased rollout |
| B-02 | Ecosystem | Описать partner/integration motion | GTM / PM | P2 | Backlog | done | `docs/product/PARTNER_INTEGRATION_MOTION.md` — 4 partner categories, integration levels, GTM |
| B-03 | Verticalization | Подготовить vertical starter kits | PM / Solutions | P2 | Backlog | done | `docs/product/VERTICAL_STARTER_KITS.md` — 4 verticals (FinTech, CX, HealthTech, E-Commerce) |
| B-04 | Governance | Спроектировать tenant-specific OPA bundle / policy federation | Security | P2 | Backlog | done | `docs/design/OPA_POLICY_FEDERATION.md` — 3 approaches, layered → bundles → sidecar |
| B-05 | Governance | Спроектировать deeper tenant isolation in runtime | Backend | P2 | Backlog | done | `docs/design/TENANT_RUNTIME_ISOLATION.md` — 4 levels (L0–L3), migration path, Temporal integration |
| B-06 | API | Сформировать SDK roadmap | PM / Backend / DevRel | P1 | Backlog | done | `docs/product/SDK_ROADMAP.md` — 5 languages, OpenAPI-first generation, distribution plan |
| B-07 | Commercial | Спроектировать customer billing UX | PM / Design / Backend | P1 | Backlog | done | `docs/design/BILLING_UX.md` — 4 pages, Stripe integration, spending controls, grace period |

## P0 Cut

Если нужен совсем жесткий минимум для market push, то фокус только на этих задачах:

- [x] `N-01` Product name
- [x] `N-02` One-liner
- [x] `N-03` ICP
- [x] `N-04` Use cases / anti-use-cases
- [x] `N-06` Narrative conflict cleanup
- [x] `N-07` Docs narrative alignment
- [x] `N-10` API auth model
- [x] `N-11` Org/workspace model
- [x] `N-12` RBAC matrix
- [x] `N-13` Trusted tenant mapping
- [x] `N-14` Security Overview
- [x] `N-15` OPA/secrets production stance
- [x] `N-17` First-run onboarding flow
- [x] `N-18` Template-first entry
- [x] `N-19` Deployment modes guide
- [x] `N-20` SLO/SLA + support model
- [x] `N-21` Pricing hypothesis
- [x] `N-22` Metering/quota model

## Suggested owners summary

| Role | Main ownership |
|------|----------------|
| PM | Positioning, ICP, pricing, roadmap, docs priorities |
| Founder / GTM | Product story, sales narrative, pilot motion |
| Backend | Auth, org model, RBAC, tenant trust, API contracts |
| Security | Security stance, trust docs, procurement materials |
| DevOps | Deployment modes, SLO/SLA baseline, production runbooks |
| Design | Onboarding, role-based UX, operator experience |
| DevRel | Public docs pack, API examples, onboarding docs |

## Exit Criteria

### Can start paid/commercial pilots

- [x] Все задачи из `Next` со статусом `P0` переведены в `done`
- [x] Нет конфликтующего product narrative
- [x] Есть buyer-facing docs pack
- [x] Есть auth / RBAC / trusted tenant direction
- [x] Есть deployment/support/SLO story
- [x] Есть pricing and quota draft

### Can claim market-ready v1

- [x] Закрыт весь `Next`
- [x] Закрыта большая часть `Later`
- [x] Procurement pack существует
- [x] API/doc/deployment story согласованы
- [x] First-run onboarding реально сокращает путь до первого value

## Weekly Review Template

Использовать на еженедельном product review:

| Question | Answer |
|----------|--------|
| Что закрыли за неделю? |  |
| Что сейчас в `Next / in_progress`? |  |
| Что заблокировано? |  |
| Какие `P0` риски остались? |  |
| Что угрожает pilot-readiness? |  |
| Нужно ли что-то переносить из `Later` в `Next`? |  |
