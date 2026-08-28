# KeelBase Authorization Architecture

> **Positioning**: KeelBase's authorization system is an **Authorization Architecture** — centered on business authorization and data-level access control, extended into **AI Agent / Tool Governance** — not a traditional RBAC permission system.
>
> CASL is one **technical component of the authorization-decision layer** (providing fine-grained Action / Subject / Conditions / Fields authorization), not the product-level definition of permissions.

---

## 1. Why not a "CASL permission system"

Traditional enterprise permission chain:

```
User → Role → Permission → API → Database
```

AI enterprise application permission chain:

```
User → Agent → Tool → Business Operation → Database
```

The difference is in the middle: **an Agent is not a normal user** — it autonomously chooses tools, parameters, and execution paths. API-level permissions (RBAC) alone cannot constrain an AI. KeelBase needs:

```
User Authorization
  + Agent Authorization
  + Tool Authorization
  + Data Scope
  + Side Effect Governance
  + Human Confirmation
  + Audit
```

This is the meaning of permissions in a Business-safe Agent Runtime: **"Can the AI perform this business action on behalf of this user?"** — not "how do enterprise users manage roles."

---

## 2. Five-layer authorization model (L1–L5)

| Layer | Responsibility | KeelBase Implementation |
|---|---|---|
| **L1 Identity** | Who? (User / Organization / authentication) | JWT (access+refresh rotation), login lockout, MFA, SSO/OIDC, email/SMS verification; User / Org / Department / Member |
| **L2 Business Authorization** | What can this person theoretically do? (Role / Permission) | CASL AbilityFactory + PoliciesGuard + @CheckPolicies + row-level checks; Explainable Authz |
| **L3 Agent Authorization** | What can an Agent do on their behalf? | Agent Registry (`ai_agents`) + trust_level R1–R5; delegation identity (D4); headless key ownership |
| **L4 Tool & Data Governance** | What data can a specific tool operate on? | Tool risk levels R0–R5; tool permission metadata (featureFlag / adminOnly / requiresConfirmation); governance policy (enable switch + role allowlist); data scope (user_scoped) |
| **L5 Side-effect Governance** | Even if allowed, it may not execute directly | Human confirmation; idempotency; revocable side effects (tool-effects); audit hash chain; decision trace |

```
L1 Identity ─ User / Organization
     ↓
L2 Business Authorization ─ Role / Permission / CASL Ability
     ↓
L3 Agent Authorization ─ Agent → allowed capabilities
     ↓
L4 Tool & Data Governance ─ Tool → Action → Resource → Data Scope
     ↓
L5 Side-effect Governance ─ Confirmation / Idempotency / Revoke / Audit
```

---

## 3. Layer design details

### L1 Identity

- **Authentication**: JWT access token (payload: sub / username / role) + refresh token rotation (updated on each use, old token invalidated immediately); login lockout (failure threshold); MFA (TOTP); enterprise SSO (OIDC dynamic discovery); email/SMS verification codes.
- **Sessions**: refresh tokens stored as SHA-256 hashes (not plaintext); sessions can be revoked remotely; `/auth/sessions` management.
- **Organization**: User / Organization / Department / Member (roles: owner / member / admin); org-level data sharing (members can read/manage org todos, etc.).

### L2 Business Authorization

- **Ability rules (CaslAbilityFactory)**:
  - `admin` → `can('manage', 'all')`
  - `user` → `can('manage', 'User', { id: user.sub })`, `can('manage', 'Event', { userId: user.sub })`, plus row-level ownership for flagship entities (Crm* / Pm* / Approval*)
- **Policy guard**: global `PoliciesGuard` (after JwtAuthGuard); `@CheckPolicies((a) => a.can(...))` for route-level declarations; `@CurrentAbility()` for row-level object checks in services/controllers (`subject('Customer', obj)` + `ability.can(...)`).
- **Explainable Authz**:
  - `describeForUser`: resolves ability rules into a readable "permission list + basis" (role + resource scope all/own + reason)
  - `explain`: returns decision + basis for an "action × resource" (`/auth/permissions/explain`)
  - `explainForTarget`: admin reverse-lookup of a target user's decision basis (`/auth/permissions/explain/target`)

### L3 Agent Authorization

- **Agent Registry (`ai_agents`)**: formal definition of registered agents (id / name / owner / purpose / capabilities / **trust_level**). Minimal version auto-registers from headless API Keys; sub-agent names are attributed at runtime.
- **trust_level R1–R5**: R1 read auto-execute / R2 light / R3 write requires human confirmation / R4 dual-person approval / R5 blocked (irreversible/external action).
- **Delegation & identity (D4)**: agent call-chain attribution (parent action id / upstream agent / delegation context / business intent / source channel); audits attribute to the human via agent_id; headless API Keys execute under the key owner's identity.

