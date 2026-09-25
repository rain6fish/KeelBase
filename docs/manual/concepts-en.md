# Concept Map

> Purpose: understand KeelBase's core vocabulary **and how the pieces relate**, on one page.
> Newcomers rarely get stuck on a single term — they get stuck on the *relationship*, such as
> "does CASL or DataScope decide who sees this row?"
> Read this page, then go back to the [Quick Start](quickstart-en.md) or [Tutorial](tutorial-en.md).
>
> This page is an **index**, not the authority — the authoritative definition of any term is its
> code comment or spec.

---

## 0. There are two AIs (the first thing people conflate)

"AI" in KeelBase means two entirely different things. Mixing them makes the architecture unreadable:

| | **Build-time AI** (Build layer) | **Run-time AI** (Run layer) |
|---|---|---|
| When it runs | While you write code | While a user uses the system |
| What it does | Turns a business spec into **source code** | **Calls tools** within permissions to do work |
| Entry point | `npx keelbase init --spec ...` | `/ai/chat`, the admin AI assistant |
| What it leaves behind | Plain source code you can edit and keep | Audit rows and side-effect records |

**The red line**: the build-time AI emits **source code that can leave the platform**, not configuration
that stays inside it. That is the boundary between KeelBase and traditional low-code. There is exactly
one test: is the artefact **configuration the platform interprets at runtime**, or **source code plus an
open spec that walks away with you?** The former is low-code; the latter is KeelBase.

---

## 1. How a module comes to exist

```
Business Spec (written in business language)
    ↓  produced by an interview, or written by hand
Module Protocol (specs/*.json — a structured declaration)
    ↓  npx keelbase init --spec
Plain source (entity / dto / service / controller + wiring + migration + tests)
```

- A **Business Spec** is a **build-time** input model; it never enters the runtime contract.
- The generator completes **roughly twenty wiring points** on its own — backend module registration,
  CASL role rules, AI tool registration, AI navigation, admin route/sidebar/i18n, and the Flutter and
  Taro surfaces. **None of this is manual work.**

---

## 2. Authorization vs data scope (the second thing people conflate)

The two words travel together but answer **two different questions**:

| | **CASL** (authorization) | **DataScope** (data scope) |
|---|---|---|
| Answers | What actions may you take on **this kind of object**? | Which **rows** may you see? |
| Granularity | Action level (read / create / update / delete) | Row level (owner / dept / org) |
| Lives in | `src/common/casl/` | `src/common/scope/` |
| Example | A `user` may only manage their own Event | "Every todo in my department" |
| When it is not enough | Add a subject rule | Register the entity in `SCOPE_COLUMNS` |

**Both must pass**: CASL says "you may read Todos", DataScope says "you may read these rows in
particular". **Missing either one is a hole.**

Data scope levels (`ScopeLevel`) include `all` / `own` / `own_dept_and_below` / `custom_dept` and
friends. One degradation rule is worth remembering: **when org/department information is missing, the
scope falls back to the user themselves** — it tightens rather than loosens.

---

## 3. Organizations and departments

`Org` and `Department` (a tree) plus memberships are **where data scope comes from**. The `orgId` /
`deptId` columns on an entity are filled from here, and `DataScope` reasons over them.

---

## 4. Gating writes: risk levels

Every AI tool carries a risk level, and **that level decides whether it may run on its own**:

| Level | Meaning | Disposition |
|---|---|---|
| R0 | Informational | automatic |
| R1 | Read | automatic |
| R2 | Low-risk write | decided by governance policy |
| R3 | Business-sensitive write | **human confirmation** |
| R4 | High-impact action | **two-person approval** |
| R5 | Irreversible / external action | **blocked** |

Related terms:

- **confirmation** — the confirmation card (R3's "waiting for you to approve")
- **revokeClass** — the revoke class (locally compensable / externally governed / not revocable); it
  decides how the UI honestly presents "undo"
- **side effect** — the record an AI write leaves behind, revocable and compensable

---

## 5. There are two audit chains (the third thing people conflate)

| | **AI audit** `ai_audit_logs` | **Operation audit** `operation_audit_logs` |
|---|---|---|
| Records | What the AI did (chat / tool calls / confirmations / revokes) | What humans wrote over REST |
| Written by | The agent runtime | A global interceptor |

**Each has its own hash chain.** The **evidence root** (evidence-root) binds one business action's
**two chains, its side effects and its authorization basis** into a single offline-verifiable package.

---

## 6. Governance

Governance is the layer that decides **what may run automatically**: tool switches, confirmation
levels, role allowlists, audit granularity.

It can be **deployed standalone** as a governance console (one control plane across several business
systems), or stay local to a single system. The **sidecar** lets a legacy system join that same
governance and audit plane without code changes.

---

## 7. Quick reference

| Term | In one line |
|---|---|
| **FeatureFlag** | A module-level switch controlling whether a feature is visible |
| **Provenance** | The origin fingerprint of a generated artefact (who, which version) |
| **MCP** | The standard protocol for exposing and consuming AI tools (egress and gateway) |
| **Headless** | Calling the AI with an API key, no front end involved |
| **RAG** | Knowledge-base retrieval so answers are grounded |
| **FLOW** | The workflow engine (human tasks / AI tasks / conditions) |
| **Trash** | Soft-deleted records, restorable from the admin console |

---

## 8. Where to go next

- **To get it running** → [Quick Start](quickstart-en.md) · [Tutorial](tutorial-en.md)
- **To change code or add a module** → [Rules Map](rules-map-en.md) (which rule lives in which file)
- **Stuck?** → [FAQ](faq-en.md)
