# 发布前标准程序（Release Precheck）

> 2026-08-21 确立（用户要求，作为 Release Gate 前置标准程序）。每次版本发布前必须执行，通过后才进入发布。

## 标准程序（三步，顺序执行）

### ① 代码审核（三方 + Code Economy，四层）

**四层独立审核 → 整合结果 → 落地改进**：

1. **阿里 code review（OpenCodeReview / `ocr` CLI，v1.9.4）**：对本次发布 diff 审查——
   - `ocr review --from <prev-release> --to <release-branch>`（对发布区间 diff）
   - 或 `ocr scan`（全文件审查出报告）
   - 或 Claude Code 会话内 `/open-code-review:delegate-review`（OCR 选文件/规则 + 宿主审查，免 key）
2. **Claude Code 自带 code review**：对同一 diff 跑 Claude 的多维代码审查（正确性 / 安全 / 性能 / 简化 / 测试覆盖）。
3. **code-review skill（mattpocock，2026-08-28 安装）**：对同一区间跑双轴评审——Standards（是否符合仓库编码规范）与 Spec（是否符合源 issue/spec 要求），两轴并行子代理，结果并排报告。触发方式：`/code-review <commit|branch|tag|merge-base>`。
4. **AI Code Economy Review（`/ai-code-economy-review` skill）**：对同一区间跑 Code Economy 审查（第四层，**不重复**前三层职责）——只检查 Necessity / Reuse / Simplicity / Proportionality / Deletion / Maintainability，重点发现 unnecessary code、reuse opportunity、AI-generated duplication、unnecessary abstraction、speculative engineering、wrapper、dead code、excessive complexity、disproportionate code expansion、deletion opportunity。判断原则：LOC 是信号非质量分（结合 Requirement/Implementation Complexity 判断 Proportionality）；KeelBase 的 Security/Governance/Audit/Transaction/Domain/Plugin/Protocol/External integration 边界 abstraction 不因「单一实现」判垃圾，需具体证据；Finding 必须区分 FACT/SUSPECTED + 给出 Severity/Category/File/Line/Evidence/Reason/Recommendation/Confidence；推荐动作按 `DELETE > REUSE > SIMPLIFY > CONSOLIDATE > REFACTOR > ADD`；默认 review-only 不改码。输出 Verdict：PASS / WARN / REFACTOR / REJECT。
5. **整合**：合并四层意见，去重、分级（阻塞 / 建议 / 风格），阻塞项必须修复；建议项择优落地；改进提交回 master。

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
- 四层 code review：阿里 X 条 + Claude 自带 Y 条 + code-review skill Z 条 + Code Economy K 条 → 修复 W 条阻塞项
- 全量测试：后端单测/e2e/前端/Flutter/生成器 全过（覆盖率 backend xx% / flutter xx%）
- 覆盖率：较上版 +x.x% / 达标
```

## 相关

- [release-gate.md](release-gate.md) — Release Gate 五维判定
- `scripts/release-gate.sh` — 统一验证入口
