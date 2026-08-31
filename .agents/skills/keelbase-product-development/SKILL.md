---
name: keelbase-product-development
description: Product development guardrails for KeelBase. Use when planning, designing, implementing, reviewing, or modifying any KeelBase feature, application, UI, Agent capability, protocol, governance capability, template, or integration. Optimize for customer value, two distinct user experiences, developer experience, market fit, business safety, reusability, and single-developer delivery constraints rather than feature volume.
---

# KeelBase Product Development Skill

## 1. Mission

KeelBase is an Enterprise AI Trust Runtime and AI application engineering platform.

Its product promise is:

> Let developers build AI Business Applications quickly and safely, and let business users use those applications to complete real work safely, audibly, and under control.

The platform sits between AI Agents and existing business systems. It should not attempt to replace ERP, CRM, project-management suites, or general-purpose Agent frameworks.

The primary product loop is:

`Build -> Run -> Trust -> Private Deploy`

The long-term ecosystem loop is:

`Platform -> Reference Applications -> Customer Projects -> Real-world Feedback -> Better Platform`

## 2. Mandatory dual-user model

Every feature must be evaluated for TWO different user groups. Never treat them as one generic "user".

### A. Builder / Developer

People who use KeelBase to build, integrate, customize, test, govern, and deploy AI applications.

Examples:
- enterprise developers
- SaaS developers
- solution/integration developers
- independent developers
- future KeelBase project-delivery developers

Their jobs:
- connect an existing system or define a new business model
- understand or create Application Protocol
- define AI Tools / Agents
- configure permissions and governance
- test and evaluate Agent behavior
- deploy and maintain the application

Builder success means:
- easy to understand
- easy to start
- easy to integrate
- easy to customize
- easy to debug
- easy to deploy
- safe by default

### B. End User / Business User

People who use applications BUILT WITH KeelBase, such as AI CRM, AI Project Management, or Approval/Knowledge applications.

Examples:
- salesperson
- sales manager
- project manager
- project member
- employee
- approver
- business manager

They usually do NOT need to know KeelBase exists.

Their jobs:
- complete business tasks
- find information
- analyze business situations
- ask AI to perform useful actions
- review/confirm important actions
- understand outcomes

End-user success means:
- task completion is fast
- UI is intuitive
- AI behavior is understandable
- risky actions are clearly confirmed
- errors are recoverable
- business concepts remain visible while platform complexity stays hidden

### Product rule

Platform complexity belongs in the Builder/Admin experience, not in the End User experience.

Do not expose concepts such as MCP, CASL, Tool Registry, Protocol internals, audit hash chains, or Agent Runtime internals to ordinary business users unless there is a real business need.

## 3. Eight-dimensional product review

Every meaningful feature should be reviewed through these eight lenses:

1. Market - Is this aligned with a real and growing enterprise AI problem?
2. Customer - Why would an enterprise need it? What painful problem does it remove?
3. Builder - Does it make building/integration/customization easier?
4. End User - Does it make the resulting application more useful, usable, or trustworthy?
5. Competitive - Why use KeelBase instead of self-build, Dify, LangChain, an Agent framework, an AI gateway, or another governance product?
6. Buyer - Would a CTO, architect, security owner, or IT owner approve adoption?
7. Business - Does it support a credible future open-source + solution-delivery + enterprise model?
8. Technology - Is it reliable, maintainable, secure, testable, and consistent with the existing architecture?

When a feature scores well technically but poorly on customer/user value, do not prioritize it merely because it is technically interesting.

## 4. Feature decision framework

Before implementing a non-trivial feature, answer:

- What user problem is being solved?
- Which user group is affected: Builder, End User, or both?
- What is the concrete Job To Be Done?
- What is the smallest version that proves value?
- How does it improve Build, Run, Trust, or Private Deploy?
- Can the value be demonstrated in a real business scenario?
- Can an existing KeelBase capability be reused instead of adding a new subsystem?
- Does it strengthen AI CRM / Project / Approval reference applications?
- Can it become reusable infrastructure or a solution template?
- What is the measurable acceptance criterion?
- What is explicitly NOT included?

