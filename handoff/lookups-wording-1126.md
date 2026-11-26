# 释放审计行 `lookups:` 措辞收口（2026-11-26）

## 结论

漂移是**文档单方落后**，不是实现偏离契约：契约向量与实现都写
`lookups: N asked (see releaseLookups)`，只有 `docs/revoke-contract.spec.md` §6 的 EN/ZH 两段
还写着旧句式 `lookups: N asked, newest first (k of N)`。

权威依据（实现 + 契约一致）：

- 实现：`Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts` 的
  `_lookupPhrase()` —— 次数只进散文，读数本身进链外列（F-85b 的既定分工）。
- 契约向量：`Server-NestJS/specs/protocol/ai-audit-log-release-evidence-v1-vector.json` 及
  `.../schemas/v8/samples/ai-audit-log-row-release-evidence.json` 均为
  `lookups: 2 asked (see releaseLookups)`。
- `CLAUDE.md` §9 释放行、`docs/releases/v1.5.0.md` 早已是正确措辞。

因此**未改实现、未改契约、未改 schema**。

## 改动

1. `docs/revoke-contract.spec.md` §6
   - EN（原 582–584 行）：把「写 `lookups: N asked, newest first (k of N)`，超过三条时」改为
     「散文写次数 `lookups: N asked (see releaseLookups)`，不论次数多少同一句式；最近三条读数
     最近的在前，记在链外列，读数只记那一处、不在散文中复述」。
   - ZH（原 713–714 行）：同义改写，去掉 `(k of N)`。
   - 零读数的三态措辞（`never queried` / `not askable …` / R-6b 的 `lookup record missing …`）
     一字未动。
2. `Server-NestJS/src/governance-shared/services/write-claim-decision.service.spec.ts`
   - 在既有 F-127「问过五次」用例（原文只断言结构化列）里补两条最小断言：
     `detail` 含 `lookups: 5 asked (see releaseLookups)`、且不含 `newest first`。
     选这条用例是因为它正好覆盖旧文档所说「超过三条」的场景 —— 此前没有任何断言落在该语料上。
   - 既有 `N asked` 断言（本文件 233 / 627 行、`target-status-reconcile.spec.ts:345`）原样保留；
     三态措辞的既有断言未改。

## 断言所在

- `write-claim-decision.service.spec.ts`：`F-127：count 与最近三条出自一条 SQL` 用例内新增两行。
- 变异验证：把实现临时改成旧句式 `lookups: N asked, newest first (k of N)` ⇒ 3 例转红
  （2 条既有 + 1 条新增）；随后已还原（`git diff` 只剩 spec 与 docs 两个文件）。

## 读数

- 定向 `npx jest src/governance-shared/services/write-claim-decision.service.spec.ts`：27/27。
- `npx jest src/governance-shared`：37 套 / 544 例通过（1 套 PG 跳过，3 例跳过）。
- 改动文件严格 `eslint`（不带 `--fix`）：0 error。
- `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**（69.8s）。

## 未做 / 说明

- `handoff/r3-copy-ids-1125.md:68` 仍记载旧措辞 —— 那是当日的漂移记录（且写明「未改」），
  属历史留档，未回溯改写。
- 未改零读数三态的实现与断言；未推送、未打 tag；未触及私库。
- 本 worktree 原缺 `Server-NestJS/node_modules`，用目录联接复用主检出（lockfile 哈希一致：
  `d9114b75…`），联接不进版本控制。
