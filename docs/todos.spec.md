# 待办清单功能 — 基座验证样例 / Todo List Feature — Base Platform Validation Sample

## 1. 定位 / Positioning

待办清单是**基座平台可复用性验证**：用一个真实业务完整走一遍基座前后端流程，验证新增一个 CRUD 功能模块的成本与复用点。同时补齐前端 demo 态体验。

The todo list is a **base-platform reusability validation**: it runs a real business through the entire base frontend/backend flow to verify the cost and reuse points of adding a CRUD feature module. It also fills in the frontend demo-state experience.

## 2. 复用能力清单（基座验证结论）/ Reusability Checklist (Base Validation Conclusion)

| 基座能力 / Base Capability | 待办如何复用 / How Todos Reuse It |
|----------|-------------|
| events CRUD 模块样板 | todos 模块完全仿照（entity/module/controller/service/dto 四件套）/ The todos module fully follows it (entity/module/controller/service/dto four-piece set) |
| CASL 所有权 | `can('manage','Todo',{userId:sub})` + `@CurrentAbility`（同 events）/ `can('manage','Todo',{userId:sub})` + `@CurrentAbility` (same as events) |
| EmailVerificationGuard | 自动生效——未验证邮箱用户建待办 403（写操作安全）/ Takes effect automatically — users with unverified email get 403 when creating todos (write-operation safety) |
| 迁移体系 | `migration:generate` 生成 AddTodos / `migration:generate` produces AddTodos |
| 前端 feature 模式 | data/{model,repository} + presentation/{provider,page}（同 events）/ data/{model,repository} + presentation/{provider,page} (same as events) |
| Shell 分支扩展 | app_shell 第 5 tab + router StatefulShellBranch / app_shell 5th tab + router StatefulShellBranch |
| i18n | 单文件分区加键 / Add keys in a single-file section |
| resolveUrl | upload 图片预览复用 / Reused for upload image preview |

**结论**：新增 CRUD 模块约 10 文件（后端 6 + 前端 4），全走基座既定模式，无样板外代码。

**Conclusion**: adding a CRUD module takes about 10 files (backend 6 + frontend 4), all following the base platform's established patterns, with no code beyond the boilerplate.

## 3. 数据模型 / Data Model

`todos` 表：id / title(200) / description? / completed(bool default false) / dueDate?(datetime) / userId + @Index(['userId','completed'])。

The `todos` table: id / title(200) / description? / completed(bool default false) / dueDate?(datetime) / userId + @Index(['userId','completed']).

## 4. API

| Method | Path | Auth | 说明 / Description |
|--------|------|------|------|
| POST | /api/v1/todos | 登录 | 创建待办 / Create a todo |
| GET | /api/v1/todos | 登录 | 我的待办列表（completed 升序 + createdAt 降序）/ My todo list (completed ascending + createdAt descending) |
| PATCH | /api/v1/todos/:id | 登录 + CASL | 更新待办 / Update a todo |
| PATCH | /api/v1/todos/:id/complete | 登录 + CASL | 切换完成状态 / Toggle completion status |
| DELETE | /api/v1/todos/:id | 登录 + CASL | 删除待办 / Delete a todo |

写操作受 EmailVerificationGuard 约束（未验证 403）。

Write operations are constrained by EmailVerificationGuard (unverified users get 403).

## 5. 前端 / Frontend

- **第五底部 Tab「待办」**：app_shell 加 branch（`_branchToTab` 更新为 `branch<2 ? branch : branch+2`）+ router 加 `/todos` StatefulShellBranch
  **Fifth bottom Tab "Todos"**: app_shell adds a branch (`_branchToTab` updated to `branch<2 ? branch : branch+2`) + the router adds a `/todos` StatefulShellBranch
- TodosPage：新增输入 + 列表（勾选完成/删除确认）+ 空状态
  TodosPage: add input + list (check complete / delete confirmation) + empty state
- explore 页加「待办」入口（context.go 切 tab）
  The explore page adds a "Todos" entry (context.go switches tab)

## 6. 前端体验补齐（同轮）/ Frontend Experience Completion (Same Round)

- **upload 图片预览**：成功态图片 mime 时 `Image.network(resolveUrl(url))`
  **upload image preview**: when the success-state mime is an image, `Image.network(resolveUrl(url))`
- **dashboard 头像**：avatarUrl 非空 → NetworkImage（复用 profile 模式）
  **dashboard avatar**: when avatarUrl is non-empty → NetworkImage (reuses the profile pattern)
- **explore 入口**：待办
  **explore entry**: Todos

## 7. 测试 / Tests

- 后端：todos.service.spec 7 用例（CRUD + CASL 所有权）+ e2e 3 用例（CRUD + 未验证 403 + 他人 403）
  Backend: todos.service.spec 7 cases (CRUD + CASL ownership) + e2e 3 cases (CRUD + unverified 403 + others 403)
- 前端：todos_provider_test 6 用例（load/add/toggle/remove）
  Frontend: todos_provider_test 6 cases (load/add/toggle/remove)
