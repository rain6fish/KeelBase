<!-- SPDX-License-Identifier: Apache-2.0 -->

# Supply-chain baseline triage — ACCEPTED
# 供应链基线 triage —— 已接受

> **Status: accepted by the user on 2026-11-08, then remediated.** The dispositions, owners and
> expiries in §1 are the accepted triage for the 39 baseline entries. A remediation pass followed:
> 30 entries were fixed and pruned (baseline 39 → 9) through the gate's own `--update-baseline`
> path; 7 build-only entries and 2 blocked entries remain, with the blocked two accepted until
> 2026-12-06. Items marked FIXED landed on 2026-11-08; items marked ACCEPT are explicitly accepted
> until their expiry. The gate was never relaxed, and no entry was removed while it still fired.
>
> **状态：用户已于 2026-11-08 接受，随后完成整改。** §1 的处置、责任人与到期是 39 条基线条目的
> 已接受 triage。随后执行了整改：30 条修复并用门禁自带的 `--update-baseline` 剪掉（基线 39 → 9）；
> 剩余 7 条仅构建期与 2 条受阻项，其中受阻两条接受到 2026-12-06。标 FIXED 的条目于 2026-11-08
> 落地；标 ACCEPT 的条目按其到期日被接受。门禁从未放宽，仍然触发的条目一条没删。

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
  `SHA256SUMS`) read-only on the tracked tree. Result (starting state): **39 known / 0 new /
  0 stale**, exit 0,
  7 lockfiles scanned. No baseline entry is stale, so all 39 still fire.
- The 39 entries are **38 HIGH + 1 CRITICAL**, all in three front-end lockfiles:
  `Front-Taro/package-lock.json` (15), `Web-Admin-React/package-lock.json` (10),
  `Web-Admin-Vue/package-lock.json` (14). `Server-NestJS` (1054 packages), the root lockfile (62)
  and `Front-Flutter/pubspec.lock` (104) have **no gated production high/critical** today. This
  paragraph records the starting state; after the 2026-11-08 remediation the baseline is **9
  entries** (see §1A).
- Gate semantics that matter for triage: (a) "production" is decided by **package name** appearing
  anywhere in the non-dev closure, so a dev-only *instance* can be gated because a different version
  of the same name is in the production closure; (b) the baseline key is
  `lockfile|package|id` — **version and severity are not compared**, so a severity escalation under
  the same first advisory ID would not read as "new".
- `GHSA-83rm-6c8r-g728` initially looked inconsistent: `/v1/vulns` shows a semver range starting at
  `11.1.10`, while `/v1/query` returns the advisory for `10.0.8`. The clarification (2026-11-08) is
  that the record also lists `9.14.5` and `10.0.8` explicitly as affected versions; the v9/v10 lines
  are unsupported and will not be fixed. This is not a local scanning error. Details in §1A.

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
  `Front-Flutter/pubspec.lock`（104 个包）当前**没有**受门禁约束的生产高危/严重项。本段记录的是
  起点状态；2026-11-08 整改后基线为 **9 条**（见 §1A）。
- 与 triage 有关的门禁语义：(a)「生产」是按**包名**是否出现在非 dev 闭包里判定的，因此某个仅
  开发期的**实例**可能因为同名包的另一个版本在生产闭包里而被判红；(b) 基线的键是
  `lockfile|package|id`——**不比较版本、也不比较严重级**，所以同一首要公告 ID 下的严重级上升
  不会被读成「新增」。
- `GHSA-83rm-6c8r-g728` 起初看起来自相矛盾：`/v1/vulns` 的 semver 范围从 `11.1.10` 起，而
  `/v1/query` 却对 `10.0.8` 返回该公告。2026-11-08 的澄清是：记录里另外用 `versions` 明确列出
  `9.14.5` 与 `10.0.8` 受影响；v9/v10 线已不再支持、不会修复。这不是本地扫描错误。详见 §1A。

### Reachability legend / 可达性图例

