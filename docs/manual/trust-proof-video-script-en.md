# Trust Proof Package · 60-Second Demo Video Script

> Purpose: give reviewers / integrators / the community a **60-second "ordinary agents answer; KeelBase lets agents DO things safely in real business systems"** demo video.
> Prereqs: backend running (demo provider + `delete_customer` R5 tool); each shot follows the matching step in [verify-trust-proof.mjs](../../Server-NestJS/scripts/verify-trust-proof.mjs).
> [中文](trust-proof-video-script.md) · English

## Overview

| Time | Scene | One-liner |
|------|-------|-----------|
| 0-5s | Intro | Ordinary agents answer; KeelBase lets agents do things safely |
| 5-15s | S1 Success | AI reads real business data → risk verdict `critical` |
| 15-25s | S2 Permission denied | Reading someone else's data → 403 no access |
| 25-35s | S3 High-risk action | AI tries to delete a customer → **R5 BLOCKED** |
| 35-45s | S4 Human confirmation | Writes execute only after you approve |
| 45-55s | S5 Revoke | Undo what AI did in one step, restorable |
| 55-60s | Outro | Existing systems can plug in too (Java Starter) + tagline |

## Shot by shot

### Shot 1 — Intro (0-5s)
- **Visual**: KeelBase logo (deep-blue shield), two lines below: Ordinary agents answer questions / KeelBase lets agents **do things safely** in real business systems
- **VO (EN)**: Ordinary AI answers questions. KeelBase lets AI do things — safely — inside real business systems.

### Shot 2 — S1 Success (5-15s)
- **Visual**: Workbench (`/workbench`) → AI CRM → customer "瀚宇制造" detail (2 overdue orders, ¥2.8M + ¥0.8M) → AI Copilot "analyze risk" → **risk level `critical` + evidence list**
- **Action**: S1 step of `verify-trust-proof.mjs`; or operate directly in the workbench
- **VO (EN)**: AI reads real business data and produces an evidence-based risk verdict.

### Shot 3 — S2 Permission denied (15-25s)
- **Visual**: switch to bob → open alex's customer detail → page/API returns **403 no access**
- **Action**: S2 step (bob → alex customer → 403)
- **VO (EN)**: Trying to read someone else's data? Row-level policy returns a real 403 — not just a suggestion.

### Shot 4 — S3 High-risk action (25-35s)
- **Visual**: AI Copilot "delete customer" → **R5 BLOCKED** card (irreversible action, risk tier R5, policy-blocked)
- **Action**: S3 step (chat triggers `delete_customer` → R5 block)
- **VO (EN)**: AI wants an irreversible, high-risk action? Blocked by policy before it can execute.

### Shot 5 — S4 Human confirmation (35-45s)
- **Visual**: AI Copilot "create follow-up task for 瀚宇制造" → **confirmation card** (R3 write + risk tier + authorization reasons) → click Approve → task persisted
- **Action**: S4 step (streaming chat → confirmation_request → approve → persisted)
- **VO (EN)**: AI writes? Requires your approval first — and every step is audited.

### Shot 6 — S5 Revoke (45-55s)
- **Visual**: open the action detail (Business Action Detail) → click Revoke → task soft-deleted (restorable via trash)
- **Action**: S5 step (governance lookup → owner revoke → soft-delete)
- **VO (EN)**: Everything AI does is traceable and reversible — you stay in control of your data.

### Shot 7 — Outro (55-60s)
- **Visual**: six scenarios all checked (S1-S6) + line: existing systems can plug in too — keep Java, add the AI Runtime. GitHub / site in the corner
- **VO (EN)**: Open-source, private-deployable, works with your existing systems. KeelBase — the Trust Runtime for AI in real business systems.

## Recording tips

- Subtitles: optional CN/EN dual-track; narration at natural 1.0-1.2× pace.
- Background: deep-blue theme (Admin Console default) or the workbench light-gray; keep visual consistent.
- Real operation: run each S step of `verify-trust-proof.mjs`; for real-LLM shots set `PROVIDER=deepseek`.
- If screen-recording tools are limited, the console output of `verify-trust-proof.mjs` (✓/✗ + report JSON) is a fine visual substitute.

## Related

- One-command verify script: [verify-trust-proof.mjs](../../Server-NestJS/scripts/verify-trust-proof.mjs)
- Runnable showcase doc: [security-showcase-en.md](security-showcase-en.md)
- Existing demo script: [golden-demo-script.md](golden-demo-script.md)
