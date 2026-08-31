# KeelBase 合规映射表 / Compliance Mapping

> **目的 Purpose**：把 KeelBase 已有能力翻译成合规语言，供政企/信创选型、审计配合、售前演示引用。本表为**事实性能力对照**（existing capability ↔ regulatory requirement），不含定位/竞争表述。
> This mapping translates KeelBase's existing capabilities into compliance language for government/enterprise procurement, audit cooperation and pre-sales. It is a **factual capability-to-requirement mapping**, free of positioning/competitive statements.
>
> **免责声明 Disclaimer**：KeelBase 是 AI 运行时/中间件（runtime/middleware），本身不是《AI 法案》意义上的 AI 系统。本表说明 KeelBase 的既有能力如何**帮助部署方满足**合规义务（enabling compliance），不构成法律意见；具体条款以满足场景适用法律的正式文本为准。
> KeelBase is an AI runtime/middleware, not an AI system per se under the AI Act. This table shows how existing KeelBase capabilities **help deployers meet** obligations; it is not legal advice. The authoritative text of any applicable regulation governs.

---

## 0. 能力资产速览 / Capability Inventory

映射表引用的 KeelBase 既有能力（均可验证，详见仓库代码与文档）：

| 能力域 | 关键能力 |
|---|---|
| 身份与访问 Identity & Access | JWT（access+refresh 轮换、SHA-256 哈希存储）、MFA（TOTP）、登录锁定、CASL 行级权限、角色、OIDC/SAML 待办、Explainable Authz、跨系统委托 token（aud 限定 + 短期） |
| 数据保护 Data Protection | AES-256-GCM 静态加密（phone/providerId）、管理端字段脱敏（sanitizeForAdmin）、审计日志敏感字段掩码、私有化部署（数据不出域）、本地模型（Ollama 数据不出域） |
| 审计 Audit | AI 审计哈希链（HMAC-SHA256 + prev_hash，篡改即断链，verify 可验证）、操作审计、字段级变更审计（before/after diff）、业务事件归一化、决策轨迹（Decision Trace）、审计证据包导出（HMAC 签名 + 全量链行，**可离线机器验证** `verify-evidence.mjs`）、跨系统聚合审计（治理台） |
| 治理 Governance | 工具风险分级 R0-R5、工具门控、人工确认（R3）、双人审批（R4）、副作用登记与撤销（含跨系统回调）、治理策略实时生效、Agent Registry、独立治理台（Guard）、sidecar 零代码接入 |
| 安全加固 Security | 提示注入防御、内容安全（敏感词/越狱检测）、SSRF 防护、上传 MIME/魔数校验、限流、Helmet 安全头、白名单校验、依赖更新（dependabot） |
| 隐私与用户权利 Privacy | 数据可携带导出（/auth/export-data）、账号注销级联清理、AI 记忆清除、脱敏排行榜 |
| 可观测性 Observability | pino 结构化日志、Prometheus 指标、OpenTelemetry 链路、审计趋势/异常视图 |

---

## 1. 中国《人工智能 智能体互联》系列国家标准（2026-06 发布）映射

**背景**：市场监管总局 2026 年 6 月发布《人工智能 智能体互联》系列 **7 项国家标准**，覆盖「总体架构、身份码、身份管理、智能体描述、智能体发现、智能体交互、智能体工具调用」，形成「身份标识 → 能力描述 → 供需发现 → 协同交互 → 工具调用」闭环。具体编号以正式发布文本为准。