| Code | Meaning (EN) | 含义（中文） |
|---|---|---|
| **P** | Loaded in the deployed runtime artifact; the vulnerable sink is plausibly reachable. Production-reachable. | 已进入生产运行产物；漏洞 sink 有合理可达路径。**生产可触达**。 |
| **P\*** | Loaded at runtime, but the app is documented as a **preview** and is not wired to deployment. | 运行时可达，但该应用按文档是**预览版**，未接部署。 |
| **B** | Build/CI-time only: runs on the build machine, is not shipped in the deployed artifact. | **仅构建/CI 期**：跑在构建机，不进部署产物。 |
| **N** | Installed in the tree but not loaded, or the specific vulnerable sink is not exercised. | 已安装但**不被加载**，或具体漏洞 sink 未被调用。 |

---

## 1. The 39 entries / 39 条基线条目

Every row is one baseline entry. This table is the accepted triage record; the remediation already
executed on 2026-11-08 is recorded in §1A, and rows finished there should be read as done.
每一行就是一条基线条目。本表是已接受的 triage 记录；2026-11-08 已执行的整改记在 §1A，那里完成的
行应视为已完成。

| # | Lockfile | Package@version | Advisory | Sev | Reach | Decision | Reason (EN) | 理由（中文） | Owner | Expiry |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Front-Taro | `@vue/server-renderer@3.5.41` | GHSA-g2v6-rqmx-r4w6 | HIGH | N | FIX (patch) | SSR-only; the H5 client build uses `runtime-dom`, not the server renderer. Fix is 3.5.42. | 仅 SSR 用；H5 客户端构建走 `runtime-dom`，不加载 server renderer。修法是 3.5.42。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 2 | Front-Taro | `brace-expansion@1.1.18` | GHSA-6j4f-fj2g-mc7p | HIGH | B | ACCEPT | Only reached through `minimatch` ← eslint / scss-bundle / Taro CLI, all `dev:true`. Not shipped. | 只经 `minimatch` ← eslint / scss-bundle / Taro CLI 到达，链路全是 `dev:true`。不进产物。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 3 | Front-Taro | `brace-expansion@2.1.4` | GHSA-6j4f-fj2g-mc7p | HIGH | B | ACCEPT | Instance under `@tarojs/plugin-doctor` / `depcheck` has `dev:true`; build-only. | 该实例在 `@tarojs/plugin-doctor` / `depcheck` 下，`dev:true`；仅构建期。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 4 | Front-Taro | `brace-expansion@1.1.18` | GHSA-qhr7-859c-m2p7 | HIGH | B | ACCEPT | Same dev-only chain as #2. | 与 #2 同一条仅开发期链路。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 5 | Front-Taro | `brace-expansion@2.1.4` | GHSA-qhr7-859c-m2p7 | HIGH | B | ACCEPT | Same dev-only instance as #3. | 与 #3 同一个仅开发期实例。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 6 | Front-Taro | `decode-uri-component@0.2.2` | GHSA-qr28-fpjm-wq7f | HIGH | P | ACCEPT (user, until 2026-12-06) | Runtime path `query-string` ← `@tarojs/router` ← `@tarojs/plugin-platform-h5`; a crafted H5 URL can reach the quadratic DoS. **Fix blocked:** the fixed `0.5.1` is ESM-only while `query-string@7.1.3` is CJS and calls `require('decode-uri-component')` as a function. Accepted by the user on 2026-11-08 until a query-string/Taro upgrade. | 运行路径 `query-string` ← `@tarojs/router` ← `@tarojs/plugin-platform-h5`；构造的 H5 URL 可触发二次方 DoS。**修复受阻：** 修复版 `0.5.1` 是 ESM-only，而 `query-string@7.1.3` 是 CJS，把 `require('decode-uri-component')` 当函数调用。用户已于 2026-11-08 接受，至 query-string / Taro 升级为止。 | Front-Taro owner / Front-Taro 维护会话 | 2026-12-06 |
| 7 | Front-Taro | `glob@10.2.6` | GHSA-5j98-mcp5-4vw2 | HIGH | B | ACCEPT | Only the `dev:true` instance under `@tarojs/plugin-doctor` is affected; the production-closure `glob@7.2.3` is outside the advisory range (≥10.2.0). | 受影响的只是 `@tarojs/plugin-doctor` 下 `dev:true` 的实例；生产闭包里的 `glob@7.2.3` 不在公告范围（≥10.2.0）。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 8 | Front-Taro | `joi@17.13.4` | GHSA-4528-x5fx-h6hg | HIGH | B | FIX (patch) | Reached only via `@tarojs/service`, the Taro build service; validates build config, not shipped. Fix is 17.13.9. | 只经 `@tarojs/service`（Taro 构建服务）到达，校验构建配置，不进产物。修法是 17.13.9。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 9 | Front-Taro | `joi@17.13.4` | GHSA-6h2x-m376-mqjq | HIGH | B | FIX (patch) | Same build-service chain as #8. | 与 #8 同一条构建服务链路。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 10 | Front-Taro | `lodash-es@4.17.21` | GHSA-r5fr-rjxr-66jc | HIGH | N | FIX (minor) | Bundled via `@tarojs/runtime` / `taro-h5`, but the vulnerable sink is `_.template` with attacker-controlled key names; no `_.template` call exists in `Front-Taro/src`. Fix is 4.18.0. | 经 `@tarojs/runtime` / `taro-h5` 打包进来，但漏洞 sink 是 `_.template` 且需攻击者可控 key 名；`Front-Taro/src` 里没有 `_.template` 调用。修法是 4.18.0。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-22 |
| 11 | Front-Taro | `nanoid@3.3.17` | GHSA-2v37-7h3g-55p8 | HIGH | N | FIX (patch) | Runtime via `ics` ← `@tarojs/taro-h5`; the advisory needs a custom generator with `size=0`. `ics` calls `nanoid()` with no arguments, so the sink is not exercised. Fix is 3.3.18. | 经 `ics` ← `@tarojs/taro-h5` 运行时存在；公告需要自定义生成器且 `size=0`。`ics` 调用的是无参 `nanoid()`，sink 未被触发。修法是 3.3.18。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 12 | Front-Taro | `postcss@7.0.39` | GHSA-6g55-p6wh-862q | HIGH | B | ACCEPT | All `postcss@7.0.39` instances are `dev:true` (component-compiler-utils / autoprefixer / miniprogram-simulate); the production-closure `postcss@8.5.26` is above the fix line. | `postcss@7.0.39` 的所有实例都是 `dev:true`（component-compiler-utils / autoprefixer / miniprogram-simulate）；生产闭包里的 `postcss@8.5.26` 已在修复线之上。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 13 | Front-Taro | `postcss@7.0.39` | GHSA-r28c-9q8g-f849 | HIGH | B | ACCEPT | Same dev-only instances as #12. | 与 #12 同一批仅开发期实例。 | Front-Taro owner / Front-Taro 维护会话 | 2027-02-08 |
| 14 | Front-Taro | `source-map-js@1.2.1` | GHSA-68fv-2mgg-jv7q | HIGH | B | FIX (patch) | Used by Vue/Sass/PostCSS compilers to read build-time source maps; not in the runtime bundle. Fix is 1.2.2. | 供 Vue/Sass/PostCSS 编译器读取构建期 source map；不在运行时包里。修法是 1.2.2。 | Front-Taro owner / Front-Taro 维护会话 | 2026-11-15 |
| 15 | Front-Taro | `swiper@6.8.0` | GHSA-hmx5-qpq5-p643 | **CRITICAL** | P | ACCEPT (user, until 2026-12-06) | The only CRITICAL. **Reachability corrected:** the built H5 bundle `dist/js/683.js` (part of the `app` entrypoint) contains the full `taro-swiper-core` implementation and swiper code, even though no app source imports `@tarojs/components` or renders a swiper. The sink still needs the swiper component to be constructed with crafted input, which the app never does. A direct override to `12.1.2` is incompatible: swiper 12 removed `swiper/swiper-bundle.esm.js`, the exact path Taro 3.6.36 imports. Accepted by the user on 2026-11-08 until a Taro upgrade. | 唯一 CRITICAL。**可达性已更正：** 构建后的 H5 包 `dist/js/683.js`（属于 `app` 入口）含完整的 `taro-swiper-core` 实现与 swiper 代码，尽管没有 app 源码 import `@tarojs/components` 或渲染 swiper。sink 仍需用构造输入实例化 swiper 组件，本应用从不这么做。直接 override 到 `12.1.2` 不可行：swiper 12 删掉了 `swiper/swiper-bundle.esm.js`，正是 Taro 3.6.36 import 的路径。用户已于 2026-11-08 接受，至 Taro 升级为止。 | Front-Taro owner / Front-Taro 维护会话 | 2026-12-06 |
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
| 26 | Web-Admin-Vue | `@intlify/core-base@10.0.8` | GHSA-83rm-6c8r-g728 | HIGH | P | FIXED (2026-11-08, vue-i18n 11.4.18) | **Confirmed affected, then fixed.** The advisory explicitly lists `10.0.8` (the last v10 release) as affected; its Patches section says v9/v10 will not be fixed. The installed 10.0.8 contained `sanitizeTranslatedHtml` and no `srcdoc` handling. App-level reachability was absent (`escapeParameter` off, static messages, no `v-html`), but the package was upgraded to vue-i18n 11.4.18 / @intlify 11.4.18 anyway. | **已确认受影响，随后修复。** 公告明确把 `10.0.8`（v10 最后一个版本）列为受影响，并在 Patches 里写明 v9/v10 不再修。安装的 10.0.8 含 `sanitizeTranslatedHtml`，但不处理 `srcdoc`。应用层原本不可达（未启用 `escapeParameter`、静态消息、无 `v-html`），但仍升级到 vue-i18n 11.4.18 / @intlify 11.4.18。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-22 |
| 27 | Web-Admin-Vue | `@intlify/shared@10.0.8` | GHSA-83rm-6c8r-g728 | HIGH | P | FIXED (2026-11-08, @intlify 11.4.18) | Same confirmed advisory as #26; fixed with the same upgrade. | 与 #26 同一已确认公告；随同一次升级修复。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-22 |
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
| 39 | Web-Admin-Vue | `vue-i18n@10.0.8` | GHSA-83rm-6c8r-g728 | HIGH | P | FIXED (2026-11-08, vue-i18n 11.4.18) | Same confirmed advisory as #26/#27; v10 was affected and would not be fixed; upgraded to 11.4.18. | 与 #26/#27 同一已确认公告；v10 受影响且不会修；已升级到 11.4.18。 | Web-Admin-Vue owner / Web-Admin-Vue 维护会话 | 2026-11-22 |

