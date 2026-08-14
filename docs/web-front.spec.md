# 企业应用 Web 端（WEB-FRONT）— 多角色骨架 / Enterprise Web Frontend (WEB-FRONT) — Multi-Role Skeleton

> 范围：WEB-FRONT-1（多角色身份骨架）。完整路线见私有 roadmap WEB-FRONT 章节。
> Scope: WEB-FRONT-1 (multi-role identity skeleton). Full roadmap lives in the private WEB-FRONT chapter.

## 1. 定位 / Positioning

Web-Admin-Vue 从「纯管理员台」进化为「**同一壳、两套导航**」的企业应用宿主——普通企业用户登录后进**工作台**（应用侧），管理员进**控制台**（管理侧），共享 AdminLayout / 组件库 / API 客户端。**不新建第三个前端**。

Web-Admin-Vue evolves from a pure admin console into an **enterprise application host with "one shell, two navigation sets"** — regular enterprise users land on the **workbench** (application side) after login, admins land on the **console** (management side), sharing the AdminLayout / component library / API client. **No third frontend is created.**

## 2. 范围 / Scope

**本次（WEB-FRONT-1）**：拆 auth store admin 硬编码；路由守卫按角色分流；AdminLayout 两套导航；最小工作台落地页；vitest 测试基线；登录页/i18n 适配；接线 401 刷新失败登出。

**This round (WEB-FRONT-1)**: remove the admin hardcode in the auth store; role-based route guard; two navigation sets in AdminLayout; minimal workbench landing page; vitest baseline; login page/i18n adaptation; wire 401-refresh-failure logout.

**不做 / Not in scope**：后端改动（零改动可工作）；第三角色 enum（随 ORG-1）；工作台丰富页面（WEB-FRONT-3）；MFA/SSO（WEB-FRONT-4）；CI 纳入 test（WEB-FRONT-6）。
**Backend changes (none needed — zero change works)**; third role enum value (with ORG-1); rich workbench pages (WEB-FRONT-3); MFA/SSO (WEB-FRONT-4); wiring tests into CI (WEB-FRONT-6).

## 3. 路由设计 / Routing

meta 新增 `roles?: string[]`（缺省 = 任意已登录角色）。控制台 20 页抽为 `consoleChildren` 常量并在模块加载时批量打标 `roles:['admin']`；工作台为 `/` 下 pathless 包装（`roles:['user']`，父 meta 自动合并进 `to.meta`，WEB-FRONT-3 子页挂此继承）。

A new `roles?: string[]` meta field (default = any authenticated role). The 20 console pages are extracted into a `consoleChildren` constant batch-marked `roles:['admin']` at module load; the workbench is a pathless wrapper under `/` (`roles:['user']`, parent meta auto-merges into `to.meta`, WEB-FRONT-3 sub-pages inherit it).

| 路径 / Path | 角色 / Roles | 说明 / Notes |
|------------|-------------|--------------|
| /login、/403 | 公开 | 登录 / 403 页 |
| /（dashboard 及全部管理页） | admin | 控制台 |
| /workbench | user | 工作台（落地页 workbench-home） |
| /:pathMatch(.*)* | — | catch-all → / |

## 4. 鉴权流 / Auth Flow

**auth store**：删两处 `role !== 'admin'` 硬编码与 `'forbidden'` 状态；新增 `isAdmin` getter。`AuthStatus = initial | loading | authenticated | unauthenticated`。
**Auth store**: removed the two `role !== 'admin'` hardcodes and the `'forbidden'` status; added an `isAdmin` getter.

**路由守卫**（`homeFor(role)` = admin→`/`，其余→`/workbench`）：公开页仅 `/login` 在已登录时按角色回首页；无 token 带 `redirect` query 回登录页；有 token 未加载则 `tryAutoLogin`；`to.meta.roles` 不匹配当前角色 → 弹回角色首页。
**Route guard**: public pages pass through (only `/login` redirects an authenticated user to their role home); no token → `/login` with `redirect` query; token without loaded user → `tryAutoLogin`; `to.meta.roles` mismatch → redirect to the role home.

**防循环论证**：每条非 public 路由要么 admin-only 要么 user-only，各角色唯一合法首页，重定向必匹配、无互踢。
**Anti-loop**: every non-public route is either admin-only or user-only; each role has a unique legal home, so redirects always match and never ping-pong.

## 5. 布局与导航 / Layout & Navigation

