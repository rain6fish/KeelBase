# KeelBase — Enterprise Readiness / 企业就绪度

> 这份文档对照企业选型时常见的「必需功能」清单，逐项列出 KeelBase 现状（✅ 已完成 / 🚧 部分 / ⬜ 待办 / ⏸ 押后）+ 证据（spec 文档 / 端点 / 页面），并给出差距与优先级。
> This document maps KeelBase against the typical "must-have" checklist used in enterprise evaluations — current status (✅ done / 🚧 partial / ⬜ todo / ⏸ deferred) with evidence (specs / endpoints / pages), plus gaps and priorities.
>
> 状态日期：2026-08-17。本文档为活清单，随版本更新。Status as of 2026-08-17; a living checklist that moves with each release.

---

## 1. 身份与访问 / Identity & Access

| 能力 Capability | 状态 | 证据 Evidence |
|---|---|---|
| 注册 / 登录 / JWT 轮换 / 多设备会话 Register / login / JWT rotation / multi-device sessions | ✅ | `/auth/*`；[session-management.spec.md](session-management.spec.md) |
| 邮箱验证 / 手机号验证 Email / phone verification | ✅ | `/auth/verify-email`、`/auth/send-sms-code`；[account-compliance](account-compliance.spec.md) |
| 忘记密码 / 重置 Forgot / reset password | ✅ | `/auth/forgot-password`、`/auth/reset-password`；[password-recovery.spec.md](password-recovery.spec.md) |
| OAuth 第三方（微信 / 支付宝 / Google / Apple） | ✅ | `/auth/oauth`；[oauth-config.md](oauth-config.md) |
| CASL 行级授权（角色 + 所有权）Role / row-level authorization | ✅ | 全局 `PoliciesGuard` + `CaslAbilityFactory`；users/events/todos/ai_conversations |
| 组织级数据隔离 Org-level data isolation | ✅ | events/todos 加 `org_id`，「本人 OR 同组织」查询（ORG-3） |
| 登录防爆破 / Token 哈希 / AES-256-GCM 静态加密 Lockout / token hashing / static encryption | ✅ | 连续失败锁定、refresh SHA-256、phone/providerId 加密 |
| **前端 RBAC（WEB-FRONT-2）Route/menu/button permissions** | ⬜ 待办 | 现仅「是否 admin」一个开关；需路由级 + 按钮级权限点 + 可视化角色管理页（前端 RBAC 仅为渲染层，后端授权仍以 CASL 为唯一来源） |
| **企业登录安全（WEB-FRONT-4）MFA / 强制改密 / SSO** | 🚧 部分 | MFA（TOTP setup/verify/disable + 登录需 TOTP）✅ 强制改密（登录带标志 + admin 标记）✅ SSO（OIDC/SAML）⬜——SSO 为剩余采购评审硬门槛 |

## 2. 组织与协作 / Organization & Collaboration

| 能力 Capability | 状态 | 证据 Evidence |
|---|---|---|
| 组织 / 部门 / 成员数据模型 Org / department / member model | ✅ | `Organization` + `Department`（自引用树）+ 成员关系（ORG-1） |
| 管理台组织管理页 Org admin page | ✅ | Web-Admin「组织」页：树 CRUD + 成员 + 角色 + 批量导入（ORG-2） |
| 审批流 Approval workflows | ✅ | FLOW 引擎 v1~7 + `assigneeOrgRole` 按组织/部门解析审批人（ORG-4/FLOW-6） |
| AI 织入（组织边界工具）Org-scoped AI tools | ✅ | `query_org_availability` / `query_org_members` / `query_org_tasks`（ORG-5）；[org5-ai-tools.spec.md](org5-ai-tools.spec.md) |
| 邀请加入组织 Org invites | ✅ | `org_invites` + 注册邀请码入组（ORG-6） |
| 工作台只读通讯录 Org directory | ✅ | 脱敏白名单（仅 id/nickname/avatarUrl/role/deptName）（ORG-7） |
| **普通用户业务 API 面（WEB-FRONT-5）User-facing business API** | ⬜ 待办 | 工作台当前消费 user-scoped 端点，企业侧业务 API 面仍薄；与 ORG 联动 |

## 3. 业务流程 / Business Process

| 能力 Capability | 状态 | 证据 Evidence |
|---|---|---|
| 表单引擎 Dynamic forms | ✅ | `form_schemas`/`form_submissions` + `/forms` 用户端点 + admin CRUD（PL-10） |
| 工作流引擎（护栏优先混合编排）Workflow engine | ✅ | 显式节点（human/ai/condition）+ 状态机 + AI 生成流程定义（FLOW-1~7） |
| 待办 / 日程 / 通知 Todos / events / notifications | ✅ | `/todos`、`/events`、`/notifications` + SSE 实时 |
| 拖拽式流程设计器 Drag-and-drop designer | ⏸ 押后 | FLOW-8——只读渲染 + AI 生成流程定义，真实客户需求再加 |
| 行业模板市场 Industry template market | ⏸ 押后 | FLOW-9——需行业 know-how，非工程问题 |

## 4. 安全与合规 / Security & Compliance