---

## 1A. Remediation executed (2026-11-08) / 已执行整改（2026-11-08）

English:

The fixes below were applied and verified; the baseline was pruned from 39 to 9 entries through the
gate's own `--update-baseline` path (30 entries no longer fire, 0 new). Nothing that still fires was
removed.

| App | Change | Verification |
|---|---|---|
| Web-Admin-Vue | `axios` ^1.20.0 → resolved 1.21.0; overrides `follow-redirects` 1.16.2, `source-map-js` 1.2.2 | typecheck 0; 554 tests passed / 8 skipped; build ok |
| Web-Admin-Vue (i18n) | `vue-i18n` ^11.4.14 → resolved 11.4.18 (`@intlify/*` 11.4.18) | typecheck 0; 554 tests passed / 8 skipped; build ok |
| Web-Admin-React | `axios` ^1.20.0 → resolved 1.21.0; override `follow-redirects` 1.16.2 | typecheck 0; 47 tests passed; build ok |
| Front-Taro | `vue` ^3.5.42 → resolved 3.5.45 (pulls `@vue/server-renderer` 3.5.45); overrides `joi` 17.13.9, `nanoid` 3.3.18, `lodash-es` 4.18.1, `source-map-js` 1.2.2 | build:h5 ok; test:i18n 6, test:env 3, test:race 5 |

