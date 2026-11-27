# 释放被拒行不再读成一次释放（控制台标签，零契约）— 2026-11-27

## 结论 / 一句话

控制台的 AI 审计列表与 AI 时间线现在按**行结局**而非仅按动作取标签：`action=claim_release` 且
`detail` 以 `release refused` 开头的行显示「释放被拒」/`Release refused`，其余释放行保持原标签
（「释放写占位（结论未知）」/`Release write claim (conclusion unknown)`）。**未改后端语义、未改 API、
未翻契约、未新增动作。**

worktree：`.claude/worktrees/compassionate-elion-430c7a`；分支：`claude/trusting-merkle-f7eaee`；
起点：`e18233d9`（本地 main）。

## 依据

- 后端已把两种结局分开：`Server-NestJS/src/governance-shared/services/audit-explanation-state.ts`
  的 `releaseRowState()`（`:171-177`）——拒绝记 `rejected`、释放记 `result_unknown`。
- 契约 `docs/revoke-contract.spec.md` §6（`:670-671`、`:787-788`）写明：拒绝行的 `detail`
  **开头即** `release refused (stale_view)`。故前端只依赖该前缀，不解析更多内容。
- 列表行带 `detail`（`AiAuditLogWithUser.detail`，`audit-query.service.ts:25`），渲染层可直接读。

## 改了什么（文件 + 位置）

渲染层（唯一改动面）
- `Web-Admin-Vue/src/utils/businessLabel.ts`（`:24-34`）：新增 `isReleaseRefusedRow(row)`
  ——`action === 'claim_release' && detail` 以 `release refused` 开头。两处视图共用这一条规则，
  避免各写一份前缀判断。
- `Web-Admin-Vue/src/views/audit/AiAuditView.vue`（`actionLabel()`，`:885-903`，分流在 `:896`）：先判结局，被拒行
  直接返回 `t('action.claim_release_refused')`；其余行保持原 `actionKey → feature` 查表逻辑。
- `Web-Admin-Vue/src/views/ai-timeline/AiTimelineView.vue`（新增 `actionWord()` `:353-365`，默认
  分支改用 `:432`）：时间线**没有自己的结局字段**，`claim_release` 走 default 分支只按动作取词，
  同一误读同样存在；按同一规则修，其余动作词表/原始令牌回退逻辑不变。

i18n（双语，沿用既有 `action.*` 容器——两个视图同取一处，单一来源）
- `Web-Admin-Vue/src/i18n/zh.ts`（`:1098-1101`）：`claim_release_refused: '释放被拒'`。
- `Web-Admin-Vue/src/i18n/en.ts`（`:1099-1102`）：`claim_release_refused: 'Release refused'`。
- 未新增 `feature['ai.*']` 键：`feature` 里的 `ai.claimRelease` 仍是释放行原标签
  「AI · 释放写占位（结论未知）」，被拒行由渲染层先行分流，不进入该查表。

测试
- `Web-Admin-Vue/src/views/audit/__tests__/AiAuditView.spec.ts`：新增用例「claim_release：被拒行显示
  「释放被拒」，释放行保留原标签」——两行各一条，断言两种标签**各出现一次**（若忽略结局，两行都会
  带上释放标签）。注：视图并行发两次 `logs` 查询（列表 + 错误行），测试用
  `mockResolvedValueOnce(...).mockResolvedValue([])` 把错误查询置空，避免同一行被渲染两次污染计数。
- `Web-Admin-Vue/src/views/ai-timeline/__tests__/AiTimelineView.spec.ts`：新增用例
  「claim_release：被拒行显示「释放被拒」，释放行仍显示「释放写占位」」。
- 既有用例全绿（见下）。

## 读数

| 检查 | 命令 | 结果 |
|------|------|------|
| 视图测试 | `npx vitest run src/views/audit src/views/ai-timeline` | 2 文件 / **28 用例全过**（audit 20、timeline 8），6.26s |
| 类型检查 | `npm run typecheck`（`vue-tsc --noEmit`） | 无输出，通过 |
| ESLint（严格，未加 `--fix`，仅改动文件） | `npx eslint <7 个改动文件> --ext .vue,.ts` | **0 error**，4 条既有 warning（测试文件里的 stub 组件，位于未改动的 59/65/67 行） |
| 构建 | `npm run build` | `✓ built in 10.91s` |

未做浏览器实测：被拒行需要真实账本里的 `stale_view` 拒绝数据，本机没有可用后端与这类数据；
该规则由上面的视图测试直接断言渲染文本，且只依赖契约写明的前缀。

## 遗留 / 边界

- 只读审计行的**结构化筛选**仍分不出「释放」与「被拒」（按 `action` 计数会把被拒尝试算作一次释放）——
  这是 R-4 已裁的口径（F-97/F-100：等出现「只读审计行就行动」的消费者再翻契约），本条只修渲染层，
  未动。全部列表/导出/解释面的结局由后端 `releaseRowState()` 负责，前端不复制词表。
- 未改 `Web-Admin-React` 预览版：按项目口径，React 版是否跟随后续改动由用户单独决定；如需同步另开。
