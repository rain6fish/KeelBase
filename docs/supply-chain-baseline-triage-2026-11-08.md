<!-- SPDX-License-Identifier: Apache-2.0 -->

# Supply-chain baseline triage — DRAFT FOR USER DECISION
# 供应链基线 triage —— 待用户裁定的草案

> **Status: DRAFT. This is not an acceptance and not a decision.**
> `scripts/dependency-scan-baseline.json` has **not** been changed, no entry was removed, no severity
> was lowered, and the gate was not merged, reverted or relaxed. Every owner, date and proposed
> decision below is a proposal for the user to accept, change or reject.
>
> **状态：草案。这不是接受结论，也不是裁定结果。**
> `scripts/dependency-scan-baseline.json` **未**改动：没有删条目、没有降严重级、没有合并/回退/放宽门禁。
> 下文的每条责任人、到期日与建议处置，都只是**待用户接受/修改/驳回**的提案。

---

## 0. Verified facts / 已核实事实

English:

- The gate is `scripts/check-dependency-scan.mjs`; its baseline is
  `scripts/dependency-scan-baseline.json` (`generatedAt: 2026-11-06`, `osv-scanner v2.7.0`).
- It runs in the `supply-chain` CI job (`.github/workflows/ci.yml`), step
  `Dependency scan (high/critical in production fails)`, followed by `--selftest`.