| 国标方向 | KeelBase 对应能力 | 满足度 | 说明 |
|---|---|---|---|
| 总体架构 | 三层模型（Agent Framework → KeelBase Trust 层 → 业务系统）+ 五层 Trust 模型（L1 Identity→L5 Side-effect） | ✅ | 运行时即「智能体互联」的中间信任层，架构天然对齐 |
| 身份码 / 身份管理 | Agent Identity（agent_id/session_id 落审计）、Agent Registry、OIDC 身份源、跨系统委托 token（aud/iss/oidcSub 语义）、SHA-256 哈希存储 | ✅ | 智能体身份标识与跨系统身份映射具备；与国标「身份码/身份管理」方向对应 |
| 智能体描述 | Agent Registry 能力 JSON、工具 JSON Schema 声明、R0-R5 风险级声明、§4.4 MCP 声明扩展（`_meta.keelbase`） | ✅ | 智能体/工具能力描述可机器消费 |
| 智能体发现 | MCP 出口（tools/list）、能力清单（/app/capabilities）、工具清单 | ✅ | 标准化发现协议（MCP） |
| 智能体交互 | MCP gateway、SSE 流式、WS 双向通道、对话历史 | ✅ | 多通道交互已具备 |
| **智能体工具调用** | **Tool Governance 全链路：R0-R5 风险分级 → 工具门控 → 人工确认/双人审批 → 副作用登记与撤销 → 审计哈希链 + 决策轨迹** | ✅ | **KeelBase 最核心对齐项**：国标「工具调用」环节的治理运行时 |
| 协同协作（安全侧） | sidecar 零代码接入、跨系统审计聚合、跨系统撤销回调 | ✅ | 多系统协同下的治理一致性 |

> **结论**：KeelBase 的差异化对齐点集中在「智能体工具调用」与「身份」两个环节——把这两个环节做成可治理、可审计、可撤销的标准层。

---

## 2. 欧盟《AI 法案》（EU 2024/1689）映射

**定位**：帮助**高风险 AI 系统部署者**满足义务（KeelBase 提供记录、监督、治理的实现载体）。条款编号以 EU 2024/1689 正式文本为准。

| AI 法案义务 | KeelBase 对应能力 | 满足度 | 说明 |
|---|---|---|---|
| 风险管理（Art. 9） | R0-R5 工具风险分级 + 工具门控 + 阻断（R5） | ✅ | 工具级风险模型即「风险缓解措施」载体 |
| 数据治理（Art. 10） | 字段脱敏、静态加密、私有化数据不出域 | ✅ | 数据治理与数据最小化 |
| 技术文档（Art. 11） | 中英双语文档体系、/app/provenance 来源指纹、能力清单 | ✅ | 可追溯的系统来源信息 |
| **记录保存 Logging（Art. 12）** | **审计哈希链（篡改即断链）+ 决策轨迹 + 字段级 diff + 业务事件 + 证据包导出（可离线机器验证）** | ✅ | **最直接对齐项**：AI 决策过程全程可记录、可验证、可导出 |
| 透明度与部署者信息（Art. 13） | Explainable Authz（授权依据可解释）、决策轨迹、审计「为什么」分层 | ✅ | 决策依据可解释 |
| **人类监督（Art. 14）** | **人工确认（R3）、双人审批（R4）、撤销、治理策略人工配置** | ✅ | **第二直接对齐项**：Human-in-the-loop 是 KeelBase 设计核心 |
| 准确性/鲁棒性/网络安全（Art. 15） | AI Eval 评测集、安全评测、注入防御、SSRF/上传防护、限流 | 🔶 | 评测覆盖工具级；模型级鲁棒性取决于所用 LLM |
| 特定透明度义务（Art. 50） | 对话来源标注、AI 审计 provider 归因 | 🔶 | 部分；对外「AI 生成」披露由部署方界面控制 |

---

## 3. 等保 2.0（GB/T 22239-2019）映射

