---
name: consulting-to-build
description: Consulting → Build 编排——把一句业务诉求按状态机推进到可运行、可治理的应用（访谈 → Business Spec → Module Protocol → 生成 → 验证 → Run）。只做交接与门禁，不内联任何能力。触发：用户说「把这个业务需求做成应用」「从需求到跑起来」。
---

# Consulting → Build 编排

把「一句话业务诉求」按状态机推到「生成的应用真正跑起来」。

**这是一个薄编排层。它自己不做访谈、不写 Spec、不做映射、不生成代码**——每一步都交给已有的专门 skill / 脚本，本 skill 只负责：**该走哪一步、交接什么、什么条件下才允许进下一步**。

服务对象是 **Builder**（[宪法](../../../.agents/skills/keelbase-development-constitution/SKILL.md) §1.2）——终端业务用户看到的始终只是「正常业务应用 + AI 辅助」，不该看到 Pipeline、Protocol、Generator 这些概念。

## 状态机

```
DISCOVERY → CONFIRMED → BUSINESS_SPEC → PROTOCOL → BUILD → VERIFY → RUN
```

| 状态 | 交接给谁 | 输入 | 产出 | 门禁（不满足不得前进） |
|------|---------|------|------|----------------------|
| **DISCOVERY** | `keelbase-discovery` | 一句业务诉求 | Confirmed Intent + Evidence | — |
| **CONFIRMED** | — | Evidence | 用户**明确 yes** 的记录 | Evidence 中有原话级别的确认；「随便你」不算 |
| **BUSINESS_SPEC** | `keelbase-discovery` 写文件 | 确认后的理解 | `.keelbase/business-spec/<feature>.json` | 七问齐备；字段满足硬约束（六类型/camelCase/非保留名） |
| **PROTOCOL** | `scripts/generator/business-spec.mjs` | Business Spec | Module Protocol JSON + `unmapped[]` | `--check` 通过；**`unmapped[]` 已被逐条确认**（承认范围边界，不是忽略） |
| **BUILD** | `generate-module` / `keelbase init --spec` / `write-migration` | Module Protocol | 模块源码 + 7 处接线 + 迁移 | `npm run build` 通过 |
| **VERIFY** | 现有测试 | 生成物 + `acceptance[]` | 测试结果 | 生成模块单测绿；`migration:generate` 输出 "No changes"；`acceptance[]` 逐条可追溯 |
| **RUN** | 现有运行时 | 生成模块（自带 `aiTools`） | 受治理的业务动作 | 写操作走确认 → 副作用可查 → 审计可验 → 可撤销 |

## 关键规则

1. **不得跳状态**。尤其不得从 DISCOVERY 直接进 BUILD——中间必须有 Business Spec 与 Protocol 两个可复查产物。
2. **门禁是硬闸**。CONFIRMED 与 PROTOCOL 两道尤其不能糊弄：前者防止按错误理解生成一整套代码，后者防止把不可映射的东西当没看见。
3. **`unmapped[]` 不是失败**。它是本次生成的范围边界——里面的每一项都要有明确去处（手写 / 拆 Spec / 留档），逐条过一遍再进 BUILD。
4. **交付文档可选且不权威**。业务现状/方案/流程/验收等 markdown 是给客户看的人工产物，**Business Spec 才是 source of truth**，文档由它派生。
5. **不新增运行时**。RUN 阶段复用基座既有 Agent 治理链（工具注册 / CASL / 确认 / 副作用 / 审计 / 撤销），不要为演示新造工具。

## 命令速查

```bash
# BUSINESS_SPEC → PROTOCOL（只校验，CI 友好）
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<feature>.json --check

# 落协议文件
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<feature>.json --out specs/<module>.json

# BUILD
node scripts/keelbase-init.mjs --spec specs/<module>.json
cd Server-NestJS && npm run build && npm run migration:generate -- src/migrations/Add<Name>
```

## 与其他 skill 的分工

| 阶段 | 用哪个 |
|------|--------|
| 访谈 | `keelbase-discovery` |
| 生成模块 | `generate-module` |
| 加 API | `add-api` |
| 迁移 | `write-migration` |
| 业务规则（旗舰参考） | `crm-customer-risk` / `pm-deadline-risk` / `approval-policy-review` |
| 收尾审查 | `ai-code-economy-review` + 三方评审（宪法 §4.4） |

## 收尾

进入 RUN 后，按宪法 §4.3 完成定义核查：模块接线完整、双语齐全、文档同步、`migration:generate` 无漂移、验收覆盖。