- The gate is **already merged into `main`**: commit `5017326d` (2026-11-06 20:46 +08), which is an
  ancestor of `main`; this worktree's HEAD equals `main` (`git rev-list --left-right --count
  main...HEAD` = `0 0`). The plan's stop condition "untriaged ⇒ keep the gate unmerged" therefore
  cannot be satisfied retroactively; the corrective is to finish triage now.
- Re-ran the pinned scanner (`osv-scanner 2.7.0`, Windows binary verified against the release
  `SHA256SUMS`) read-only on the tracked tree. Result: **39 known / 0 new / 0 stale**, exit 0,
  7 lockfiles scanned. No baseline entry is stale, so all 39 still fire.
- The 39 entries are **38 HIGH + 1 CRITICAL**, all in three front-end lockfiles:
  `Front-Taro/package-lock.json` (15), `Web-Admin-React/package-lock.json` (10),
  `Web-Admin-Vue/package-lock.json` (14). `Server-NestJS` (1054 packages), the root lockfile (62)
  and `Front-Flutter/pubspec.lock` (104) have **no gated production high/critical** today.
- Gate semantics that matter for triage: (a) "production" is decided by **package name** appearing
  anywhere in the non-dev closure, so a dev-only *instance* can be gated because a different version
  of the same name is in the production closure; (b) the baseline key is
  `lockfile|package|id` — **version and severity are not compared**, so a severity escalation under
  the same first advisory ID would not read as "new".
- OSV data is internally inconsistent for `GHSA-83rm-6c8r-g728`: `/v1/vulns` says affected range
  starts at `11.1.10`, while `/v1/query` still returns the advisory for `10.0.8`, and the scanner
  fires on it. This is an upstream advisory/index inconsistency, not a local scanning error.

中文：

- 门禁是 `scripts/check-dependency-scan.mjs`；基线是 `scripts/dependency-scan-baseline.json`
  （`generatedAt: 2026-11-06`，`osv-scanner v2.7.0`）。
- 它跑在 `supply-chain` CI job（`.github/workflows/ci.yml`）的
  `Dependency scan (high/critical in production fails)` 步骤，随后还有 `--selftest`。
- 门禁**已经并入 `main`**：提交 `5017326d`（2026-11-06 20:46 +08）是 `main` 的祖先；本工作树
  HEAD 与 `main` 相同（`git rev-list --left-right --count main...HEAD` = `0 0`）。所以计划里
  「未 triage ⇒ 门禁不合并」的停止条件已无法追溯满足；补救办法是现在把 triage 做完。
- 用钉住的扫描器（`osv-scanner 2.7.0`，Windows 二进制已按 release 的 `SHA256SUMS` 校验）对受跟踪
  的树做了一次**只读**复跑。结果：**39 条已知 / 0 条新增 / 0 条陈旧**，exit 0，扫了 7 份锁文件。
  没有任何基线条目变成陈旧，说明 39 条当前都仍然触发。
- 39 条 = **38 条 HIGH + 1 条 CRITICAL**，全部落在三份前端锁文件里：
  `Front-Taro/package-lock.json`（15）、`Web-Admin-React/package-lock.json`（10）、
  `Web-Admin-Vue/package-lock.json`（14）。`Server-NestJS`（1054 个包）、根锁文件（62 个包）和
  `Front-Flutter/pubspec.lock`（104 个包）当前**没有**受门禁约束的生产高危/严重项。
- 与 triage 有关的门禁语义：(a)「生产」是按**包名**是否出现在非 dev 闭包里判定的，因此某个仅
  开发期的**实例**可能因为同名包的另一个版本在生产闭包里而被判红；(b) 基线的键是
  `lockfile|package|id`——**不比较版本、也不比较严重级**，所以同一首要公告 ID 下的严重级上升
  不会被读成「新增」。
- OSV 数据在 `GHSA-83rm-6c8r-g728` 上自相矛盾：`/v1/vulns` 说受影响范围从 `11.1.10` 起，
  `/v1/query` 却仍对 `10.0.8` 返回该公告，扫描器也照样命中。这是上游公告/索引不一致，不是本地
  扫描错误。

### Reachability legend / 可达性图例

| Code | Meaning (EN) | 含义（中文） |
|---|---|---|
| **P** | Loaded in the deployed runtime artifact; the vulnerable sink is plausibly reachable. Production-reachable. | 已进入生产运行产物；漏洞 sink 有合理可达路径。**生产可触达**。 |
| **P\*** | Loaded at runtime, but the app is documented as a **preview** and is not wired to deployment. | 运行时可达，但该应用按文档是**预览版**，未接部署。 |
| **P?** | Runtime code is present; advisory applicability itself is disputed/contradictory. | 运行时存在该代码；但公告是否适用本身有争议/矛盾。 |
| **B** | Build/CI-time only: runs on the build machine, is not shipped in the deployed artifact. | **仅构建/CI 期**：跑在构建机，不进部署产物。 |
| **N** | Installed in the tree but not loaded, or the specific vulnerable sink is not exercised. | 已安装但**不被加载**，或具体漏洞 sink 未被调用。 |

---

## 1. The 39 entries / 39 条基线条目

Every row is one baseline entry. "Decision" is a proposal, not an accepted outcome.
每一行就是一条基线条目。"建议处置"只是提案，不是已接受的结论。

| # | Lockfile | Package@version | Advisory | Sev | Reach | Decision | Reason (EN) | 理由（中文） | Owner | Expiry |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Front-Taro | `@vue/server-renderer@3.5.41` | GHSA-g2v6-rqmx-r4w6 | HIGH | N | FIX (patch) | SSR-only; the H5 client build uses `runtime-dom`, not the server renderer. Fix is 3.5.42. | 仅 SSR 用；H5 客户端构建走 `runtime-dom`，不加载 server renderer。修法是 3.5.42。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 2 | Front-Taro | `brace-expansion@1.1.18` | GHSA-6j4f-fj2g-mc7p | HIGH | B | ACCEPT | Only reached through `minimatch` ← eslint / scss-bundle / Taro CLI, all `dev:true`. Not shipped. | 只经 `minimatch` ← eslint / scss-bundle / Taro CLI 到达，链路全是 `dev:true`。不进产物。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 3 | Front-Taro | `brace-expansion@2.1.4` | GHSA-6j4f-fj2g-mc7p | HIGH | B | ACCEPT | Instance under `@tarojs/plugin-doctor` / `depcheck` has `dev:true`; build-only. | 该实例在 `@tarojs/plugin-doctor` / `depcheck` 下，`dev:true`；仅构建期。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 4 | Front-Taro | `brace-expansion@1.1.18` | GHSA-qhr7-859c-m2p7 | HIGH | B | ACCEPT | Same dev-only chain as #2. | 与 #2 同一条仅开发期链路。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 5 | Front-Taro | `brace-expansion@2.1.4` | GHSA-qhr7-859c-m2p7 | HIGH | B | ACCEPT | Same dev-only instance as #3. | 与 #3 同一个仅开发期实例。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 6 | Front-Taro | `decode-uri-component@0.2.2` | GHSA-qr28-fpjm-wq7f | HIGH | P | FIX | Runtime path `query-string` ← `@tarojs/router` ← `@tarojs/plugin-platform-h5`. Quadratic DoS on percent-encoded runs; a crafted H5 URL can reach it. | 运行路径 `query-string` ← `@tarojs/router` ← `@tarojs/plugin-platform-h5`。百分号编码串上的二次方 DoS，构造的 H5 URL 可到达。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 7 | Front-Taro | `glob@10.2.6` | GHSA-5j98-mcp5-4vw2 | HIGH | B | ACCEPT | Only the `dev:true` instance under `@tarojs/plugin-doctor` is affected; the production-closure `glob@7.2.3` is outside the advisory range (≥10.2.0). | 受影响的只是 `@tarojs/plugin-doctor` 下 `dev:true` 的实例；生产闭包里的 `glob@7.2.3` 不在公告范围（≥10.2.0）。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 8 | Front-Taro | `joi@17.13.4` | GHSA-4528-x5fx-h6hg | HIGH | B | FIX (patch) | Reached only via `@tarojs/service`, the Taro build service; validates build config, not shipped. Fix is 17.13.9. | 只经 `@tarojs/service`（Taro 构建服务）到达，校验构建配置，不进产物。修法是 17.13.9。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 9 | Front-Taro | `joi@17.13.4` | GHSA-6h2x-m376-mqjq | HIGH | B | FIX (patch) | Same build-service chain as #8. | 与 #8 同一条构建服务链路。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 10 | Front-Taro | `lodash-es@4.17.21` | GHSA-r5fr-rjxr-66jc | HIGH | N | FIX (minor) | Bundled via `@tarojs/runtime` / `taro-h5`, but the vulnerable sink is `_.template` with attacker-controlled key names; no `_.template` call exists in `Front-Taro/src`. Fix is 4.18.0. | 经 `@tarojs/runtime` / `taro-h5` 打包进来，但漏洞 sink 是 `_.template` 且需攻击者可控 key 名；`Front-Taro/src` 里没有 `_.template` 调用。修法是 4.18.0。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-22 |
| 11 | Front-Taro | `nanoid@3.3.17` | GHSA-2v37-7h3g-55p8 | HIGH | N | FIX (patch) | Runtime via `ics` ← `@tarojs/taro-h5`; the advisory needs a custom generator with `size=0`. `ics` calls `nanoid()` with no arguments, so the sink is not exercised. Fix is 3.3.18. | 经 `ics` ← `@tarojs/taro-h5` 运行时存在；公告需要自定义生成器且 `size=0`。`ics` 调用的是无参 `nanoid()`，sink 未被触发。修法是 3.3.18。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 12 | Front-Taro | `postcss@7.0.39` | GHSA-6g55-p6wh-862q | HIGH | B | ACCEPT | All `postcss@7.0.39` instances are `dev:true` (component-compiler-utils / autoprefixer / miniprogram-simulate); the production-closure `postcss@8.5.26` is above the fix line. | `postcss@7.0.39` 的所有实例都是 `dev:true`（component-compiler-utils / autoprefixer / miniprogram-simulate）；生产闭包里的 `postcss@8.5.26` 已在修复线之上。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 13 | Front-Taro | `postcss@7.0.39` | GHSA-r28c-9q8g-f849 | HIGH | B | ACCEPT | Same dev-only instances as #12. | 与 #12 同一批仅开发期实例。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 14 | Front-Taro | `source-map-js@1.2.1` | GHSA-68fv-2mgg-jv7q | HIGH | B | FIX (patch) | Used by Vue/Sass/PostCSS compilers to read build-time source maps; not in the runtime bundle. Fix is 1.2.2. | 供 Vue/Sass/PostCSS 编译器读取构建期 source map；不在运行时包里。修法是 1.2.2。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 15 | Front-Taro | `swiper@6.8.0` | GHSA-hmx5-qpq5-p643 | **CRITICAL** | N | DECIDE | The only CRITICAL. `swiper` is required only by the lazy `taro-swiper-core` chunk; `@tarojs/components` is not imported anywhere in `Front-Taro/src` and no page renders `<swiper>` / `<taro-swiper-core>`. Needs a built-bundle check before closing. Fix (12.1.2) is a major across Taro's pinned 6.8.0. | 唯一 CRITICAL。`swiper` 只被懒加载的 `taro-swiper-core` chunk 引用；`Front-Taro/src` 里没有任何地方 import `@tarojs/components`，也没有页面渲染 `<swiper>` / `<taro-swiper-core>`。关闭前需要看构建产物。修法（12.1.2）跨 Taro 钉住的 6.8.0 一个大版本。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-22 (evidence) / 2026-12-06 (decision) |
| 16 | Web-Admin-React | `axios@1.19.0` | GHSA-3pq3-5fj3-cg6v | HIGH | P\* | FIX (minor) | Node HTTP/2 adapter bypasses DNS/proxy controls; browser build maps the Node adapter to a null helper, so not browser-reachable. App is a non-deployed preview. Fix is 1.20.0. | Node HTTP/2 适配器绕过 DNS/代理控制；浏览器构建把 Node 适配器映射为空实现，故浏览器不可达。该应用是未部署的预览版。修法是 1.20.0。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 17 | Web-Admin-React | `axios@1.19.0` | GHSA-542g-h47m-68v8 | HIGH | P\* | FIX (minor) | HTTP/2 session init error is Node-only; same adapter mapping as #16. | HTTP/2 会话初始化错误仅 Node 侧；适配器映射同 #16。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 18 | Web-Admin-React | `axios@1.19.0` | GHSA-c29m-xwm3-cm6r | HIGH | P\* | FIX (minor) | `fromDataURI` ReDoS is in shared code; reachable only if a `data:` URL from an untrusted source is parsed. | `fromDataURI` 的 ReDoS 在共享代码里；只有解析来自不可信来源的 `data:` URL 时才可达。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 19 | Web-Admin-React | `axios@1.19.0` | GHSA-m8m8-qj5v-23w3 | HIGH | P\* | FIX (minor) | Node HTTP adapter prototype-pollution gadget; not browser-reachable. | Node HTTP 适配器的原型污染 gadget；浏览器不可达。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 20 | Web-Admin-React | `axios@1.19.0` | GHSA-mghh-pgcx-3jjj | HIGH | P\* | FIX (minor) | `shouldBypassProxy` ReDoS is proxy/Node-specific. | `shouldBypassProxy` 的 ReDoS 属代理/Node 特定路径。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 21 | Web-Admin-React | `axios@1.19.0` | GHSA-r4gj-5m52-g5wh | HIGH | P\* | FIX (minor) | `maxRedirects:0` not enforced by the fetch adapter; relevant only where that adapter is used. | fetch 适配器未强制 `maxRedirects:0`；只在该适配器被使用时相关。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 22 | Web-Admin-React | `axios@1.19.0` | GHSA-x97p-jq2g-jp4f | HIGH | P\* | FIX (minor) | `toFormData` prototype-pollution gadget is shared by browser and Node builds. | `toFormData` 的原型污染 gadget 在浏览器与 Node 构建里共用。 | Web-Admin-React owner / React 预览维护会话 | 2026-11-15 |
| 23 | Web-Admin-React | `follow-redirects@1.16.0` | GHSA-8r9p-f939-6h3c | HIGH | N | ACCEPT | Only the Node HTTP adapter requires it; axios's `browser` field replaces that adapter with a null helper, so it is not in the browser bundle. | 只有 Node HTTP 适配器需要它；axios 的 `browser` 字段把该适配器替换为空实现，故不在浏览器包里。 | Web-Admin-React owner / React 预览维护会话 | 2027-02-08 |
| 24 | Web-Admin-React | `follow-redirects@1.16.0` | GHSA-mrwp-f3q8-3g9p | HIGH | N | ACCEPT | Same Node-only adapter as #23. | 与 #23 同属仅 Node 适配器。 | Web-Admin-React owner / React 预览维护会话 | 2027-02-08 |
| 25 | Web-Admin-React | `follow-redirects@1.16.0` | GHSA-q3jh-wrc6-jgq8 | HIGH | N | ACCEPT | Same Node-only adapter as #23. | 与 #23 同属仅 Node 适配器。 | Web-Admin-React owner / React 预览维护会话 | 2027-02-08 |
| 26 | Web-Admin-Vue | `@intlify/core-base@10.0.8` | GHSA-83rm-6c8r-g728 | HIGH | P? | DECIDE | Runtime i18n code. The advisory record says affected range starts at 11.1.10, but the OSV query endpoint still returns it for 10.0.8; the advisory that clearly applies to 10.0.8 is GHSA-8rc2 (LOW). Needs upstream clarification before "fix" or "accept". | 运行时 i18n 代码。公告记录说受影响范围从 11.1.10 起，但 OSV 查询端点仍对 10.0.8 返回它；明确适用于 10.0.8 的是 GHSA-8rc2（LOW）。在「修」或「接受」前需要上游澄清。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-22 |
| 27 | Web-Admin-Vue | `@intlify/shared@10.0.8` | GHSA-83rm-6c8r-g728 | HIGH | P? | DECIDE | Same advisory inconsistency as #26. | 与 #26 同一条公告不一致。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-22 |
| 28 | Web-Admin-Vue | `axios@1.19.0` | GHSA-3pq3-5fj3-cg6v | HIGH | P | FIX (minor) | Deployed Vue console. This one is Node/HTTP-2-specific and not browser-reachable, but it is part of the same 1.20.0 patch. | 已部署的 Vue 控制台。本条是 Node/HTTP-2 特定、浏览器不可达，但与其余几条第 1.20.0 同一个补丁。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 29 | Web-Admin-Vue | `axios@1.19.0` | GHSA-542g-h47m-68v8 | HIGH | P | FIX (minor) | HTTP/2 init error is Node-only; fixed by 1.20.0. | HTTP/2 初始化错误仅 Node 侧；1.20.0 修复。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 30 | Web-Admin-Vue | `axios@1.19.0` | GHSA-c29m-xwm3-cm6r | HIGH | P | FIX (minor) | `fromDataURI` ReDoS is in shared code; browser thread can freeze if an untrusted `data:` URL is parsed. | `fromDataURI` 的 ReDoS 在共享代码里；解析不可信 `data:` URL 时可冻结浏览器主线程。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 31 | Web-Admin-Vue | `axios@1.19.0` | GHSA-m8m8-qj5v-23w3 | HIGH | P | FIX (minor) | Node adapter gadget; fixed by 1.20.0. | Node 适配器 gadget；1.20.0 修复。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 32 | Web-Admin-Vue | `axios@1.19.0` | GHSA-mghh-pgcx-3jjj | HIGH | P | FIX (minor) | Proxy/Node-specific ReDoS; fixed by 1.20.0. | 代理/Node 特定 ReDoS；1.20.0 修复。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 33 | Web-Admin-Vue | `axios@1.19.0` | GHSA-r4gj-5m52-g5wh | HIGH | P | FIX (minor) | fetch-adapter redirect behaviour; fixed by 1.20.0. | fetch 适配器重定向行为；1.20.0 修复。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 34 | Web-Admin-Vue | `axios@1.19.0` | GHSA-x97p-jq2g-jp4f | HIGH | P | FIX (minor) | `toFormData` prototype-pollution gadget is browser-reachable; fixed by 1.20.0. | `toFormData` 的原型污染 gadget 浏览器可达；1.20.0 修复。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 35 | Web-Admin-Vue | `follow-redirects@1.16.0` | GHSA-8r9p-f939-6h3c | HIGH | N | ACCEPT | Node HTTP adapter only; replaced by a null helper in the browser build. | 仅 Node HTTP 适配器；浏览器构建里被替换为空实现。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2027-02-08 |
| 36 | Web-Admin-Vue | `follow-redirects@1.16.0` | GHSA-mrwp-f3q8-3g9p | HIGH | N | ACCEPT | Same Node-only adapter as #35. | 与 #35 同属仅 Node 适配器。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2027-02-08 |
| 37 | Web-Admin-Vue | `follow-redirects@1.16.0` | GHSA-q3jh-wrc6-jgq8 | HIGH | N | ACCEPT | Same Node-only adapter as #35. | 与 #35 同属仅 Node 适配器。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2027-02-08 |
| 38 | Web-Admin-Vue | `source-map-js@1.2.1` | GHSA-68fv-2mgg-jv7q | HIGH | B | FIX (patch) | Used by Vue/i18n/Sass compilers at build time; not in the runtime bundle. Fix is 1.2.2. | 供 Vue/i18n/Sass 编译器构建期使用；不在运行时包里。修法是 1.2.2。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-15 |
| 39 | Web-Admin-Vue | `vue-i18n@10.0.8` | GHSA-83rm-6c8r-g728 | HIGH | P? | DECIDE | Same advisory inconsistency as #26/#27; runtime i18n package. | 与 #26/#27 同一条公告不一致；运行时 i18n 包。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-22 |

---

## 2. What this draft cannot decide / 本草案判断不了的部分

English:

1. **The CRITICAL (swiper) is not proven out of the shipped bundle.** Source evidence is strong
   (`Front-Taro/src` never imports `@tarojs/components`; `swiper` is required only inside the Stencil
   lazy chunk `taro-swiper-core_2.entry.js`), but I did **not** build `Front-Taro` and grep the
   output. Missing: a built H5 bundle. If `swiper-bundle` is in it, #15 becomes P and must be fixed
   or accepted with a major-version plan.
2. **vue-i18n family: upstream data contradicts itself.** `/v1/vulns/GHSA-83rm-6c8r-g728` excludes
   10.0.8; `/v1/query` returns it; the scanner fires. Missing: the authoritative upstream advisory
   text and a scanner re-run after the index is consistent. Until then, do not delete the entries.
3. **Web-Admin-React production scope.** `CLAUDE.md` §13.1 says it is a preview, not wired to
   deployment. If the user confirms it is out of production scope, its 10 entries are P\* → not
   "production" for acceptance purposes; the gate will still count them as production dependencies.
4. **lodash-es sink.** I checked `Front-Taro/src`, not every Taro runtime code path. Missing: a
   bundle/runtime audit for `_.template` with attacker-controlled keys.
5. **decode-uri-component exploitability.** The dependency path to the H5 router is proven; a live
   crafted-URL reproduction was not attempted. Missing: a reachability test against the built H5 app.
6. **Per-advisory axios browser reachability.** I classified by the adapter mapping in
   `axios/package.json` (`browser` field replaces the Node adapter). Missing: confirmation of which
   adapter each console actually uses at runtime (default browser behaviour is XHR/fetch).

中文：

1. **CRITICAL（swiper）尚未被证明不在发布包里。** 源码证据较强（`Front-Taro/src` 从不 import
   `@tarojs/components`；`swiper` 只在 Stencil 懒加载 chunk `taro-swiper-core_2.entry.js` 里被
   require），但我**没有**构建 `Front-Taro` 再 grep 产物。缺：一份构建后的 H5 包。若
   `swiper-bundle` 在产物里，#15 就变成 P，必须修或带大版本计划接受。
2. **vue-i18n 一族：上游数据自相矛盾。** `/v1/vulns/GHSA-83rm-6c8r-g728` 排除 10.0.8；
   `/v1/query` 却返回它；扫描器也命中。缺：权威上游公告文本，以及索引一致后的扫描复跑。在澄清前
   不要删条目。
3. **Web-Admin-React 的生产范围。** `CLAUDE.md` §13.1 说它是预览版、未接部署。若用户确认它不在
   生产范围，它的 10 条就是 P\* → 验收口径下不算「生产」；但门禁仍会把它们当生产依赖计数。
4. **lodash-es 的 sink。** 我查的是 `Front-Taro/src`，不是 Taro 运行时的每一条代码路径。缺：
   针对「攻击者可控 key 的 `_.template`」的产物/运行时审计。
5. **decode-uri-component 的可利用性。** 到 H5 路由的依赖路径已证；没有做构造 URL 的实弹复现。
   缺：针对构建后 H5 应用的 reachability 测试。
6. **axios 每条公告的浏览器可达性。** 我按 `axios/package.json` 的 `browser` 字段（把 Node 适配器
   替换为空实现）分类。缺：两个控制台运行时实际用哪个适配器的确认（浏览器默认是 XHR/fetch）。

---

## 3. Conclusion / 结论

English:

- **The gate itself is healthy and should stay merged.** It is green on the current tree (39 known /
  0 new / 0 stale), fails closed on "unverified", and its self-test proves red / green / 未核. There is
  no reason to revert it, and reverting it would be a worse outcome than triaging the baseline.
- **But D2's acceptance is not met yet.** Under the strict reading ("no unaccepted production
  high/critical"), the draft identifies production-reachable, unfixed and unaccepted entries:
  - `Web-Admin-Vue`: 7 axios + 1 decode-uri-component (Front-Taro) + 3 vue-i18n-family entries
    = 11 entries that are P or P? today.
  - If the React preview counts as production: +7 axios = 18.
  These are not accepted by this draft; they are only proposed for a fix date or for a decision.
  Therefore "every entry triaged" is true only in the sense that every entry now has a written
  reason/owner/expiry proposal; **"no unaccepted prod high/critical" is not yet true**.
- **What is missing to close D2:** the user must (a) accept or change the proposed decisions and
  dates in §1, (b) confirm the React preview's production status, and (c) release the two blocked
  judgments in §2 (built-bundle evidence for swiper; upstream clarification for vue-i18n). Until
  then the honest state is "triaged as a draft, awaiting decision" — not "clean".

中文：

- **门禁本身是健康的，应继续保持合并。** 它在当前树上为绿（39 条已知 / 0 条新增 / 0 条陈旧），
  在「未核」时 fail-closed，自测也证明了红 / 绿 / 未核三种行为。没有理由回退它，回退比把基线
  triage 完更糟。
- **但 D2 的验收尚未达成。** 按严格口径（「生产高/严重无未接受项」），草案识别出当前**生产可达、
  未修、未接受**的条目：
  - `Web-Admin-Vue`：7 条 axios + `Front-Taro` 的 1 条 decode-uri-component + 3 条 vue-i18n 一族
    = 11 条今天属于 P 或 P?。
  - 若把 React 预览版也算作生产：再加 7 条 axios = 18 条。
  本草案没有接受它们，只是给它们提了修复日期或待裁决定。所以「每条都已 triage」只在「每条都有了
  书面理由/责任人/到期提案」这个意义上成立；**「生产高/严重无未接受项」尚未成立**。
- **关闭 D2 还差什么：** 用户需要 (a) 接受或修改 §1 的建议处置与日期，(b) 确认 React 预览版是否算
  生产，(c) 放行 §2 里两条被卡住的判断（swiper 的构建产物证据；vue-i18n 的上游澄清）。在做到这些
  之前，诚实的状态是「已按草案 triage，等待裁定」——不是「干净」。

---

## 4. Reproduce / 复跑方式

```
# pinned scanner (release checksum verified)
mkdir -p /tmp/osv-gate-probe && cd /tmp/osv-gate-probe
curl -sSfL -o osv-scanner_windows_amd64.exe \
  https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_windows_amd64.exe
curl -sSfL -o SHA256SUMS \
  https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_SHA256SUMS
grep -i windows_amd64 SHA256SUMS | sha256sum -c -

# note: the scanner skips paths under a directory starting with `.`, so run it from the main
# checkout, not from `.claude/worktrees/<name>`
cd D:/Rain6fish/KeelBase
OSV_SCANNER=/tmp/osv-gate-probe/osv-scanner_windows_amd64.exe \
  node scripts/check-dependency-scan.mjs --verbose
```

Expected on 2026-11-08: `39 known, 0 new`, `0 baseline entries no longer fire`, exit 0.
2026-11-08 的预期：`39 known, 0 new`、没有陈旧条目、exit 0。
