# R-10b 升级为可验签 —— 证据包 `/5` 与证据根 `/6`（2026-11-27）

- 工作树：`.claude/worktrees/dreamy-mclaren-4ec708`，分支 `claude/dreamy-mclaren-4ec708`，基于本地 `main` `e30aa3c1`。
- 本仓提交：**`b01c3abf`**（本地；记录 submodule pin `0ffd867`）。
- 前序：`6aa324a1`（链外附段，未签阶段；记录见 `handoff/r10b-reports-basis-1127.md`）。
- 契约：本地分支 `feat/evidence-package-v7`，提交 **`0ffd867`**（v7 schema + 样例 + registry + CHANGELOG；`6e11815` 为主提交，`0ffd867` 修样例 digest）。
- Java 镜像：`KeelBase4J` 的 `main`，本地提交 **`30271f8`**（vendored v7 schema + 样例；`321b887` 为主提交）。
- **未推送、未打 tag**；私库未动；无 schema / 列 / 迁移改动。

## 0. 结论

读数种类不再是「看得见但不被背书」的拷贝：`/5` 包的 `releaseReadings` 与 `/6` 证据根的
`targetStatusReadings` 都**进了签名 canonical**，改一个 `basis` 即破签。验收方式：
`verify-evidence.mjs --key` 对原包 PASS，把 `basis` 从 `receipt` 改成 `current_state` 后 FAIL。

**格式号说明**：格式命名空间与证据根**共用**，`/3` 已是证据根 v3、`/4` 已是证据根 v4，
所以可验签的新版是**包 `/5`、证据根 `/6`**（不是此前 A/B 里写的 `/3` 与 `/5`）。`/1`–`/4`
的分支与签名字节**一字未改**，旧包继续可验。

## 1. 代码改动

| 面 | 改动 |
|---|---|
| `src/governance-shared/services/audit-evidence.service.ts` | 导出 `format` → `/5`，`canonical` 加 `releaseReadings`（`chain` 之后）；证据根 `format` → `/6`，`canonicalObj` 加 `targetStatusReadings`（`coverage` 之后） |
| `scripts/verify-evidence.mjs` | 接受 `/5` `/6`；`/6` 走证据根形状（`isV4` 含 `/6`），`rootCanonical` 只在 `/6` 时加 `targetStatusReadings`；`/1`–`/4` 的重算路径不变 |
| `scripts/lib/evidence-package-canonical.mjs` | `/2` 与 `/5` 含 `compliance`；`/5` 另含 `releaseReadings`；`/1` `/2` 字节不变 |
| `scripts/check-evidence-canonical.mjs` | `/6` 必填键表加 `targetStatusReadings`；`/1|/2|/5` 包 canonical 两处对账 |
| `scripts/check-java-vector-sync.mjs` | 新增 v7 `/5` `/6` 分支的显式断言（防三处一起删） |

## 2. 契约与 Java

- 契约 `schemas/v7/evidence-package.schema.json`：在 v6 基础上新增 `/5`（`/2` + 必填
  `releaseReadings`）与 `/6`（`/4` + 必填 `targetStatusReadings`）分支；`/1`–`/4` 原样。
  新样例 `schemas/v7/samples/evidence-package-v5.json`、`...-v6.json`；两份 registry 的
  `evidence-package` 条目升到 v7；`CHANGELOG` 记 **v1.24.0 — MINOR**。
- Java `conformance/vectors`：新增三个 v7 文件（schema + 两份样例）；跨仓单源检查
  `check:java-vectors` **绿**（228/228 schema）。
- 备注：`/6` 样例的 `root.digest` 按 anchors 重算了一次（从 `/4` 样例继承的旧值不自洽），
  这是样例取值、不是形状变更。

## 3. 断言与变异

- `audit-evidence.service.spec.ts`
  - `/5` 导出：`format` 为 `/5`；按 canonical 含 `releaseReadings` 复现 HMAC == signature，
    **去掉该段则不等**（非空证）；顶层键集与 v7 `/5` 分支精确相等。
  - `/6` 证据根：`format` 为 `/6`；canonical 含 `targetStatusReadings` 时 HMAC == signature，
    **去掉该段则不等**；`[]` 与 `null`（存储在场无记录 / 缺席）仍可区分。
- `test/evidence-root.e2e-spec.ts` ⑦：真 DI + 真库，写入 `current_state` / `receipt` 两条读数；
  `/6` 包内两种种类可区分；`verify-evidence.mjs --key` PASS；**把首个 `basis` 改掉 ⇒ FAIL**
  （失败原因是「证据根签名」）。
- 变异检查：把 `/5` 的 `releaseReadings` 或 `/6` 的 `targetStatusReadings` 从 canonical 移除 ⇒
  对应用例转红；已还原。

## 4. 读数

- `npx jest src/governance-shared src/common/wire-schema`：**38 套通过 / 1 套跳过**，
  **569 例通过 / 3 例跳过**。
- `test/evidence-root.e2e-spec.ts`：**7/7**（含新增的「改种类 ⇒ 验签 FAIL」）。
- 改动 TS 文件严格 eslint（`--max-warnings 0`，未加 `--fix`）：**0**。
  注：`scripts/*.mjs` 不在项目 eslint 的 `{src,test}/**/*.ts` 范围内（既有口径）。
- `check-evidence-canonical`：`/6` 三处一致；`/1|/2|/5` 两处一致。
- `check:protocol-vectors`：绿；`check:java-vectors`：绿（228/228）。
- `Web-Admin-Vue` `npm run typecheck`：通过；`Server-NestJS` `tsconfig.build.json`：通过。
- 旧格式结构验证：`/2` 样例 PASS；`/5` `/6` 样例 PASS；`/4` 样例的 `root.digest` 本就不自洽
  （既有样例缺陷，未改），不影响任何门禁。
- **`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：35/36**。
  唯一红：`check:contract-release-gate` 的 **C1「pin 在远端可达」** —— 新 pin `0ffd867`
  只在本地的 `feat/evidence-package-v7` 分支上，尚未推到契约远端；这是**发布步骤**，
  在「不推送」的约束下无法变绿。其余 35 门全过。

## 5. 发布（已完成 2026-11-27）

1. **契约仓**：分支 `feat/evidence-package-v7`（`0ffd867`）与附注 tag **`v1.24.0`** 已推送；分支合入
   契约 `main`（合并提交 `0d45fa1`）并推送。tag 指向 `0ffd867`，满足 C3「pin 落在声称的版本线上」。
2. **Java 仓**：`main`（`30271f8`，含 vendored v7 快照）已推送 GitHub 与 Gitee。
3. **本仓**：README / README.zh-CN 兼容矩阵的 TypeScript 与 Java `main` 行改为 v1.24.0；`main`
   提交 `be889060` 已推送 GitHub 与 Gitee。`check:contract-release-gate` **PASS**（C1–C5），
   `check:all` **36/36**。

推送在工作时段按用户明确指示执行，使用了钩子自带的 `SKIP_NONWORKING_PUSH_GUARD=1`；契约 pin 硬闸
（`check-contract-pin.cjs`）未被豁免 —— C1 转绿即其证明。

仍未做：Action report 不带单次读数（其冻结 schema `additionalProperties: false`，要带需契约 MINOR +
新聚合口径，见前一份 handoff §3.2）。
