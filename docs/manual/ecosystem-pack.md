# 生态包组装（Phase 2：官方按第三方方式构建）

> 依据 development-plan §7.1 Phase 2：**官方按第三方的方式**构建三旗舰生态包（CRM Template + Customer Risk/Follow-up Skill；Project Template + Deadline Risk Skill；Approval Template + Policy Review Skill）。若官方无法主要靠这套机制构建 → 说明 Extension API 未成熟，优先修补。
> 本文档记录四件套组装机制 + 三旗舰包清单 + Extension API 成熟度评估。

---

## 一、四件套组装机制（第三方可复用的全部入口）

| 机制 | 现状 | 第三方怎么用 |
|---|---|---|
| **模板市场**（P1-9） | 三旗舰模板 `crm-demo`/`pm-demo`/`approval-demo` + 通用模板，管理台一键导入 | 管理台「模板市场」一键导入，或 `POST /admin/templates/:id/import` |
| **业务 Skill**（AGENTS 层） | 三旗舰业务 Skill：`crm-customer-risk` / `pm-deadline-risk` / `approval-policy-review`（从 `src/` 拆出的业务规则） | 复制 `.claude/skills/<name>/SKILL.md` 即可复用 AI 业务规则 |
| **插件 CLI**（P1-7） | `keelbase-plugin.mjs add/remove/list`（复制 TS + 接线 PLUGINS 数组） | `node scripts/keelbase-plugin.mjs add my-plugin.ts` 即可注册插件（测试通过）|
| **生成器**（EASY-2/7） | `keelbase init --spec specs/xxx.json` 生成模块 + AI 工具 | 从协议 JSON 一键生成新业务模块 |

## 二、三旗舰生态包清单

| 旗舰包 | 模板 | 业务 Skill | 插件/工具 | 协议 |
|---|---|---|---|---|
| **AI CRM** | `crm-demo`（客户/订单/任务/风险 seed）| `crm-customer-risk`（风险打分 + 分级）| query_customers/analyze_customer_risk/create_followup_task | `specs/customer.json` |
| **AI Project** | `pm-demo`（项目/任务/风险 seed）| `pm-deadline-risk`（延期打分 + 分级）| query_projects/analyze_project_risk/create_project_task | `specs/project.json` |
| **AI Approval** | `approval-demo`（政策/请求 seed）| `approval-policy-review`（政策分级预审）| query_approval_requests/review_approval_request/decide | `specs/approval-request.json` |

**第三方组装一个旗舰包的完整路径（以 AI CRM 为例）**：

```bash
# 1. 模板：管理台导入，或 API
curl -X POST /api/v1/admin/templates/crm-demo/import -H "Authorization: Bearer <admin>"

# 2. 协议 → 生成新模块（复用旗舰协议或自建）
node scripts/keelbase-init.mjs --spec specs/customer.json --label 我的客户

# 3. 插件：注册自研扩展
node scripts/keelbase-plugin.mjs add my-crm-integration.ts

# 4. Skill：复用旗舰业务规则（复制 .claude/skills/crm-customer-risk/）
```

## 三、Extension API 成熟度评估

| 环节 | 成熟度 | 缺口（需补的 Extension API） |
|---|---|---|
| 模板机制 | ★★★☆ | 模板 = 种子数据（事件/待办/旗舰实体）；**缺「模板 = 代码包」**（安装带后端实体+工具的模板）——Phase 2 最大缺口 |
| 业务 Skill | ★★★☆ | Skill = 文档规则（AGENTS 消费）；**缺「Skill = 可执行包」**（含自动接线/校验） |
| 插件 CLI | ★★★★ | add/list/remove/verify 通；**`verify` 已补齐（2026-08-18，a9c54d6 + 后续增强）**——宿主外独立校验（约定/结构/requires 对照宿主服务类名/featureFlag 对照 FEATURE_KEYS + 宿主相对导入可移植性警告）；**作者化自包含模式**：manifest 的 `PluginManifest` 注解可省略（verify 只做结构校验）、不 import 宿主相对路径即可移植。剩余**缺插件市场/Registry + 依赖版本解析**（P1-7 记录）+ **ESM/CJS 域**——宿主内插件源文件位于 `Server-NestJS/`（CJS），作者在 ESM 目录（根 `scripts/` 等 `"type":"module"` 目录）编写的源文件需确保无 ESM-only 语法 |
| 生成器 | ★★★★ | 协议 → 模块 + AI 工具已通；增量生成（P1-3）待续 |

**结论**：三旗舰的**素材**（模板/Skill/协议）已能从旗舰自然拆分，官方可用四件套组装演示；但「模板/Skill 作为可安装代码包」的抽象未成熟——这是 Phase 2 验证发现的 **Extension API 修补方向**（v1.0 后）。

## 四、验证记录

- `keelbase-plugin.test.mjs` 3 用例通过（add/list/remove 接线）——第三方装插件路径通。
- **approval-intake 示例插件真实 CLI 闭环（2026-08-18）**：源文件 `Server-NestJS/scripts/examples/approval-intake.plugin.ts`（自包含 manifest，`requires: ['ApprovalService']` + `featureFlag: 'approval'`，注册只读端点 `/plugins/approval-intake/precheck`，演示 getService 探测 ApprovalService + isFeatureEnabled）。命令序列：
  ```bash
  # 1. 安装（复制 + 接线 PLUGINS）
  node scripts/keelbase-plugin.mjs add Server-NestJS/scripts/examples/approval-intake.plugin.ts
  node scripts/keelbase-plugin.mjs list            # → HELLO_PLUGIN, APPROVAL_INTAKE_PLUGIN
  # 2. 构建（编译进 dist/plugins/plugins/）
  cd Server-NestJS && npm run build
  # 3. 路由验证（新增 plugins.integration.spec.ts 4 用例；全插件套件 15/15 绿）
  cd Server-NestJS && npx jest src/plugins
  # 4. 卸载（移除接线）+ 删除复制文件，源文件保留在 Server-NestJS/scripts/examples 作示例
  node scripts/keelbase-plugin.mjs remove APPROVAL_INTAKE_PLUGIN
  rm Server-NestJS/src/plugins/plugins/approval-intake.plugin.ts
  ```
  集成测试覆盖：安装后加载 + 路由注册 + 低/高风险样例返回 + 非对象 body 防御 + 未安装 not-found 分支（经真实 PluginsController 派发）+ requires 缺失跳过 + featureFlag 关闭跳过。
- 三旗舰模板导入 e2e 通过（`generated-modules.e2e-spec.ts`）。
- 旗舰 Skill 从 `src/` 拆出（approval-policy-review 示例见上）。

## 相关

- [platform-freeze.md](platform-freeze.md) — 冻结清单（插件 Registry/模板代码包显式记录）
- [module-protocol.md](../module-protocol.md) — 协议生态
- [30min-acceptance.md](30min-acceptance.md) — 生成器闭环
