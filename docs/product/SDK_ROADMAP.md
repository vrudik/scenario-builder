# SDK Roadmap

Status: **Plan**

## Strategy

**OpenAPI-first generation** — generate SDKs from the OpenAPI spec (L-06) rather than hand-writing each one.

## SDK Priority

| Priority | Language | Reason | Timeline |
|----------|---------|--------|----------|
| 1 | **TypeScript / JavaScript** | Same ecosystem, largest developer base | Sprint 5 |
| 2 | **Python** | Data/ML teams, automation scripts | Sprint 6 |
| 3 | **Go** | Infrastructure teams, CLI tools | Sprint 7 |
| 4 | **Java / Kotlin** | Enterprise backend teams | Sprint 8 |
| 5 | **C# / .NET** | Enterprise Windows shops | Sprint 9 |

## SDK Structure

Each SDK provides:

```
scenario-builder-sdk-<lang>/
├── src/
│   ├── client.ts          # Main client class
│   ├── scenarios.ts       # Scenarios API
│   ├── executions.ts      # Executions API
│   ├── templates.ts       # Templates API
│   ├── audit.ts           # Audit API
│   ├── auth.ts            # Auth helpers
│   └── types.ts           # Generated types
├── examples/
├── README.md
├── package.json / setup.py / go.mod
└── tests/
```

## TypeScript SDK Example

```typescript
import { ScenarioBuilder } from '@scenario-builder/sdk';

const client = new ScenarioBuilder({
  baseUrl: 'https://api.example.com',
  apiKey: 'sb_live_abc123',
});

// Create scenario from template
const scenario = await client.templates.instantiate('tpl-ticket-triage', {
  name: 'My Ticket Triage',
});

// Execute scenario
const execution = await client.executions.create({
  scenarioId: scenario.id,
  input: { ticketId: 'TK-001' },
});

// Poll for result
const result = await client.executions.waitForCompletion(execution.id, {
  timeout: 30_000,
});

console.log(result.status, result.output);
```

## Python SDK Example

```python
from scenario_builder import Client

client = Client(
    base_url="https://api.example.com",
    api_key="sb_live_abc123",
)

scenario = client.templates.instantiate(
    "tpl-ticket-triage",
    name="My Ticket Triage",
)

execution = client.executions.create(
    scenario_id=scenario.id,
    input={"ticket_id": "TK-001"},
)

result = client.executions.wait_for_completion(
    execution.id,
    timeout=30,
)

print(result.status, result.output)
```

## Generation Pipeline

```
openapi.yaml → openapi-generator / autorest → SDK source → tests → publish
```

### Tools

| Option | Pros | Cons |
|--------|------|------|
| **openapi-generator** | Multi-language, mature | Verbose output, customization needed |
| **openapi-typescript** | Excellent TS output | TS only |
| **Stainless** | High quality, used by OpenAI | Commercial |
| **Custom** | Full control | High effort |

**Recommendation:** `openapi-typescript` for TS SDK (Phase 1), `openapi-generator` for other languages.

## Distribution

| Language | Package Registry | Package Name |
|----------|-----------------|-------------|
| TypeScript | npm | `@scenario-builder/sdk` |
| Python | PyPI | `scenario-builder` |
| Go | Go modules | `github.com/org/scenario-builder-go` |
| Java | Maven Central | `com.scenariobuilder:sdk` |
| C# | NuGet | `ScenarioBuilder.Sdk` |

## SDK Quality Requirements

- [ ] 100% API coverage (all endpoints)
- [ ] Type-safe (generated from OpenAPI types)
- [ ] Automatic retry with exponential backoff
- [ ] Pagination helpers
- [ ] WebSocket support for live execution updates
- [ ] Error types matching API error responses
- [ ] Integration test suite against live API
- [ ] CI/CD for automated publishing on API changes

## Dependencies

- L-05 (API versioning) — stable API surface
- L-06 (OpenAPI spec) — source for generation
- N-10 (Auth) — API key handling in SDK
