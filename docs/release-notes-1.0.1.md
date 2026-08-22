# KeelBase v1.0.1 — Maintenance & Coverage Release / 维护与覆盖加固版

> **KeelBase 1.0.1 是首个 1.0 补丁**：收口 v1.0 发布前 review 的两项遗留（AI 每日限额并发原子化 / WS 节流窗口命名）+ 来源身份体系补齐（System AI 来源身份 / doctor 兼容矩阵）+ 测试覆盖大幅提升（后端 24 文件到 85%+、管理台 10 视图、Flutter 102 用例）。
>
> KeelBase 1.0.1 is the first 1.0 patch: two v1.0-review leftovers (concurrency-atomic AI daily limit / WS throttle naming) + provenance system completion (System AI source identity / doctor compatibility matrix) + a large test-coverage surge.

## New in v1.0.1 / 新增

- **System AI source identity (provenance §13.1 ③)**: `AdminAiService.buildSystemContext` injects the source identity from `.keelbase/manifest.json` (identity / generator+version / protocol / schema / source modules) — the console AI can now answer "what system is this / who generated it / which protocol version"; complements the public `GET /app/provenance` runtime fingerprint.
  **System AI 来源身份（来源清单 §13.1 ③）**：`AdminAiService.buildSystemContext` 注入 `.keelbase/manifest.json` 来源身份（identity/generator+version/protocol/schema/来源模块）——管理台 AI 可答「这是什么系统/谁生成的/什么协议版本」；与公开 `GET /app/provenance` 运行时指纹互补。
- **`keelbase doctor` compatibility matrix (provenance §13.1 ⑤)**: new fifth check compares the manifest `protocol`/`schema` against the current CLI's supported values (mismatch → FAIL); alongside completeness / consistency / runtime / version checks.
  **`keelbase doctor` 兼容矩阵（来源清单 §13.1 ⑤）**：新增第五查——manifest `protocol`/`schema` 对照当前 CLI 支持的版本（不匹配 → FAIL）；与完整性/一致性/运行时/版本并列。
- **Test coverage surge**: backend 24 low-coverage files → 85%+ (most 100%); Web-Admin-Vue 10 core view component tests (35 cases); Flutter flagship detail/list pages, repositories & core (102 cases).
  **测试覆盖大幅提升**：后端 24 个低覆盖文件 → 85%+（多数 100%）；管理台 10 个核心视图组件测试（35 用例）；Flutter 旗舰详情/列表页 + repository + core（102 用例）。

## Fixed / 修复

- **AI daily limit concurrency-atomic (v1.0 review S3)**: `reserveDailyUsage` atomic conditional increment (`WHERE count < limit`, same as the headless quota) replaces read-check-write — concurrent chats can no longer collectively exceed `ai_daily_limit`; failed chats release their reserved slot via `releaseDailyUsage` (only when `count > 0`).
  **AI 每日限额并发原子化（v1.0 review S3）**：`reserveDailyUsage` 原子条件递增（`WHERE count < limit`，同 headless 配额）替代「读-判-写」——并发请求不再集体越过 `ai_daily_limit`；对话失败经 `releaseDailyUsage` 释放预留槽（仅 `count > 0` 时）。
- **WS `ai:chat` throttle window naming (v1.0 review S4)**: `AI_CHAT_LIMIT_PER_MIN` → `AI_CHAT_LIMIT_PER_WINDOW` (window = 30s heartbeat sweep, effective 30/30s ≈ 60/min) — constant now matches behavior.
  **WS `ai:chat` 节流窗口命名（v1.0 review S4）**：`AI_CHAT_LIMIT_PER_MIN` → `AI_CHAT_LIMIT_PER_WINDOW`（窗口=30s 心跳 sweep，实际 30 次/30s ≈ 60/min）——常量名与行为一致。

## Quality / 质量

- Backend: **196 suites / 1682 unit tests** green + security-module tier gate (all ≥85%); **16 e2e suites / 245 tests** green; coverage **92.7% statements / 77.8% branches / 90.4% functions** (up from 91.1/77.1/84.9 at v1.0.0).
  **后端**：**196 套件 / 1682 单测**全绿 + 安全模块分档门控（全 ≥85%）；**16 e2e 套件 / 245 测试**全绿；覆盖率 **92.7% / 77.8% / 90.4%**（较 v1.0.0 的 91.1/77.1/84.9 提升）。
- Flutter: **623 tests** green, line coverage **77.1%** (up from 62.3%). Web-Admin-Vue: vitest green, coverage **~75.5%** (up from 39.5%).
  **Flutter**：**623 测试**全绿，行覆盖 **77.1%**（v1.0.0 为 62.3%）。**Web-Admin-Vue**：vitest 全绿，覆盖 **~75.5%**（v1.0.0 为 39.5%）。
- Release Gate: deterministic **11/11 PASS** (Gate 1 Golden + Build + Endpoints + Trust + Private).
  **Release Gate**：确定性 **11/11 PASS**（Gate 1 Golden + Build + Endpoints + Trust + Private）。

---

**Docs / 文档**：CHANGELOG `[1.0.1] - 2026-08-22`、`docs/manual/release-gate.md`（v1.0.0 结论 + 1.0.1 记录）、`docs/system-ai-assistant.spec.md`（来源身份上下文块）、`docs/module-protocol.md` §6.3（doctor 五查）、`docs/manual/built-with-keelbase.md`（CLI 识别五查）。私有仓 roadmap §13.1 ③⑤ 已标记完成。