AdminLayout 复用同一壳：`navGroups` computed 按 `auth.isAdmin` 返回**控制台 3 组**或**工作台 1 组**；dashboard 独立项 `v-if="isAdmin"`。面包屑 / 用户卡 / 登出不变。
AdminLayout reuses the same shell: the `navGroups` computed returns the **console 3 groups** or the **workbench 1 group** based on `auth.isAdmin`; the standalone dashboard item is `v-if="isAdmin"`. Breadcrumbs / user card / logout unchanged.

## 6. 工作台落地页 / Workbench Landing

`src/views/workbench/WorkbenchHomeView.vue`：直接读 `auth.user`（守卫已加载），PageHeader + 4 张 StatCard（username/nickname/email/role）+ 3 张占位卡（我的事件/待办/通知，标注 WEB-FRONT-3）。
Reads `auth.user` directly (loaded by the guard); PageHeader + 4 StatCards (username/nickname/email/role) + 3 placeholder cards (my events/todos/notifications, marked WEB-FRONT-3).

## 7. 前端测试 / Frontend Testing

最小 vitest 基线（此前 0 测试）：`vitest` + `@vue/test-utils` + `jsdom`，store 测试用 `vi.mock('@/api/auth')` + `createPinia`；守卫测试用 `createRouter` + `createMemoryHistory`（动态 import 组件不挂载，无需 Vuetify）。11 用例覆盖：login/tryAutoLogin 各角色分支、守卫分流与防循环、匿名跳转。
Minimal vitest baseline (previously 0 tests): store tests mock `@/api/auth` with `createPinia`; guard tests use `createRouter` + `createMemoryHistory` (lazy components never mount, no Vuetify needed). 11 cases cover login/tryAutoLogin role branches, guard routing, and anonymous redirect.

## 8. i18n

删除 `noAdminRole`；`loginTitle` 改「登录」；新增 `navWorkbench` 及工作台文案组（zh/en 对称）。
Removed `noAdminRole`; `loginTitle` changed to "Login"; added `navWorkbench` and the workbench copy group (zh/en mirrored).

## 9. 文件清单 / File Checklist

**新建 / New**：`docs/web-front.spec.md`；`Web-Admin-Vue/src/views/workbench/WorkbenchHomeView.vue`；`vitest.config.ts`；`src/test/setup.ts`；`src/stores/__tests__/auth.spec.ts`；`src/router/__tests__/guards.spec.ts`
**修改 / Modified**：`src/stores/auth.ts`；`src/router/routes.ts`；`src/router/guards.ts`；`src/layouts/AdminLayout.vue`；`src/views/login/LoginView.vue`；`src/i18n/zh.ts`+`en.ts`；`src/main.ts`（接线 setOnAuthFailure）；`package.json`（test script + devDeps）

## 10. 验证 / Verification

`npm run typecheck` / `npm run build` / `npm test`；手工：admin→控制台、alex（user）→工作台、手敲 `/users` 弹回工作台、已登录访问 /login 回各自首页、刷新后角色保持。后端零改动。
typecheck / build / test; manually: admin→console, alex (user)→workbench, typing `/users` bounces to workbench, authenticated /login redirects to the role home, refresh keeps role. Backend unchanged.

## 11. 后续演进 / Next Steps

- WEB-FRONT-2 前端 RBAC（v-permission + 角色/权限点管理页）；WEB-FRONT-3 工作台丰富页面（我的事件/待办/通知，复用 user-scoped API）；WEB-FRONT-5 普通用户业务 API 面（联动 ORG）；WEB-FRONT-6 CI 纳入 lint/test
- ORG-1 落地时第三角色 enum 进 `UserRole`（varchar 列免迁移，CASL else 分支自动覆盖）
- 工作台写操作受 EmailVerificationGuard 约束（未验证 403），WEB-FRONT-3 需在管理端提供验证流程入口
- WEB-FRONT-2 frontend RBAC (v-permission + role/permission-point admin); WEB-FRONT-3 rich workbench pages (reuse user-scoped APIs); WEB-FRONT-5 regular-user business API surface (ties into ORG); WEB-FRONT-6 CI lint/test
- When ORG-1 lands, the third role enum joins `UserRole` (varchar column avoids migration; CASL else-branch covers it automatically)
- Workbench writes are constrained by EmailVerificationGuard (unverified → 403); WEB-FRONT-3 needs a verification entry in the console