| 安全计算环境要求 | KeelBase 对应能力 | 满足度 | 说明 |
|---|---|---|---|
| 身份鉴别 | JWT + 密码强度策略 + 登录锁定 + MFA（TOTP）+ 会话管理 | ✅ | 双因素 + 防爆破 |
| 访问控制 | CASL 行级权限 + 角色 + 所有权校验 + 权限点（前端 RBAC） | ✅ | 最小权限 + 行级隔离 |
| **安全审计** | **AI/操作审计哈希链 + 字段级变更 + 审计趋势/异常 + 证据包导出（可离线验证）** | ✅ | 审计记录防篡改（哈希链）+ 可独立复核 |
| 数据完整性 | 审计哈希链（HMAC 校验）、上传魔数校验 | ✅ | 记录与文件完整性 |
| 数据保密性 | AES-256-GCM 静态加密、脱敏、敏感字段掩码 | ✅ | 静态加密 + 展示脱敏 |
| 个人信息保护 | 管理端脱敏、数据可携带导出、注销清理、隐私政策 | ✅ | 最小必要 + 权利响应 |
| 可信验证（可选增强） | 离线部署、无外联运行（数据不出域） | 🔶 | 结合部署侧做等保定级 |

---

## 4. 数据合规映射（《个人信息保护法》PIPL / 《数据安全法》）

| 要求 | KeelBase 对应能力 | 满足度 | 说明 |
|---|---|---|---|
| 数据出境合规 | 私有化部署 + 本地模型（Ollama），数据不出域 | ✅ | 消除出境场景，直接降低评估成本 |
| 最小必要 / 最小化 | 工具数据范围（本人/组织）、字段级数据范围、脱敏 | ✅ | 数据访问按业务范围受限 |
| 个人信息脱敏 | 管理端 sanitizeForAdmin（email/phone 掩码、bio/生日不返回） | ✅ | 管理侧不暴露明文 |
| 删除权 / 携带权 | 账号注销级联清理、/auth/export-data 导出、AI 记忆清除 | ✅ | 权利响应路径齐全 |
| 处理记录可审计 | 全链路审计 + 哈希链 | ✅ | 处理可追溯 |

---

## 5. 密评（密码应用安全性评估）与信创差距 / Gaps

> **诚实标注**：以下为当前真实差距，不虚报满足。差距即「信创适配认证服务」的规划输入。

| 差距 | 影响 | 规划 |
|---|---|---|
| **国密算法（SM2/SM3/SM4）未支持** | 审计哈希链用 HMAC-SHA256、静态加密用 AES-256-GCM，非国密；密评（GM/T 0054）要求商用密码合规 | 评估「SM3 哈希链」双算法支持（哈希链双写或可配摘要算法）；需真实密评项目驱动 |
| **国产数据库（达梦/人大金仓）未适配** | 当前支持 sqlite/postgres；信创数据库选型受限 | postgres 兼容线是起点；金仓为 postgres 系，适配成本低；达梦需专项 |
| 国产 CPU/OS（麒麟/统信/arm64/龙芯） | Node 官方 arm64 构建可用；龙芯等需验证 | 盘点已实测项，只报实测（信创卡①） |
| SAML / LDAP 目录同步 | 仅 OIDC；部分政企用 SAML | 需求驱动（企业选型硬项 P2） |
| 高可用多副本 | 单副本设计（确认门/会话信任进程内） | 企业版「高可用」清单，付费客户出现再做 |
| 数据留存策略（合规留存/自动清理） | 未配置化 | 企业版「数据保留策略」候选 |

---

## 6. 一句话结论 / Conclusion

> KeelBase 的能力在「**智能体工具调用治理、审计哈希链、人工监督、数据不出域**」四个维度与《人工智能 智能体互联》系列国标、EU AI Act 记录保存/人类监督义务、等保安全审计要求高度对齐；主要差距在**国密算法、国产数据库、SAML/LDAP**——即「信创适配认证服务」的规划输入。具体以适用法规正式文本为准。
>
> KeelBase's capabilities align strongly with the Agent-Interconnection national standards, EU AI Act logging/human-oversight obligations, and MLPS security-audit requirements on four dimensions: **governed tool invocation, audit hash chain, human-in-the-loop, and data-sovereign deployment**. Main gaps: **national crypto (SM2/3/4), domestic databases, SAML/LDAP** — the inputs for the Xinchuang adaptation certification service. Authoritative legal texts govern.