Gate rerun on the updated lockfiles: **9 known / 0 new / 0 stale**, exit 0.

Remaining 9: `brace-expansion` ×4, `glob@10.2.6` ×1, `postcss@7.0.39` ×2 (all build-only);
`decode-uri-component@0.2.2` ×1 and `swiper@6.8.0` ×1 (Front-Taro).

Two rows deviate from the accepted table:

1. **Row 6, `decode-uri-component` — not fixed.** The fixed version `0.5.1` is ESM-only
   (`type: module`), while the consumer `query-string@7.1.3` is CJS and does
   `const decodeComponent = require('decode-uri-component')`, then calls it as a function. Forcing
   0.5.1 would hand it a namespace object, not the function. Accepted disposition: ACCEPT until
   2026-12-06, with a query-string/Taro upgrade evaluation.
2. **Row 15, `swiper` — reachability corrected from N to P.** The built H5 bundle
   (`Front-Taro/dist/js/683.js`, part of the `app` entrypoint) contains the full
   `taro-swiper-core` implementation and swiper code, even though no app source imports
   `@tarojs/components` or renders a swiper. The vulnerable code is therefore loaded in production;
   the sink still needs the swiper component to be constructed with crafted input, which this app
   never does. A direct override to `12.1.2` is incompatible: swiper 12 removed
   `swiper/swiper-bundle.esm.js`, the exact path Taro 3.6.36 imports. Accepted disposition: ACCEPT
   until a Taro upgrade, expiry 2026-12-06 — the user accepted this CRITICAL on 2026-11-08.

