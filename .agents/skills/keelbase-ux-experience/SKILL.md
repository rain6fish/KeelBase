---
name: keelbase-ux-experience
description: UX and usability guardrails for KeelBase. Use when designing, implementing, reviewing, or modifying UI, interaction flows, AI experiences, Builder/Admin workbench, or reference applications. Evaluate both Builder UX and End User UX, optimize time-to-value, clarity, recoverability, and business-task completion.
---

# KeelBase UX & Experience Skill

## 1. Purpose

KeelBase has two distinct user experiences:

- Builder UX: developers/admins use KeelBase to build, integrate, govern, test, and deploy AI applications.
- End User UX: business users use applications built with KeelBase to complete real business work.

Always identify which experience is being changed. If both are affected, evaluate them separately.

## 2. Core UX principles

1. Business value before platform complexity.
2. First-time success before advanced configurability.
3. Progressive disclosure: expose complexity only when needed.
4. Safe defaults for AI actions.
5. Clear system state: users should know what AI is doing, what happened, and what requires confirmation.
6. Errors should be actionable and recoverable.
7. Reuse familiar enterprise interaction patterns instead of inventing unnecessary UI metaphors.
8. Do not force End Users to understand Agent, MCP, Protocol, CASL, Tool Registry, audit-chain, or runtime internals.
9. Every important AI action should have an understandable business outcome.
10. Prefer a short coherent workflow over a feature-rich but confusing interface.

## 3. Builder UX

Builder/Admin users need to accomplish:

`Understand -> Create -> Connect -> Configure -> Test -> Govern -> Deploy`

Builder UX should optimize:

- discoverability
- predictable configuration
- low setup friction
- clear relationships between Protocol, Tool, Agent, permission, governance, and application
- useful validation messages
- actionable errors
- easy debugging
- visible audit/evaluation feedback
- reusable templates
- simple local/private deployment

When introducing configuration, ask whether a sensible default can eliminate the configuration entirely.

## 4. End User UX

End Users should experience the result as a normal business application with useful AI assistance.

Prioritize:

- familiar navigation
- task-oriented pages
- clear business terminology
- obvious AI entry points
- concise AI results
- context-aware actions
- visible confirmation for risky operations
- clear success/failure states
- recovery and undo/revoke where applicable
- responsive performance

Do not expose platform concepts simply because they exist internally.

## 5. AI interaction rules

AI should not behave like an opaque chatbot when it performs business work.

For read-only requests:

`User intent -> AI understanding -> Data retrieval -> Result -> Source/context when useful`

For side effects:

`User intent -> AI understanding -> Proposed action -> Risk/permission evaluation -> Human confirmation when required -> Execute -> Result -> Audit`

Confirmation UI must make clear:

- what will happen
- which business object is affected
- important consequences
- who/what is authorizing the action
- how to cancel

Avoid confirmation dialogs that say only "Are you sure?".

## 6. UX acceptance states

For meaningful UI flows, explicitly consider:

- first-use / onboarding
- empty state
- loading state
- success state
- partial success
- validation error
- permission denied
- AI/tool failure
- timeout
- confirmation required
- cancelled action
- retry
- recovery / revoke

A feature is incomplete if the happy path works but failure paths are confusing.

## 7. Time-to-value targets

Design toward these targets:

- Time to Understand: <= 60 seconds
- Time to First Run: <= 10 minutes
- Time to First Value: <= 10 minutes
- Time to First AI Business Action: <= 15 minutes
- Time to First Custom Tool for Builder: <= 30 minutes

When a UX change makes a common task longer, justify the added complexity with a measurable safety or business benefit.

## 8. Reference application rule

AI CRM, AI Project Management, and AI Approval/Knowledge are reference applications and future solution templates.

Their UX must satisfy two goals:

1. Be genuinely usable by business users.
2. Be structured so the application can be customized for future customer projects.

Prefer reusable components, patterns, navigation structures, and business interaction primitives over one-off demo screens.

## 9. AI CRM UX priorities

The CRM should make the following flow obvious:

`Query -> Analyze -> Risk -> Create Task -> Confirm -> Execute -> Audit`

Example End User intent:

> Find high-risk customers and create follow-up tasks.

The interface should distinguish:

- information discovered by AI
- recommendations
- proposed actions
- actions already executed

Never make an AI recommendation look like an already executed business change.

## 10. UX for business safety

Security must be understandable without exposing implementation details.

Good:

> "This will create a follow-up task for 3 customers. Review and confirm before creating."

Bad:

> "CASL policy ToolPermission.CREATE_CUSTOMER_TASK denied/allowed."

Technical details may be available in an Admin/Developer trace, but ordinary users should receive business-language explanations.

## 11. Builder vs End User information architecture

Builder/Admin navigation may include:

- Applications
- Protocols
- Agents
- Tools
- Governance
- Policies
- Audit
- Evaluation
- Deployment

End User navigation should instead reflect the business domain:

- Customers
- Opportunities
- Activities
- Tasks
- Projects
- Approvals
- Documents
- Knowledge
- AI Assistant

Do not mirror Builder navigation into the business application.

## 12. Mobile and multi-end rule

Do not automatically replicate every feature across Web, Flutter, and Taro.

Choose the primary interaction surface according to the task:

- Builder/workbench: Web first by default.
- Business operations: Web/mobile according to real usage patterns.
- Lightweight field tasks: mobile when evidence supports it.

Keep multi-end consistency in concepts and states, not necessarily identical screens.

## 13. UX measurement

Where possible, define quantitative measures:

- first-run success rate
- task completion rate
- time on task
- error rate
- abandonment rate
- time to first value
- AI action confirmation rate
- successful AI business-action rate
- repeat usage
- 30-day retention
- user satisfaction / NPS

For usability testing, prefer observing an unfamiliar user complete a task without verbal assistance.

## 14. Blind usability test

For important releases, test with someone who does not already understand KeelBase.

Suggested tasks:

1. Explain what the product does.
2. Start the system.
3. Complete one valuable AI business task.
4. Perform or review a governed business action.
5. Find where to understand what happened.
6. For Builders, connect or create one custom Tool/application capability.

Record where the user hesitates, asks for help, fails, or misunderstands the system.

## 15. UX anti-patterns

Avoid:

- developer terminology in business-facing screens
- exposing every internal capability in navigation
- giant configuration forms before first value
- AI chat with no connection to actual business actions
- destructive AI actions without appropriate confirmation
- unclear distinction between suggestion and execution
- silent failures
- generic technical errors
- excessive modal dialogs
- duplicated flows across channels without evidence
- designing only for screenshots/demo appearance

## 16. Required UX review before implementation

For non-trivial UX work, provide:

1. User type: Builder / End User / Both
2. User task / JTBD
3. Current friction
4. Desired outcome
5. Primary flow
6. Failure/recovery flows
7. Trust/safety implications
8. Reusable UI patterns/components
9. Measurable UX acceptance criteria
10. Non-goals

Then implement the smallest coherent UX that proves value.

## 17. Final UX decision rule

When choosing between two UX solutions, prefer the one that:

`reduces cognitive load + shortens time-to-value + preserves business safety + makes outcomes obvious + remains reusable for future customer projects`.

Do not optimize for visual novelty when it harms usability.