If these answers are unclear, stop and clarify the product requirement before coding.

## 5. North Star and UX targets

KeelBase should continuously optimize for:

### Platform North Star

`Time to First Trusted Application <= 30 minutes`

### Application North Star

`Successful Business Outcomes`

Do not optimize only for AI conversation count, token count, or feature count.

Preferred experience targets:

- Time to Understand: <= 60 seconds
- Time to First Run: <= 10 minutes
- Time to First Value: <= 10 minutes
- Time to First AI Business Action: <= 15 minutes
- Time to First Custom Tool: <= 30 minutes

For external developers, the ideal flow is:

`Existing System / New Requirement -> Protocol -> AI Application -> Governance -> Deploy`

## 6. Golden Demo principle

A feature should preferably strengthen one coherent end-to-end business flow rather than create an isolated technical demo.

Canonical Golden Path:

`User request -> AI understanding -> read business data -> Tool call -> Permission check -> Confirmation -> DB side effect -> Audit -> Revoke`

The feature is valuable when it makes this path more reliable, understandable, reusable, or easier to build.

## 7. Business-safe Agent rules

Any feature that allows AI to affect business state must preserve the trust chain.

Minimum expectations for meaningful side effects:

- explicit tool boundaries
- authorization / permission checks
- risk-aware governance
- human confirmation where required
- idempotency for side effects where applicable
- auditable execution
- recoverability / revoke where technically applicable
- evaluation or regression coverage

Never optimize for autonomous execution by weakening business safety.

The product principle is:

> Agent Frameworks help AI do things; KeelBase helps enterprises dare to let AI do things.

## 8. Application-first strategy

KeelBase reference applications are NOT intended primarily to compete with mature SaaS products.

AI CRM, AI Project Management, and AI Approval/Knowledge should be treated as:

- reference applications
- validation environments for the Runtime
- reusable templates
- future solution-delivery foundations

Each flagship application should be designed so it can evolve through:

`Reference Demo -> Standard Template -> Customer Customization -> Project Delivery`

This is essential for future KeelBase solution/project work.

## 9. Current flagship priority

Default order:

1. AI CRM - P0 / ⭐⭐⭐⭐⭐
2. AI Project Management - P1 / ⭐⭐⭐⭐☆
3. AI Approval / Knowledge - P1/P2 / ⭐⭐⭐☆☆

### AI CRM

Use CRM to prove the complete business-safe Agent loop:

`Query -> Analyze -> Risk -> Create Task -> Confirm -> Execute -> Audit`

MVP should favor Customer, Opportunity, Activity, Task, Risk, AI Search/Analysis, controlled AI write operations, confirmation, audit, and a clear business dashboard.

### AI Project Management

Use it to prove multi-entity business coordination involving Project, Task, Milestone, Schedule, Risk, Member, and Document.

### AI Approval / Knowledge

Use it to prove Knowledge + Policy + Human-in-the-loop + Approval + Audit.

Do not expand these applications into broad enterprise suites unless real user evidence requires it.

## 10. Reference application UX rule

For End Users, prioritize:

- familiar business navigation
- task-oriented screens
- clear AI entry points
- understandable AI results
- visible business impact
- clear confirmation for risky actions
- clear success/failure states
- easy recovery
- responsive performance

For Builders/Admins, prioritize:

- clear configuration model
- discoverable Protocol / Tool / Agent relationships
- actionable errors
- governance visibility
- audit traceability
- test/evaluation feedback
- easy local and private deployment

## 11. Open-source and solution-delivery principle

KeelBase should support two complementary growth paths:

`Open Source -> Developer adoption -> Reference Apps -> Customer projects`

and

`Open Source -> Production adoption -> Private deployment -> Enterprise support/license`

Do not prematurely optimize the product for SaaS multi-tenancy, billing, or marketplace mechanics before PMF evidence exists.

## 12. Single-developer constraint

Assume approximately one full-time core developer with AI assistance.

Therefore:

- prefer reuse over new subsystems
- prefer one strong workflow over many shallow workflows
- prefer Web as the primary product workbench unless a requirement proves otherwise
- keep Flutter/Taro/mobile scope controlled
- avoid parallel expansion of many model providers
- avoid broad platform rewrites
- keep P0 work limited to a small number of concurrent tracks

Recommended capacity model:

- 60% core product / flagship applications
- 20% stability, testing, architecture, and technical debt
- 10% community and developer experience
- 10% exploration

## 13. Feature priority rubric

Use these default priority levels:

- ⭐⭐⭐⭐⭐ P0: directly proves product value, Trust Runtime differentiation, or critical user experience
- ⭐⭐⭐⭐☆ P1: strongly supports adoption, integration, or productization
- ⭐⭐⭐☆☆ P2: useful but can wait for evidence
- ⭐⭐☆☆☆ P3: later / only after PMF evidence
- ⭐☆☆☆☆ P4: avoid for now

Prefer work that satisfies at least two of these conditions:

- improves Time to First Value
- improves Time to First Trusted Application
- increases real business-task completion
- improves business safety
- enables external system integration
- improves Builder DX
- improves End User UX
- strengthens reusable solution templates
- provides measurable PMF evidence

## 14. Anti-feature-bloat rule

Do NOT add a feature merely because:

- competitors have it
- it looks impressive in a demo
- an AI coding agent can implement it quickly
- it is architecturally interesting
- it may be useful someday

Before adding it, ask:

> What customer behavior or measurable product outcome will change if we ship this?

If there is no credible answer, defer it.

Default "not now" categories include broad Workflow Designer, GraphQL, Voice, Payment, large-scale SaaS multi-tenancy, broad BPM, API Gateway, excessive model-provider expansion, and other non-core platform expansion unless user evidence changes the priority.

## 15. Market and customer skepticism

Always include the counter-question:

> Why would the customer NOT use KeelBase?

Consider these alternatives:

- build internally
- use an existing Agent framework
- use Dify or similar AI application platforms
- use MCP directly
- use an AI gateway / governance product
- postpone AI adoption

A feature is strategically strong when it increases the reason to choose KeelBase over these alternatives.

## 16. Acceptance criteria for feature development

A meaningful feature should normally include:

### Product acceptance
- target user identified
- Job To Be Done defined
- measurable outcome defined
- MVP scope defined

### UX acceptance
- Builder flow defined when applicable
- End User flow defined when applicable
- empty/loading/error/success states considered
- dangerous actions clearly communicated

### Engineering acceptance
- existing architecture reused where possible
- permission/governance considered for business side effects
- tests/regression coverage added
- auditability considered
- deployment impact considered

### PMF acceptance
Where measurable, define at least one metric such as:

- activation rate
- first-run success rate
- time to first value
- task completion rate
- external integration success rate
- repeat usage
- 30-day retention
- developer recommendation / satisfaction

## 17. Required response format for AI coding/planning agents

When asked to develop or modify a feature, the AI should first provide a concise product assessment before implementation when the change is non-trivial:

1. User: Builder / End User / Both
2. Problem / JTBD
3. Product value
4. Priority and why
5. MVP scope
6. UX impact
7. Trust/Safety impact
8. Reuse opportunities
9. Acceptance metrics
10. Explicit non-goals

Then implement the smallest coherent solution.

After implementation, verify:

- the intended user flow
- regression risk
- security/governance implications
- test coverage
- whether the change accidentally expands scope

## 18. Product language discipline

Prefer:

- "AI Business Application"
- "Business-safe Agent"
- "Enterprise AI Trust Runtime"
- "Application Protocol"
- "Trusted Business Action"
- "Builder"
- "Business User"
- "Reference Application"
- "Solution Template"

Avoid positioning KeelBase as a generic Agent framework, generic CRM, generic low-code platform, or generic AI chatbot.

## 19. Final decision rule

When product priorities conflict, use this order:

`Real customer value > End-user usability > Builder usability > Business safety > PMF evidence > Reusability > Technical elegance > Feature breadth`

And when choosing between two technically valid implementations:

> Prefer the one that makes the product easier for a first-time user to understand, easier for a developer to build with, safer for a business to trust, and easier to reuse in a future customer project.
