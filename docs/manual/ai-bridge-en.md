# AI Bridge: Existing-System AIization Integration Spec (OpenAPI / Schema → Tool → Governance)

> **Status markers**: ✅ verified in the current implementation / 🚧 planned (P1, not implemented).
> Positioning: don't replace, don't migrate — give existing systems (Java/Spring, legacy DB, REST APIs) safe AI capability.
> This file is the spec + integration guide for "Route B / AI Bridge productization"; market-positioning wording lives in the private roadmap, this file stays factual.

---

## 1. Goal and the Two Paths

| Path | What it does | Status | Use when |
|---|---|---|---|
| **A. Schema rebuild** | Legacy DB schema → Protocol → generate a new module (KeelBase manages CRUD + AI on the same data) | ✅ `--import-schema` / `--import-openapi` verified | Data can be taken over in the same DB, and you want KeelBase-managed CRUD + AI |
| **B. API proxy** | OpenAPI operations → generate proxy tools → **call the existing system's REST endpoints directly** (carrying identity, through governance) | 🚧 P1, not implemented (only `web-search.tool.ts` is an external-HTTP precedent) | You can't touch the legacy system, and AI must operate on live existing data |

> **Key honest note**: A is "new development reverse-engineered from a schema"; only B is "operating the existing system".
> The market narrative "no migration, no rewrite" is only fully delivered by **B**; A promises "same-DB takeover + AI-ization".
> Pick the path via the §6 decision table — don't treat A as B.

---

## 2. Current Capability Inventory (Path A, ✅ verified)

- `node scripts/keelbase-init.mjs --import-openapi swagger.json` (OpenAPI 3 `components.schemas` / Swagger 2 `definitions`; **supports `.yaml/.yml` + multi-file local relative `$ref` auto-merge + `--list-schemas`**)
- `--import-schema schema.sql --table xxx` (`CHECK IN` → enum, `VARCHAR(120)` → string, `DECIMAL` → int)
- Type mapping: string / text / int / bool / date / enum (2-10 valid lowercase options), invalid → degrade to string
- Reserved fields skipped: `id / userId / createdAt / updatedAt / deletedAt`
- Relationships skipped: `object / array / $ref` stay hand-written (protocol red line; the diagnostic report notes the relationship targets)
- `--out` writes Protocol JSON (for review / reuse via `--spec`); `--module / --label / --schema` to specify
- **Identity bridge**: `POST /auth/delegation-token` issues a short-lived delegated JWT (the Java system verifies with a shared key and maps it to a local user, §5)
- Test coverage: type mapping, Swagger 2, no schemas, invalid-enum degradation, YAML, $ref/allOf, number precision, CLI end-to-end (`--out` + direct generation)
- References: `scripts/keelbase-init.test.mjs` P0-12 section; [aiization-demo.md](aiization-demo.md)

---

## 3. Import Hardening Checklist (Path A, with acceptance)

> Status: ✅ done (2026-08-20) / 🚧 planned (P1, not implemented)

| # | Hardening | Problem | Status | Acceptance criteria |
|---|---|---|---|---|
| 1 | **required passthrough** | OpenAPI `required` array not mapped to Protocol `required` | ✅ | required fields → Protocol `required: true` → **required in the AI tool input schema** (the Agent must provide) + **create DTO `@IsNotEmpty()` non-optional** + **frontend model `required`**; unit + CLI e2e coverage |
| 2 | **label/description passthrough** | schema property `title/description` lost | ✅ | `title` preferred / `description` fallback → Protocol `label` (flows into the AI tool parameter description); quotes/newlines/backslashes sanitized, capped at 40 |
| 3 | **multiple schemas / modules** | only the first schema taken, the rest silently dropped | ✅ (`--list-schemas`) | `--list-schemas` lists available schemas (unselected go into the manual checklist); `--schema <name>` picks one. `--schemas a,b` multi-module loop deferred |
| 4 | **$ref / allOf shallow parsing** | `$ref` / `allOf` skipped outright | ✅ | field-level `$ref` / allOf containing `$ref` → relationship noted in the manual checklist; top-level allOf → merge scalar properties + required |
| 5 | **YAML support** | only JSON, but real enterprise specs are mostly YAML | ✅ | built-in YAML-subset parser (zero-dependency `yaml.mjs`), `.yaml/.yml` imported directly (nested map/list/quotes/inline enum/multiline) |
| 6 | **skip diagnostic report** | fields silently skipped, Java teams don't know what's missing | ✅ | `--out` protocol includes `skipped: [{ name, reason }]` (reserved/relationship/invalid name/enum degradation); direct generation prints diagnostics to the terminal |
| 7 | **enum degradation warning** | invalid enum options silently degrade to string | ✅ | degradation recorded in `skipped` (reason includes "degraded to string"), no longer silent |
| 8 | **number precision hint** | `number` → int loses precision (price/amount) | ✅ | OpenAPI `number`/`format:double` + SQL `DECIMAL`/`REAL`/`FLOAT` → int prints a "keep text/int, be careful with amount fields" hint (`notes` printed) |
| 9 | **multi-file OpenAPI** | enterprise specs are often split across files | ✅ | local relative `$ref: './other.yaml#/...'` auto-loads external files and merges their schemas |