Decision recorded (2026-11-08): the user accepted both blocked rows (6 and 15) until 2026-12-06.
The three `vue-i18n` entries were confirmed affected and then fixed by the v11 upgrade.

Upstream clarification (2026-11-08, done): GHSA-83rm is **not** an OSV inconsistency. Its
machine-readable record explicitly lists `9.14.5` and `10.0.8` as affected (`versions`, not a semver
range); the semver range `11.1.10–11.4.14` covers only the v11 line, which is why an earlier
range-only read looked contradictory. The advisory's Patches section says v9 and v10 are unsupported
and **will not be fixed**. The installed 10.0.8 contains `sanitizeTranslatedHtml` and has no `srcdoc`
handling, matching the description. Web-Admin-Vue does not enable the vulnerable configuration
(`escapeParameter` absent, static `zh/en` messages, no `v-html`), so the package was affected but the
app path is not reachable. Disposition (2026-11-08): the user chose the upgrade; vue-i18n 11.4.18 is
installed and the three entries no longer fire.

中文：

下面的修复已落地并验证；基线用门禁自带的 `--update-baseline` 从 39 条剪到 9 条（30 条不再触发，
0 条新增）。仍然触发的条目一条都没删。

| 应用 | 改动 | 验证 |
|---|---|---|
| Web-Admin-Vue | `axios` ^1.20.0 → 解析 1.21.0；overrides `follow-redirects` 1.16.2、`source-map-js` 1.2.2 | typecheck 0；554 测试通过 / 8 跳过；构建通过 |
| Web-Admin-Vue (i18n) | `vue-i18n` ^11.4.14 → 解析 11.4.18（`@intlify/*` 11.4.18） | typecheck 0；554 测试通过 / 8 跳过；构建通过 |
| Web-Admin-React | `axios` ^1.20.0 → 解析 1.21.0；override `follow-redirects` 1.16.2 | typecheck 0；47 测试通过；构建通过 |
| Front-Taro | `vue` ^3.5.42 → 解析 3.5.45（带出 `@vue/server-renderer` 3.5.45）；overrides `joi` 17.13.9、`nanoid` 3.3.18、`lodash-es` 4.18.1、`source-map-js` 1.2.2 | build:h5 通过；test:i18n 6、test:env 3、test:race 5 |

