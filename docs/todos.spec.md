# 待办清单功能 — 基座验证样例

## 1. 定位

待办清单是**基座平台可复用性验证**：用一个真实业务完整走一遍基座前后端流程，验证新增一个 CRUD 功能模块的成本与复用点。同时补齐前端 demo 态体验。

## 2. 复用能力清单（基座验证结论）

| 基座能力 | 待办如何复用 |
|----------|-------------|
| events CRUD 模块样板 | todos 模块完全仿照（entity/module/controller/service/dto 四件套） |
| CASL 所有权 | `can('manage','Todo',{userId:sub})` + `@CurrentAbility`（同 events） |
| EmailVerificationGuard | 自动生效——未验证邮箱用户建待办 403（写操作安全） |
| 迁移体系 | `migration:generate` 生成 AddTodos |
| 前端 feature 模式 | data/{model,repository} + presentation/{provider,page}（同 events） |
| Shell 分支扩展 | app_shell 第 5 tab + router StatefulShellBranch |
| i18n | 单文件分区加键 |
| resolveUrl | upload 图片预览复用 |

**结论**：新增 CRUD 模块约 10 文件（后端 6 + 前端 4），全走基座既定模式，无样板外代码。

## 3. 数据模型

`todos` 表：id / title(200) / description? / completed(bool default false) / dueDate?(datetime) / userId + @Index(['userId','completed'])。

## 4. API

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | /api/v1/todos | 登录 | 创建待办 |
| GET | /api/v1/todos | 登录 | 我的待办列表（completed 升序 + createdAt 降序） |
| PATCH | /api/v1/todos/:id | 登录 + CASL | 更新待办 |
| PATCH | /api/v1/todos/:id/complete | 登录 + CASL | 切换完成状态 |
| DELETE | /api/v1/todos/:id | 登录 + CASL | 删除待办 |

写操作受 EmailVerificationGuard 约束（未验证 403）。

## 5. 前端

- **第五底部 Tab「待办」**：app_shell 加 branch（`_branchToTab` 更新为 `branch<2 ? branch : branch+2`）+ router 加 `/todos` StatefulShellBranch
- TodosPage：新增输入 + 列表（勾选完成/删除确认）+ 空状态
- explore 页加「待办」入口（context.go 切 tab）

## 6. 前端体验补齐（同轮）

- **upload 图片预览**：成功态图片 mime 时 `Image.network(resolveUrl(url))`
- **dashboard 头像**：avatarUrl 非空 → NetworkImage（复用 profile 模式）
- **explore 入口**：待办

## 7. 测试

- 后端：todos.service.spec 7 用例（CRUD + CASL 所有权）+ e2e 3 用例（CRUD + 未验证 403 + 他人 403）
- 前端：todos_provider_test 6 用例（load/add/toggle/remove）
