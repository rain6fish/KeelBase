---
name: keelbase-architecture-engineering
description: Architecture and engineering guardrails for KeelBase. Use when implementing, reviewing, refactoring, integrating, or extending platform capabilities. Preserve existing architecture, business safety, testability, deployability, and reusable Application Protocol / Runtime boundaries.
---

# KeelBase Architecture & Engineering Skill

## 1. Mission

Implement KeelBase features without turning the project into a collection of disconnected subsystems.

Core architecture principle:

`Existing Business Systems / New Business Model -> Application Protocol -> AI Application -> Business-safe Agent Runtime -> Governance -> Audit -> Private Deployment`

Prefer extension and reuse of existing KeelBase capabilities over introducing parallel frameworks.

## 2. Architecture priorities

When making engineering decisions, prioritize:

1. correctness and business safety
2. compatibility with existing architecture
3. testability and regression safety
4. operational reliability
5. maintainability
6. developer experience
7. performance where it affects real workloads
8. technical elegance

Do not rewrite stable subsystems merely for stylistic preference.

## 3. Existing platform capabilities to reuse

Before adding infrastructure, inspect and reuse existing mechanisms where applicable, including:

- Application Protocol
- AI Tool Calling
- Memory / RAG / Skills / SubAgent mechanisms
- CASL permissions
- Tool-level Governance
- write-tool confirmation
- side-effect idempotency
- revoke/recovery mechanisms
- audit hash chain / HS-11
- AI Eval baseline loop
- Agent decision/behavior trace or replay capabilities
- MCP gateway
- FLOW guard / orchestration capabilities
- Plugin / Template mechanisms
- Web Admin Workbench / Console
- `keelbase init`
- Docker / single-container / offline deployment
- local Ollama model support
- Demo Seed / Live Demo infrastructure
- WebSocket / Webhook

Verify actual repository implementation before assuming an API or module exists.

## 4. Business side effects

Any new AI capability that can mutate business state must be evaluated for:

- authorization
- data-level permissions
- tool-level policy
- confirmation requirements
- idempotency
- audit logging
- error handling
- rollback/revoke where applicable
- evaluation/regression tests

Never bypass existing governance merely to simplify implementation.

## 5. Application Protocol discipline

Application Protocol should be the stable contract between business capabilities and AI application generation/runtime where applicable.

When extending protocol:

- keep semantics explicit
- make schemas AI-readable
- maintain backward compatibility where practical
- distinguish business meaning from implementation details
- avoid embedding provider-specific assumptions
- ensure generated artifacts remain normal source code

Do not turn Application Protocol into a proprietary replacement for every existing API specification.

## 6. Integration principle

KeelBase should connect to existing systems rather than replace them.

Prefer:

- existing database models where appropriate
- OpenAPI integration
- protocol adapters
- MCP
- explicit APIs
- event/webhook integration

Avoid unnecessary duplication of enterprise system data or logic.

## 7. Backend/frontend boundaries

Respect the existing stack and module boundaries.

Backend responsibilities should include business rules, permissions, governance, AI orchestration, persistence, and authoritative state transitions.

Frontend responsibilities should include presentation, interaction, local UI state, user confirmation, and clear business feedback.

Do not move security decisions into client-only logic.

## 8. Testing requirements

For meaningful changes, add or update tests appropriate to the affected layer.

At minimum consider:

- unit tests
- integration tests
- AI/tool behavior tests
- permission tests
- governance tests
- audit tests
- E2E tests for important user flows
- deployment/smoke tests when deployment behavior changes

For business-critical Agent actions, test both allowed and denied paths.

## 9. Regression discipline

Before finalizing a change:

- identify affected modules
- inspect existing tests
- run focused tests first
- run broader regression tests when risk warrants it
- check security/governance behavior
- verify generated code/build output where applicable
- verify Docker/private deployment impact when relevant

Do not claim a feature is complete solely because compilation succeeds.

## 10. Reliability and AI model independence

Do not design core business safety around one LLM's compliance.

The runtime must enforce important controls independently of model output.

LLM output is untrusted input.

Model-specific prompts may improve behavior, but permissions, confirmation, governance, validation, and audit must be enforced by deterministic application/runtime mechanisms.

## 11. Performance discipline

Optimize performance when it affects user-visible experience or production reliability.

Use measured evidence where possible.

Do not introduce complex caching, queues, distributed infrastructure, or microservices merely for theoretical scale when a single-process/simple deployment is sufficient.

## 12. Deployment discipline

KeelBase should preserve its strengths in:

- Docker deployment
- single-container demo/deployment where appropriate
- offline/private deployment
- local model support

New features should not unnecessarily make private deployment harder.

## 13. Single-developer constraint

Assume one core developer with AI assistance.

Prefer:

- small vertical slices
- incremental changes
- existing dependencies
- explicit module boundaries
- low operational burden
- documentation generated alongside implementation

Avoid large refactors unless they remove a demonstrated blocker.

## 14. Required engineering review

For non-trivial implementation, state:

1. affected modules
2. existing capability to reuse
3. architecture change, if any
4. security/governance impact
5. data model/API impact
6. testing plan
7. deployment impact
8. rollback/recovery plan
9. non-goals

Then implement the smallest safe change.

## 15. Final engineering rule

Prefer:

`smallest change that creates real user value while preserving trust, compatibility, testability, and private deployment.`

Do not add architectural complexity without a concrete product or operational reason.