用更新后的锁文件复跑门禁：**9 条已知 / 0 条新增 / 0 条陈旧**，exit 0。

剩余 9 条：`brace-expansion` ×4、`glob@10.2.6` ×1、`postcss@7.0.39` ×2（均仅构建期）；
`decode-uri-component@0.2.2` ×1 与 `swiper@6.8.0` ×1（Front-Taro）。

有两行偏离了已接受的表：

1. **第 6 行 `decode-uri-component` —— 未修。** 修复版 `0.5.1` 是 ESM-only（`type: module`），
   而消费方 `query-string@7.1.3` 是 CJS，写的是
   `const decodeComponent = require('decode-uri-component')`，随后当函数调用。强塞 0.5.1 会拿到
   命名空间对象而不是函数。已接受处置：ACCEPT 至 2026-12-06，同时评估 query-string / Taro 升级。
2. **第 15 行 `swiper` —— 可达性由 N 更正为 P。** 构建后的 H5 包
   （`Front-Taro/dist/js/683.js`，属于 `app` 入口）里含完整的 `taro-swiper-core` 实现与 swiper
   代码，尽管没有任何 app 源码 import `@tarojs/components` 或渲染 swiper。所以漏洞代码在生产中
   是加载的；sink 仍需用构造输入实例化 swiper 组件，而本应用从不这么做。直接 override 到 `12.1.2`
   不可行：swiper 12 删掉了 `swiper/swiper-bundle.esm.js`，正是 Taro 3.6.36 import 的路径。
   已接受处置：ACCEPT 至 Taro 升级，到期 2026-12-06——用户已于 2026-11-08 接受这条 CRITICAL。

决定记录（2026-11-08）：用户接受两条受阻项（第 6、15 行）至 2026-12-06。三条 vue-i18n 条目
已确认受影响，随后通过 v11 升级修复。

上游澄清（2026-11-08，已完成）：GHSA-83rm **不是** OSV 数据不一致。它的机器可读记录用 `versions`
（不是 semver 范围）明确列出 `9.14.5` 与 `10.0.8` 受影响；semver 范围 `11.1.10–11.4.14` 只覆盖
v11 线，所以早先只看范围会显得矛盾。公告的 Patches 一节写明 v9/v10 已不再支持、**不会修**。安装的
10.0.8 含 `sanitizeTranslatedHtml`，且不处理 `srcdoc`，与描述一致。Web-Admin-Vue 未启用漏洞配置
（没有 `escapeParameter`、消息是静态 `zh/en`、没有 `v-html`），所以包受影响、但应用路径不可达。
处置（2026-11-08）：用户选择升级；已安装 vue-i18n 11.4.18，三条条目不再触发。

---

## 2. What this triage cannot decide / 本次 triage 判断不了的部分

English:

Post-remediation status: item 1 is **resolved** — the H5 bundle was built and checked (swiper is in
it), and the row was corrected to P; item 2 (vue-i18n upstream) is now **resolved** (see §1A); item 3
is **moot** because the React entries are fixed; items 4 and 6 are **moot** for the same reason; item
5 (decode-uri exploitability) remains **open**.

1. **The CRITICAL (swiper) was not proven out of the shipped bundle.** Source evidence is strong
   (`Front-Taro/src` never imports `@tarojs/components`; `swiper` is required only inside the Stencil
   lazy chunk `taro-swiper-core_2.entry.js`), but I did **not** build `Front-Taro` and grep the
   output. Missing: a built H5 bundle. If `swiper-bundle` is in it, #15 becomes P and must be fixed
   or accepted with a major-version plan.
2. **vue-i18n family — resolved (2026-11-08).** The advisory explicitly lists 9.14.5 and 10.0.8 as
   affected; v9/v10 will not be fixed; the installed 10.0.8 code matches. The app does not enable the
   vulnerable configuration. Fixed by upgrading to vue-i18n 11.4.18 on 2026-11-08.
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

