# 发布前标准程序（Release Precheck）

> 2026-08-21 确立（用户要求，作为 Release Gate 前置标准程序）。每次版本发布前必须执行，通过后才进入发布。

## 标准程序（三步，顺序执行）

### ① 双重代码审核（整合改进）

**两份独立审核 → 整合结果 → 落地改进**：

1. **阿里 code review（OpenCodeReview / `ocr` CLI，v1.9.4）**：对本次发布 diff 审查——
   - `ocr review --from <prev-release> --to <release-branch>`（对发布区间 diff）
   - 或 `ocr scan`（全文件审查出报告）
   - 或 Claude Code 会话内 `/open-code-review:delegate-review`（OCR 选文件/规则 + 宿主审查，免 key）
2. **Claude Code 自带 code review**：对同一 diff 跑 Claude 的多维代码审查（正确性 / 安全 / 性能 / 简化 / 测试覆盖）。
3. **整合**：合并两份意见，去重、分级（阻塞 / 建议 / 风格），阻塞项必须修复；建议项择优落地；改进提交回 master。

### ② 全量测试

| 套件 | 命令 | 门槛 |
|------|------|------|
| 后端单测 + 覆盖率 | `cd Server-NestJS && npm run test:cov` | statements≥65 / branches≥55 / functions≥60 / lines≥65 + 安全模块分档门控（statements≥60） |
| 后端 e2e | `npm run test:e2e` | 14 个 suite 全过 |
| 前端 vitest（Web-Admin-Vue） | `cd Web-Admin-Vue && npm test` | 行覆盖 ≥30% |
| Flutter 测试 | `cd Front-Flutter && flutter test --coverage` | 行覆盖 ≥45% |
| 生成器/CLI | `node --test scripts/keelbase-init.test.mjs` + `node --test scripts/keelbase-plugin.test.mjs` | 全过 |
| Gate 1 Golden Application | `./scripts/verify-golden-application.sh` | 9 项 PASS（AI CRM 一次跑通闭环 + Build + Provenance）|
| 文档-端点一致性 | `node scripts/verify-endpoint-docs.mjs` | 声明端点（CLAUDE.md §9）全在代码中，0 条缺失 |
| Release Gate | `./scripts/release-gate.sh` | 确定性 Gate 全 PASS |

### ③ 提高测试覆盖率

- 全量跑 `test:cov` / `flutter test --coverage` / vitest 覆盖率后，对比上一版：
- **覆盖降级或未达标 → 必须补测试提升**（新增模块/文件的最低覆盖缺口优先）
- 目标：发布时后端 statements ≥ 门槛且不低于上一版；安全模块分档门控通过

## 执行记录

每次发布前执行后，在 CHANGELOG/发布记录记一笔：

```text
Release Precheck（<日期>）：
- 双重 code review：阿里 X 条 + Claude Y 条 → 修复 Z 条阻塞项
- 全量测试：后端单测/e2e/前端/Flutter/生成器 全过（覆盖率 backend xx% / flutter xx%）
- 覆盖率：较上版 +x.x% / 达标
```

## 相关

- [release-gate.md](release-gate.md) — Release Gate 五维判定
- `scripts/release-gate.sh` — 统一验证入口
