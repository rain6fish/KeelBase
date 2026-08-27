# 30-Minute Acceptance / Flagship-Driven Development Loop

> Goal (V2 P0-13 / development-plan weeks 11-12): a stranger developer creates a business module from scratch, and the Runtime Agent can safely operate it.
> Acceptance bar: **a business module with Permissions (CASL) + AI Tool + Confirmation + Audit built within 30 minutes**.
> Based on the protocol: `docs/module-protocol.md` (protocol → `keelbase init --spec` → plain source code).

> **Two-level metric (adopted 2026-08-19)**:
> - **30min Build**: the technical chain verified on this page — protocol → module → API → permissions → tools → confirmation → audit (proves "you can build it").
> - **60min Business**: the real business loop — module + real data → AI query → AI analysis → AI action → confirmation → audit (proves "it delivers business value").
> The former is the generator loop, the latter is the business-value loop; external metric = **30min to Build / 60min to Business Outcome**.

## 0. Prerequisites

- Clone KeelBase and run `npm install` (`Server-NestJS`) + `flutter pub get` (`Front-Flutter`)
- Backend starts (`npm run start:dev` or single container)

## 1. Acceptance Flow (with time budget)

| Step | What | Time | Verify |
|---|---|---|---|
| 1. Write protocol | Describe the module in natural language / DB schema → write a `specs/<module>.json` (or `--module/--fields` directly on the CLI) | ~3 min | — |
| 2. Generate | `node scripts/keelbase-init.mjs --spec specs/<module>.json` | ~1 min | Output "generated module" + 8 wiring points ✓ |
| 3. Compile | `cd Server-NestJS && npm run build` | ~1 min | 0 error |
| 4. Migrate | `npm run migration:generate -- src/migrations/Add<Module>` | ~1 min | Migration file generated |
| 5. Unit tests | `npm test -- <plural>` | ~30 s | 20 tests passed (service 5 + controller 6 + query/create tools 9) |
| 6. API | Start server, `curl /api/v1/<plural>` (with token) | ~2 min | 200 + own data |
| 7. Frontend | `cd Front-Flutter && flutter analyze` (+ `flutter run` to see the page) | ~2 min | 0 error |
| 8. AI tools | `query_<plural>` (read) + `create_<singular>` (write, requires confirmation) auto-generated and registered | 0 (automatic) | `grep Query<Module>Tool src/ai/ai.module.ts` |
| 9. Confirmation + audit | AI chat triggers `create_<singular>` → confirmation dialog → persisted → audit hash chain | ~5 min | Type "create a <label>" in the AI chat |
| 10. Permissions | Cross-user access to another user's data → 403 | ~1 min | Another account curl → 403 |

**Total: ≈15-20 minutes** (including AI tool + confirmation chain verification), with 10 min buffer.

## 2. Generated Artifacts (`keelbase init --spec` produces everything)

| Layer | Files |
|---|---|
| Backend | `entity / dto(create/update) / service / controller / module / service.spec / controller.spec` |
| AI tools | `ai/tools/query-<plural>.tool.ts` (read, filtered by userId) + `create-<singular>.tool.ts` (write, `requiresConfirmation` + `requireVerifiedEmail`), each with `.tool.spec.ts`, registered in `ai.module.ts` |
| Flutter | `features/<plural>/` model / repository / provider / page + wiring (main/router/i18n/Explore) |
| Web-Admin | `views/<plural>/` admin page + wiring (routes/nav/i18n) |
| Taro | `pages/<plural>/` + wiring (app.config/explore) |
| Security wiring | CASL owner-only permissions + global audit interceptor + AI navigation (navigate-page.tool) |

## 3. Verified End-to-End Examples

### 3.1 `specs/contract.json` (contracts, with enum status + AI tools)
```bash
node scripts/keelbase-init.mjs --spec specs/contract.json
```
Generates the `contracts` module: `query_contracts` (read) + `create_contract` (write, requires confirmation) registered;
`AddContracts` migration generated; `npm test -- contracts` → 20 passed (service 5 + controller 6 + tools 9); sqlite consistency No changes.

### 3.2 `specs/supplier.json` (suppliers, dual enum) — protocol reverse-engineering verification artifact
### 3.3 `specs/customer.json` / `project.json` / `approval-request.json` — three-flagship reverse-engineered protocol examples

### 3.4 Common business module protocols (added 2026-08-18, generate directly via `--spec`)

| Protocol | Description | Field highlights |
|---|---|---|
| `specs/events.json` | Calendar events | colorRole enum (6 colors) |
| `specs/todos.json` | Todos | priority / status enum |
| `specs/books.json` | Books | status enum + rating int |
| `specs/notes.json` | Notes | category enum |

```bash
node scripts/keelbase-init.mjs --spec specs/books.json   # generates the books module (with AI tools)
```

## 4. Acceptance Criteria

- ✅ Steps 1-7 (generate/migrate/API/frontend/permissions/tests) completed **within 30 minutes**
- ✅ **AI Tool** auto-included: `query_<plural>` + `create_<singular>` (write requires confirmation) triggerable in AI chat
- ✅ **Confirmation**: the write tool shows a confirmation dialog; the write lands only after the user confirms
- ✅ **Audit**: writes land in the operation audit + AI calls land in the AI audit (hash chain verifiable)
- ✅ The output is **plain source code** the developer can keep modifying

## 5. Common Failures

| Symptom | Fix |
|---|---|
| `directory already exists` | Module name conflict — use another English name or delete the old module |
| `invalid field name` | Use camelCase or snake_case (`a-zA-Z0-9_`), avoid reserved words (id/userId/createdAt…) |
| `enum field needs 2-10 options` | Provide 2-10 lowercase-English/underscore options in the protocol `enum` array |
| Migration consistency reports a diff | Regenerate with `migration:generate` (never hand-write migrations) |