整改后的状态：第 1 条**已解决**——H5 包已构建并检查（swiper 在包里），该行已更正为 P；第 2 条
（vue-i18n 上游）现已**解决**（见 §1A）；第 3 条**已失效**，因为 React 的条目已修复；第 4、6 条
同样**已失效**；第 5 条（decode-uri 可利用性）仍然**未决**。

1. **CRITICAL（swiper）当时尚未被证明不在发布包里。** 源码证据较强（`Front-Taro/src` 从不 import
   `@tarojs/components`；`swiper` 只在 Stencil 懒加载 chunk `taro-swiper-core_2.entry.js` 里被
   require），但我**没有**构建 `Front-Taro` 再 grep 产物。缺：一份构建后的 H5 包。若
   `swiper-bundle` 在产物里，#15 就变成 P，必须修或带大版本计划接受。
2. **vue-i18n 一族 —— 已解决（2026-11-08）。** 公告明确列出 9.14.5 与 10.0.8 受影响；v9/v10 不再
   修复；安装的 10.0.8 代码与描述一致。应用未启用漏洞配置。已在 2026-11-08 升级到 vue-i18n
   11.4.18 修复。
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

- **The gate itself is healthy and should stay merged.** After remediation it is green on the updated
  tree (9 known / 0 new / 0 stale), fails closed on "unverified", and its self-test proves red /
  green / 未核. There is no reason to revert it.
- **Remediation landed.** 30 of the 39 entries were fixed and pruned by the gate's own
  `--update-baseline` path. The baseline is now 9 entries: 7 build-only (`brace-expansion` ×4,
  `glob` ×1, `postcss` ×2, accepted until 2027-02-08), 1 `decode-uri-component` (P, fix blocked by an
  ESM-only upstream fix; accepted until 2026-12-06), and 1 `swiper` (P, CRITICAL, fix blocked by
  Taro's pin; accepted until 2026-12-06).
- **Acceptance criterion.** "Every entry triaged" is satisfied. "No unaccepted production
  high/critical" is now **satisfied**: every production high/critical is either fixed (30 entries,
  including the vue-i18n family on 2026-11-08) or explicitly accepted with an owner and expiry.
  Nothing was marked fixed without a build/test/scan verification.
- **Still open:** by 2026-12-06, fix or re-accept the two blocked entries — evaluate a
  query-string/Taro upgrade for `decode-uri-component` and a Taro upgrade for `swiper`. The React
  preview's production status is no longer blocking: its 10 entries are fixed.

中文：

- **门禁本身是健康的，应继续保持合并。** 整改后它在更新过的树上为绿（9 条已知 / 0 条新增 /
  0 条陈旧），在「未核」时 fail-closed，自测也证明了红 / 绿 / 未核三种行为。没有理由回退它。
- **整改已落地。** 39 条里有 30 条修复并用门禁自带的 `--update-baseline` 剪掉。基线现在 9 条：
  7 条仅构建期（`brace-expansion` ×4、`glob` ×1、`postcss` ×2，接受到 2027-02-08）、1 条
  `decode-uri-component`（P，修复受 ESM-only 上游阻塞；接受到 2026-12-06）、1 条 `swiper`（P，
  CRITICAL，修复受 Taro 钉版阻塞；接受到 2026-12-06）。
- **验收口径。** 「每条都已 triage」已成立。「生产高/严重无未接受项」现已**成立**：每条生产
  高/严重都已修复（30 条，含 2026-11-08 修复的 vue-i18n 一族），或带责任人与到期被明确接受。
  没有任何一条是没经过构建/测试/扫描验证就标成已修复的。
- **仍然未决：** 到 2026-12-06 前，修复或重新接受那两条受阻项——评估 `decode-uri-component` 的
  query-string / Taro 升级与 `swiper` 的 Taro 升级。React 预览版的生产范围已不再阻塞：它的 10 条
  已修复。

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

Expected after remediation (2026-11-08): `9 known, 0 new`, `0 baseline entries no longer fire`, exit 0.
整改后的预期（2026-11-08）：`9 known, 0 new`、没有陈旧条目、exit 0。
