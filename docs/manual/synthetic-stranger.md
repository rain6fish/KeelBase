# 合成陌生人验证 harness（Synthetic Stranger）

> **状态标记**：🚧 规划（W3 拟外验证，2026-08-20 采纳）。外部开发者/社区短期不可得，以「无本仓上下文 AI Agent」模拟陌生人跑验收，替代外部验证的一部分。
> 关系：与 `agent-benchmark.mjs`（安全/能力基准）互补——本 harness 测 **DX / onboarding 卡点**，benchmark 测**安全 / 能力**。

---

## 1. 目的

真实外部开发者短期无法获得（2026-08-20 确认）。本 harness 提供可重复、免费、进 CI 的「陌生人视角」验证：

> 每个 `keelbase init` / 生成 / 导入 / 接入动作，都按「一个不认识 KeelBase 的人」的视角跑一遍，持续烧掉 onboarding 卡点——未来真实外部开发者到达时，验证成本已近零。

## 2. 设计

```text
干净 clone（无任何会话上下文，不含本会话记忆）
   ↓
任务脚本：30min Build + 60min Business（分步 checkpoint）
   ↓
fresh-context Agent 执行，逐步记录
   ↓
卡点报告：Where stuck / Why stuck / Missing abstraction / Time / Would use again
   ↓
回归入库（CI 或手动基线）→ 修 DX → 重跑卡点数下降
```

**执行前提**：
- 干净 checkout（含 docs + 示例 + seed）
- fresh-context Agent：不注入本仓库知识、不携带 CLAUDE.md 之外的会话记忆
- 超时护栏：30min Build / 60min Business，超时记 fail + 卡点
- 非阻塞标记：外部依赖（LLM key、网络）导致的失败不计入 DX 卡点

## 3. Persona

### P1 通用开发者（默认）

- 背景：熟悉 REST / 全栈，不了解 KeelBase
- 任务：从零生成一个带权限 / AI 工具 / 确认 / 审计的业务模块（对齐 [30min-acceptance.md](30min-acceptance.md)）

### P2 Java 团队视角（2026-08-20 新增；2026-08-23 对齐 AI Bridge 加固 + 委托 token）

- 背景：Java / Spring 团队，有存量 REST API（OpenAPI），不想学 KeelBase 全套
- 任务：
  1. 用已有 OpenAPI 导入（先按决策表选路 A / B；真实 spec 多为 YAML / 多文件 / $ref 组合——AI Bridge §3 已支持）
  2. 生成模块（A）或代理工具（B）
  3. 配置治理（确认 / 审计）
  4. **身份桥接**：签发委托 token（`POST /auth/delegation-token`，audience=目标系统），Java 端共享 `DELEGATION_SECRET` 验签后按 `oidcSub`/`local:<userId>` 映射本地用户（§5）
  5. AI 完成一个真实业务任务（读 + 写）
  6. 越权验证（他人数据 → 拒绝）
- 重点观察：
  - OpenAPI 导入对真实 spec（YAML / 多文件 $ref）可用性 + `skipped`/`notes` 报告可读性
  - 委托 token 桥接是否让 Java 系统识别到正确用户身份
  - 指南能否让它在不读 Core 代码的情况下继续

## 4. 卡点记录表

| 字段 | 说明 |
|---|---|
| Where stuck | 卡在哪一步 |
| Why stuck | 根因（缺文档 / 缺命令 / 缺抽象 / 文档误导）|
| Missing abstraction | 缺失的抽象（若有）|
| Time | 到该步耗时 |
| Would use again | 0-5 |

## 5. 输出与入库

- 报告：`docs/benchmark/synthetic-stranger/` 或 stdout JSON（一次性任务）
- 基线：首轮记录卡点清单；每轮 diff → 修 DX → 卡点数下降
- CI：脚本化后接入独立 job，标记**非阻塞**（避免外部因素误红）

## 6. 与 Release Gate 的关系

- 是「对抗性证明」三件套之一：越权矩阵 + Agent Security Eval 攻击测试集 + 合成陌生人验证
- 达标线：
  - P1：任务全通，无「需要读 Core 代码才能继续」的卡点
  - P2（Java 视角）：OpenAPI 导入链路可用，指南自洽，越权被拒

## 相关

- [ai-bridge.md](ai-bridge.md) — AI Bridge 规格（P2 场景依赖）
- [dev-challenge.md](dev-challenge.md) — 外部开发者验收包（真实外部 PoC 用）
- [release-gate.md](release-gate.md) §5 — 对抗性证明