### L4 Tool & Data Governance

- **Tool risk levels (ToolRegistry)**: every AI tool registers a riskLevel + riskStrategy:
  - R1 (auto): read-only, auto-executes
  - R3 (confirmation): write operations, requires human confirmation
  - R4 (human_approval): dual-person approval
  - R5 (block): blocked, never enters confirmation/execution
  - External MCP tools auto-declare risk by readOnly (A2: readOnly→R1, non-readOnly→R3)
- **Tool permission metadata (`permissions`)**: `featureFlag` (feature toggle), `adminOnly`, `requiresConfirmation`.
- **Governance policy (GovernancePolicy)**: tool enable switch + role allowlist; **role is looked up in the database in real time on every tool call** (role downgrade takes effect immediately).
- **Data scope (user_scoped)**: every tool call carries the authenticated user and can only read/write their own (or same-org) data.
- **Denial check list (`AuthorizationDeniedError.reasons`)**: `risk_policy` (R5 blocked) / `tool_enabled` (governance disabled) / `role_allowed` (role allowlist) / `feature_flag` (toggle off) / `admin_only` / `user_scoped` — structured failure reasons flow into the decision trace and audit, and the frontend can render "why blocked".

### L5 Side-effect Governance

- **Human confirmation**: write operations trigger confirmation (approve / reject / trust this session); execution only after approval; R4 requires dual-person approval.
- **Side-effect records (tool-effects)**: AI-created business records are registered (target type + current state), supporting revoke (soft delete + trash recovery).
- **Audit hash chain**: AI audit + operation audit chained SHA-256; `/audit/verify` verifies integrity; tampering fails; sensitive fields in request bodies are auto-redacted.
- **Decision trace**: user request → AI decision → tool call → authorization check (including denial reasons) → human confirmation → data change, fully traceable.

---

## 4. Runtime execution order of an AI tool call

```
User request → JWT authentication (L1)
  → Tool risk check: R5 → blocked (risk_policy) (L4)
  → Governance policy: enable switch (tool_enabled) → role allowlist (role_allowed, real-time DB lookup) (L4)
  → Feature flag (feature_flag) → adminOnly (L4)
  → Data scope (user_scoped, own/org data only) (L4)
  → Write operation → human confirmation (L5)
  → Execute → side-effect record (L5)
  → Audit hash chain + decision trace (L5)
  → Revocable (L5)
```

> Permission decisions happen at **runtime**, not by relying on the AI "remembering rules." A denial is not an anomaly — it is the system working correctly; the denial reason flows structurally into the decision trace and audit.

---

## 5. Relationship with the Application Protocol

KeelBase's Build side generates business modules from the "Application Protocol," and permissions are generated alongside:

```
Application Protocol → entities/API → CASL ownership → AI tools (read R1 / write R3 confirmation) → audit wiring
```

Generated modules automatically carry: CASL row-level ownership, AI read/write tools (writes require confirmation), and operation audit. This is the **Authorization Contract direction** — the protocol describing resources/actions/authorization scopes/agent tools/side-effect policies:

```yaml
resource: Customer
actions: [read, create, update, delete]
authorization:
  scopes: [organization, owner, department]
agent:
  allowed_tools: [customer.search, customer.analyze, customer.createTask]
side_effects:
  customer.create: { confirmation: required }
  customer.delete: { allowed: false }
```

> The Authorization Contract is currently realized as "automatic wiring in generated modules"; explicitly declaring the authorization model (scopes / agent tools / side_effects) in the protocol is a future direction.

---

## 6. Current state vs. backlog

| Item | Status |
|---|---|
| L1 Identity (authentication + organization) | ✅ Implemented |
| L2 Business Authorization (CASL + Explainable Authz) | ✅ Implemented |
| L3 Agent Authorization (Registry + trust_level + delegation) | ✅ Implemented (minimal) |
| L4 Tool & Data Governance (risk levels + governance policy + data scope + structured denial) | ✅ Implemented |
| L5 Side-effect Governance (confirmation + revoke + audit hash chain + decision trace) | ✅ Implemented |
| Authorization Contract protocolization (explicit auth model in Protocol) | ⬜ Direction (currently covered by generated-module auto-wiring) |
| Heavyweight RBAC products (Keycloak / Casbin / Shiro, etc.) | ⬜ **Explicitly not doing** (consistent with differentiation positioning) |

---

*Related docs:* [README](../README.md) · [Flagship Applications Spec](flagship-applications-en.md) · [Architecture Boundary](architecture-boundary-en.md)
