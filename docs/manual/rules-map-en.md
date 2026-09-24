# Rules Map

> The rules are **deliberately not in one file** — a top-level constitution, detailed rules, and
> task-oriented skills each do a different job.
> This page is the **entry point**: it tells you which kind of rule lives in which file.
>
> **This page does not reproduce the rules.** If a rule disagrees with the description here, change
> the **authoritative file**, not this page. And do not start a fourth "master document" —
> avoiding exactly that is the point of this map.

---

## 1. Layers, from the top down

| Layer | File | What it governs |
|---|---|---|
| **① Top-level constitution** | [`.agents/skills/keelbase-development-constitution/SKILL.md`](../../.agents/skills/keelbase-development-constitution/SKILL.md) | Three constitutions (product / experience / architecture), the development flow and Definition of Done, the three-way review, and decision rules. **Read it before developing, designing or reviewing anything.** |
| **② AI agent entry** | [`AGENTS.md`](../../AGENTS.md) | The high-frequency "how to add a feature / a module", including the **checklist for adding a business module** (mirrors the generator's wiring points). |
| **③ Detailed development rules** | [`CLAUDE.md`](../../CLAUDE.md) | Architecture and conventions (§3 frontend / §4 backend / §5 security / §6 environment variables / §9 API index / §10 common patterns / §14 behavioural guidelines / §15 anti-slop code rules). |
| **④ Task-oriented skills** | [`.claude/skills/`](../../.claude/skills/) | Step-by-step procedures for a specific job (see §3). |
| **⑤ Public commitments** | [`SECURITY.md`](../../SECURITY.md) | Trust boundaries and the **not-promised list** (N-1…). What we told the outside world lives here. |
| **⑥ Strategy and red lines** | The private roadmap repository | Positioning, priorities, and what we deliberately will not build. **Not public** — public docs do not cite its section numbers. |

**Order of precedence**: ① > ②/③ > ④, and **the more specific overrides the more general** — if a
module directory carries its own `AGENTS.md`, it overrides the root conventions inside that module.

---

## 2. Look up by what you are doing

| I want to… | Read |
|---|---|
| **Add a business module** | [AGENTS.md](../../AGENTS.md) §3 checklist + [`CLAUDE.md`](../../CLAUDE.md) §4/§10, or just use the generator (next row) |
| **Generate a module** | [`CLAUDE.md`](../../CLAUDE.md) §10 "from a business need to a module" → [`docs/business-spec.md`](../business-spec.md) → [`docs/module-protocol.md`](../module-protocol.md) |
| **Change something security-related** | [`CLAUDE.md`](../../CLAUDE.md) §5 + [`SECURITY.md`](../../SECURITY.md) trust boundaries |
| **Check positioning / what we will not do** | [`CLAUDE.md`](../../CLAUDE.md) §5.5 product red lines (strategy itself is in the private roadmap) |
| **Avoid writing slop** | [`CLAUDE.md`](../../CLAUDE.md) §15 Code Economy (Search Before Create and the six others) |
| **Commit code** | [`CLAUDE.md`](../../CLAUDE.md) §14.5 commit message rules (**bilingual, English first, no Co-Authored-By**) |
| **Touch protocol / tool / audit semantics** | [`docs/manual/semantic-change-checklist.md`](semantic-change-checklist.md) — land the protocol before the code |
| **Cut a release** | [`docs/manual/release-precheck.md`](release-precheck.md) |
| **Review code** | [`docs/manual/code-review-severity.md`](code-review-severity.md) |
| **Untangle a term** | [`docs/manual/concepts-en.md`](concepts-en.md) |
| **Run tests / gates** | [`CLAUDE.md`](../../CLAUDE.md) §8 command reference |
| **Understand why the architecture is shaped this way** | [`docs/keelbase-dna.md`](../keelbase-dna.md) (the four core principles) |
| **Write end-user instructions** | [`docs/manual/usage.md`](usage.md) |

---

## 3. Callable task skills (`.claude/skills/`)

| Skill | When to reach for it |
|---|---|
| `keelbase-discovery` | Turn a vague business ask into a Business Spec through interview |
| `consulting-to-build` | Orchestrate from a need all the way to a running application, gates included |
| `generate-module` | Hand-build a new module against the checklist |
| `add-api` | Add API endpoints to an existing module |
| `write-migration` | Generate or validate a TypeORM migration |
| `ai-code-economy-review` | Anti-slop review (the fourth layer before a release) |
| `crm-customer-risk` · `pm-deadline-risk` · `approval-policy-review` | Business-rule skills for the flagship apps |

---

## 4. Maintaining this map

- **A new kind of rule** → add a row to §1 (layer) or §2 (task), pointing at the authoritative file.
- **A new skill** → add a row to §3.
- **Never copy rule text in here.** A copy drifts, and a drifted index is worse than none.