| 能力 Capability | 状态 | 证据 Evidence |
|---|---|---|
| 操作审计 + AI 审计（哈希链防篡改）Audit (tamper-evident hash chain) | ✅ | `/audit/*`、`/audit/operations/*`；HS-11 [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md) |
| AI 治理策略（工具开关 / 确认规则 / 角色白名单 / 审计粒度）Governance policy | ✅ | `ai_governance_policy` 动态配置 + 管理台可视化编辑（HS-9 [hs9-governance-policy.spec.md](hs9-governance-policy.spec.md)） |
| MCP 集成（外部工具过同一治理层）MCP integration | ✅ | `/api/v1/mcp` 出口 + `/admin/mcp/*` 入口 + 管理台页面（HS-10） |
| 敏感数据加密 / 上传安全 / SSRF 防护 Encryption / upload security | ✅ | AES-256-GCM + 魔数校验 + 图片 SSRF 双防 |
| 数据可携带 / 自助注销 Data portability / deactivation | ✅ | `/auth/export-data`、`/auth/deactivate`（AU-5/6） |
| 数据主权（私有化 AI / 离线部署）Data sovereignty | ✅ | OLLAMA 本地 LLM + 离线镜像（POV-1/3） |
| 内容安全 Content safety（AI-23） | ⏸ 押后 | 敏感词/越狱防护——市场相关，目标市场确定后启动 |

## 5. 可观测与运维 / Observability & Ops

| 能力 Capability | 状态 | 证据 Evidence |
|---|---|---|
| 日志 / 指标 / 链路 / 告警 Logs / metrics / traces / alerts | ✅ | pino + Prometheus + OTel + Loki + Grafana + Jaeger + 告警规则 |
| 运维单页 Ops one-pager | ✅ | Web-Admin「运维」页聚合服务/依赖/错误率/告警（D.8） |
| 健康检查详情 Health details | ✅ | `/health?detail=true`（D.9） |
| 一键 / 离线 / 独立部署 One-click / offline / standalone deploys | ✅ | deploy.sh + offline-deploy + admin-deploy（D.7/POV-3/D.10） |
| **性能压测基准（3.4）Benchmark baseline** | 🚧 部分 | `docs/benchmark/` 有初版报告，但受限流干扰（non-2xx≈总数）且缺 P95——需按正确方法论重做 |
| K8s / 蓝绿部署（D.2/D.3） | ⏸ 押后 | 生产规模增长后评估 |

## 6. 渠道与触达 / Channels

| 能力 Capability | 状态 | 证据 Evidence |
|---|---|---|
| 主 App（Flutter 三端）+ 小程序（Taro）+ 管理台/工作台 Three clients | ✅ | Front-Flutter / Front-Taro / Web-Admin-Vue（同壳两套导航） |
| 小程序 i18n（Taro 主 app 中英混杂）Mini-program i18n | ⬜ 待办 | CR-25 剩余——小程序渠道文案未走 i18n 层 |
| 邮件 / 站内通知 / SSE / Webhook | ✅ | SMTP + notifications + `/webhooks`（PL-14） |
| 推送（极光抽象层）Push | 🚧 部分 | PushService 抽象 + 极光实现，真实厂商 SDK 待凭据（MS-2.2/2.3） |
| 微信订阅消息 / 快捷登录 / 分享（MINI-2/3/4） | ⬜ 待办 | 需微信开放平台凭据 |

---

## 差距与优先级 / Gaps & Priorities

按「企业选型影响 × 投入」排序：

1. **WEB-FRONT-2 前端 RBAC** —— 多角色企业场景必需；当前只有「是否 admin」，无法表达部门管理员/项目经理/审计员等角色。
2. **WEB-FRONT-4 企业登录安全（SSO）** —— 采购评审硬门槛，招标/合规常直接卡此项。MFA（TOTP）与强制改密已完成（2026-08-17），SSO（OIDC/SAML）为剩余项。
3. **WEB-FRONT-5 普通用户业务 API 面** —— 工作台应用侧的能力底座，随 ORG 联动。
4. **3.4 性能基准重做** —— 对外基线可信度；当前初版报告方法论有缺陷。
5. **Taro i18n** —— 小程序渠道一致性（CR-25）。
6. 其余押后项（MINI-2/3/4、AI-23、D.2/D.3、FLOW-8/9）—— 依赖外部凭据或市场决策，不阻塞基座交付。

> **前提约束**：前端 RBAC 只是渲染层（隐藏 ≠ 越权），后端授权仍以 CASL 为唯一来源（CLAUDE.md §5.5 三入口红线不变）。

---

## 合规路径 / Compliance Path

| 合规主题 | KeelBase 支撑 | 证据 |
|---|---|---|
| 《数据安全法》/《个人信息保护法》 | 敏感数据静态加密、防爆破、最小化采集、数据可携带、注销 | §4 安全与合规 |
| 等保参考要求（审计 / 备份 / 访问控制） | 全链路审计（哈希链）、备份恢复、CASL 访问控制 | §1/§4/§5 |
| 生成式 AI 合规（网信办《生成式 AI 服务管理暂行办法》） | AI-23 押后——目标市场确定后启动（内容审核 + 数据出境声明） | §4 |
| 数据不出域 / 私有化 | 本地 LLM/embedding + 离线镜像 + 外部依赖降级（POV-1/3） | §4 |

---

## 相关文档 / Related Docs

- [tutorial.md](manual/tutorial.md) — 从零到部署教程（DX-2）
- [one-click-deploy.md](manual/one-click-deploy.md) / [offline-deploy.md](manual/offline-deploy.md) / [admin-deploy.md](manual/admin-deploy.md) — 部署手册
- [operations.md](manual/operations.md) — 运维手册（部署/环境变量/备份/可观测）
- [development.md](manual/development.md) — 开发手册
- [web-front.spec.md](web-front.spec.md) — 企业 Web 端规格（WEB-FRONT 系列）
- [org5-ai-tools.spec.md](org5-ai-tools.spec.md) — 组织边界 AI 工具规格