**Done (first pass 2026-08-20 + AI Bridge hardening 2026-08-23)**:
- `import-schema` symmetric hardening — `NOT NULL` → `required` + the same `skipped` diagnostics (reserved columns / constraint lines / unknown types / unparseable) + `DECIMAL`/`REAL`/`FLOAT` precision `notes`
- **DTO required fields** — `required` fields → create DTO `@IsNotEmpty()` + `@ApiProperty` + non-optional; frontend model `required this.x` + non-nullable type
- **§3 remaining 5 items (#3/#4/#5/#8/#9) all landed** — YAML parsing, $ref/allOf, multi-file merge, precision hints, list-schemas; CLI tests 44→47

**Deferred (§3 remaining planned items)**: `--schemas a,b` multi-module loop generation (current `--list-schemas` + single `--schema` already covers selection / manual checklist)

---

## 4. API Proxy Tool Path (Route B, ✅ MVP landed 2026-08-23; full B pending)

Goal: `OpenAPI operations → generate proxy tools → call the existing system's REST endpoints directly`, all through the governance layer.

```text
Existing system REST
   ↓
OpenAPI (with operations + securitySchemes)
   ↓
Generator: each business operation → one AI Tool definition (read/write, param schema, risk level)
   ↓
Runtime: ProxyTool → HTTP call to the target endpoint (injecting the user's delegated identity)
   ↓
Governance: Permission / Risk / Confirmation / Audit (reusing the HS-9 governance layer)
```

**✅ MVP (2026-08-23)**:
- Runtime `ProxyTool` (`src/ai/proxy/proxy-tool.ts`): Settings `ai_proxy_tools` dynamic config (`{ baseUrl, audience, tools[{ name, method, path, parameters, riskLevel }] }`) → `ProxyToolRegistryService` registers into the ToolRegistry at startup
- read → R1 automatic; write → R3 Confirmation (derived from method by default; `requiresConfirmation` gate goes through the existing confirmation flow)
- Delegated identity injection: at execute time `DelegationTokenService.sign(userId, audience)` → `Authorization: Bearer <delegated JWT>` (§5)
- Error semantics: target 4xx/5xx passed through as tool failure reasons, for the Agent to fall back
- **e2e acceptance (`test/proxy-bridge.e2e-spec.ts`, simulating a Java system) 3/3**: read tool injects delegated identity into the target + recognizes the user / write tool R3 confirmation gate + body delivery / cross-user (target 403) → tool failure passthrough

**✅ openapi-proxy generator (2026-08-23)**: `keelbase-init --import-openapi-proxy <spec> --base-url <url> --audience <id> [--out proxy.json]` — **auto-generates** `ai_proxy_tools` config from OpenAPI `paths` operations (replacing hand-written JSON):
- each operation → one tool: `name` (operationId preferred, camelCase → snake_case; conflict dedup) + `method` + `path` (OpenAPI path templates `{param}` passed through as-is, same shape as ProxyTool placeholders) + `parameters` (required path + query + requestBody JSON schema properties, required passthrough) + `riskLevel` (read GET=R1 / write POST·PUT·PATCH·DELETE=R3; `x-keelbase-risk-level` extension overrides, e.g. delete → R4)
- supports YAML/JSON + local relative `$ref` multi-file merge (reusing the §3 loader); defensive parsing of flow-map string schemas
- output can be written directly to `PUT /settings/ai_proxy_tools` (or pasted in the Admin Console "Settings") → registered as AI tools by ProxyToolRegistryService after restart
- coverage: CLI end-to-end + `parseOpenApiProxy` unit tests (type mapping / riskLevel override / body required / name dedup)

**✅ deterministic full-chain e2e (2026-08-23)**: `test/proxy-bridge.e2e-spec.ts` expanded to 4 cases — added "generator output → Settings → runtime registration → read automatic / write confirmation + delegated identity callable" (`ProxyToolRegistryService.loadAndRegister` reads real Settings + mock target receives GET + delegated JWT, CI-runnable).

**✅ AI-chat end-to-end script (2026-08-23, `scripts/verify-proxy-bridge.mjs`)**: real-LLM chat-driven — read (R1 automatic, LLM calls `proxy_list_contract` → mock target receives + delegated identity) / write (R3 confirmation gate → `confirmation_request` → approve → target receives POST + body) + decision-trace audit. Prereq: backend up + `ai_proxy_tools` configured (restart backend to take effect) + DeepSeek key; report lands at `docs/benchmark/proxy-bridge-<ts>.md`.

**✅ write side-effect registration + external revocation semantics (2026-08-23)**: ProxyTool writes execute after confirmation → `AiService._executeWriteTool` registers a `proxy_call` side effect (visible in `/ai/tool-effects`, fully audited); revoking an external side effect returns `{ revoked:false, external:true, message:'B-path external side-effect revocation requires a Java-side compensation endpoint' }` (honest semantics, no local entity to soft-delete). e2e 5/5.

**✅ revokePath convention (2026-08-24)**: an OpenAPI operation gains an `x-keelbase-revoke-path` extension → the generator auto-produces a `revokePath` field on the tool (a Java-side compensation endpoint convention, e.g. `DELETE /contracts/{id}`); `ProxyTool` holds `revokePath`, and when an AI write side effect is revoked it calls the Java compensation endpoint accordingly (with delegated identity). Generator unit tests 5/5.

**Java-side compensation interface convention (`x-keelbase-revoke-path`)**:
- Shape: the OpenAPI operation declares a compensation endpoint (relative to baseUrl), e.g. `DELETE /contracts/{id}` (`{id}` placeholder comes from the side-effect resultId)
- Delegated identity: the revocation call likewise injects `Authorization: Bearer <delegated JWT>` (§5 verification maps to the local user)
- Idempotency requirement: the compensation endpoint must be idempotent (repeated revocation returns the same result, no error) — aligned with KeelBase's side-effect idempotency key, preventing duplicate revocation by LLM/retries
- Write tools without revokePath: revocation returns `{ revoked:false, external:true, message:'B-path external side-effect revocation requires a Java-side compensation endpoint' }` (honest semantics)

**✅ runtime revocation call (2026-08-24)**: when a side effect is revoked and the tool config carries `revokePath` → `ProxyToolRevokerService` (assembled via ai.module useFactory, injecting AiToolEffectsService) takes baseUrl/audience/revokePath from the registered ProxyTool + issues a delegated token → HTTP-calls the compensation endpoint (`{id}` placeholder = side-effect resultId). Revocation result `{ revoked:true, external:true, compensated:true, message:'Java side compensated (POST /contracts/…/cancel)' }`; no revokePath configured → `{ revoked:false, external:true, message:'…requires a Java-side compensation endpoint' }` (honest semantics). proxy-bridge e2e 5/5 coverage.

---

## 5. Identity / Permission Bridge (✅ KeelBase side landed; Java side + B path pending)

Problem: **who is the Java system's logged-in user in KeelBase? Whose permissions does the AI use to operate Java data?**
Without solving this, Route B's "Permission" is hollow.

**✅ KeelBase-side delegated-token issuance (2026-08-23)**:
- `POST /auth/delegation-token` (authenticated user) → issues a **short-lived delegated JWT**:
  - `sub` = KeelBase userId; `oidcSub` = OIDC subject (`users.providerId`, the unified identity-source mapping key); without OIDC, `subject = local:<userId>`
  - `aud` = target system id (e.g. `legacy-erp`); `iss` = `keelbase`; default 300s (DTO limits 60-3600)
  - independent `DELEGATION_SECRET` (falls back to JWT_SECRET if unset; production should set an explicit independent key)
- **Java-side verification**: verify the signature with the shared `DELEGATION_SECRET` → check `aud` → map the local user via `oidcSub` (or `local:<userId>`) → reject cross-user (other people's data). Example:
  ```java
  // Java/Spring: verify the delegated JWT (HMAC256, secret=DELEGATION_SECRET)
  Jws<Claims> jws = Jwts.parserBuilder().setSigningKey(secret.getBytes()).build().parseClaimsJws(token);
  String oidcSub = jws.getBody().get("oidcSub", String.class); // map the local user
  if (!"legacy-erp".equals(jws.getBody().getAudience())) throw new AccessDeniedException("audience mismatch");
  ```

- **Pending**: Route-B ProxyTool injecting the delegated-identity header (§4 not implemented) + mock-Java-system end-to-end acceptance (the received call recognizes the correct user; cross-user is rejected)
- Acceptance: the mock Java system recognizes the correct user identity on the received call; cross-user (other people's data) is rejected by the target system or KeelBase

---

## 6. Java Team Integration Guide (§3 import hardening + §5 delegated token landed; §4 B-path ProxyTool pending)

### Step 1: Pick the Path (decision table)

| Scenario | Path |
|---|---|
| Legacy system can change the DB / data can be copied | **A** Schema rebuild |
| Can't touch the legacy system, AI must operate live data | **B** API proxy (§4 generator landed; configure `ai_proxy_tools` and it takes effect) |
| Core data via B proxy, derived tables via A | Hybrid |

### Step 2: Import (Path A)

```bash
# OpenAPI → Protocol (supports .yaml/.yml, multi-file local relative $ref auto-merge)
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --out specs/contract.json
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --list-schemas   # list available schemas
node scripts/keelbase-init.mjs --import-openapi ./swagger.yaml --schema Contract --out specs/contract.json  # pick a schema
# review the skipped (relationship/reserved) and notes (number precision) reports → hand-write relationship fields
# generate after confirming
node scripts/keelbase-init.mjs --spec specs/contract.json --label Contract

# B path (proxying an existing system's REST): OpenAPI operations → ai_proxy_tools config
node scripts/keelbase-init.mjs --import-openapi-proxy ./legacy-openapi.yaml --base-url http://legacy-erp:8080/api --audience legacy-erp --out proxy-config.json
# paste the output into Admin Console "Settings" / PUT /settings/ai_proxy_tools → ProxyTool takes effect after restart
```

### Step 3: Identity Bridge (prerequisite for Path B; optional for A)

- A KeelBase user issues a short-lived delegated token: `POST /auth/delegation-token` (body `{ audience: '<target system>' }`)
- The Java side verifies with the shared `DELEGATION_SECRET` → maps the local user via `oidcSub` (OIDC subject) or `local:<userId>` → reject cross-user
- Default 300s short-lived + audience restricted to the target system, preventing cross-system impersonation

### Step 4: Governance

- read tools → automatic; write tools → human confirmation (default)
- high-risk writes (amount changes / deletes / approval decisions) → configure `riskLevel` (R3 confirmation / R4 dual-approval / R5 blocked)
- Audit: all AI operations land on the hash chain, revocable

### Step 5: Acceptance

> AI completes a real business task + audit verifiable + cross-user rejected (other people's data 403). Path B additionally requires: the Java side recognizes the correct user identity on the received call.

---

## 7. Relationship to Existing Capabilities

- Protocol: A-path output is plain source code (semantic source, not runtime metadata)
- MCP / Webhook: B path complements the MCP gateway — B targets "routine tool-ization of existing-system APIs", MCP targets the external-server ecosystem
- `aiization-demo.md`: the 10-minute demo of Path A; this file is its productized spec

## Related

- [aiization-demo.md](aiization-demo.md) — existing-system AIization demo (Path A)
- [synthetic-stranger.md](synthetic-stranger.md) — synthetic-stranger verification harness (incl. a Java-team perspective scenario)
- [30min-acceptance-en.md](30min-acceptance-en.md) — generator acceptance
