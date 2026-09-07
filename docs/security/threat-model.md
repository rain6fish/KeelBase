# KeelBase 威胁模型与信任边界 / Threat Model & Trust Boundaries

> 定位：本文档把「KeelBase 保护什么、用什么机制、不保护什么」写成一份可评审的**威胁模型**与**信任边界声明**（Threat Model + Trust Boundary Statement），供企业安全评审、POC 选型、审计对接使用。
> 与 [SECURITY.md](../../SECURITY.md)「Trust Boundaries — Not-a-*」表保持一致：**N-1/N-2/N-3 是本文的信任边界源**，本文只细化威胁-控制-残余风险，不新增承诺。
> EN 版：[threat-model-en.md](threat-model-en.md)。

---

## 1. 信任边界声明（Trust Boundary Statement）

一句话边界：**KeelBase 的审计完整性保证作用于「应用边界之内、且密钥不泄漏」的前提；它不是防 DBA/root 的堡垒，也不是不可抵赖存储。** 具体（对应 N-1/N-2/N-3）：

| 边界 | 承诺 | 不承诺 |
|---|---|---|
| **篡改检测范围** | 绕过系统正式写路径的数据库改写会破坏审计哈希链，被 `/audit/verify` / `/audit/operations/verify` 检出；evidence-root（`keelbase-audit-evidence/3`）把授权快照 + Decision Evidence + 各链子行绑成单文件，根锚 digest 可离线复算 | 不承诺防住「同时拥有数据库与运行时签名密钥（同一信任域）」的攻击者（N-1）——这类威胁由部署纪律（密钥分离、DB 最小权限、审计独立库）缓解，见 §4 |
| **证据性质** | 哈希链 + 证据包 + 离线验证是**完整性证据**（可证明记录自写入后未被改动/遗漏，证据间强关联） | 不承诺法律/监管级「不可抵赖存储」；法律级取证须叠加外部公证/可信时间戳/密钥托管（N-2，部署方义务） |
| **审计覆盖** | 覆盖系统内一切写路径：REST / AI 工具 / MCP / Bridge / SSE / 治理回调 | 不覆盖绕过系统正式路径的库外直改（N-10）与持宿主机 root 且具备应用侧同等的管理员（N-3） |

**为什么这样定边界**：任何应用层防篡改都有信任根。KeelBase 的信任根 =「正式写路径 + 审计密钥不被同一攻击者同时控制」。把边界说清楚，企业才能正确安排外部控制（OS/DB 访问控制、密钥托管、职责分离），而不是误以为装一个 Runtime 就拿到不可抵赖。

---

## 2. 资产与信任域

| 资产 | 位置 | 信任域 |
|---|---|---|
| 业务数据 | 业务库（SQLite/PostgreSQL） | 应用进程 + DB 同域（部署方控制） |
| AI/操作审计 + 哈希链 | 业务库内 `ai_audit_logs`/`operation_audit_logs` | 同业务库；生产建议审计密钥独立 |
| 治理策略 | 自有治理策略表 / 治理控制台 | 应用域；企业级可拆独立治理库（`GOVERNANCE_DB_*`） |
| 审计证据包 / 证据根 | 导出文件（JSON） | 离开系统后由验证方持有（离线） |
| 签名密钥（AUDIT_HMAC_KEY 等） | 环境变量 / 密钥托管 | **信任根**——泄漏则 N-1 边界失效，靠部署纪律保护 |

**信任根小结**：离线验证脚本 `verify-evidence.mjs` 只依赖 Node 内置，不装 KeelBase 即可复核证据包——这把「审计方要信谁」从「信 Runtime 进程」下推到「信证据包本身 + 验证算法」，正是 N-1 里说的把单点信任下推。

---

## 3. 威胁模型（Threat × 控制 × 残余风险）

> 攻击者分类：T0 匿名外部、T1 登录普通用户、T2 越权用户（含被投毒 Agent）、T3 有业务库/宿主机的内部运维或 DBA、T4 持审计密钥者。残余风险列给出的是**部署方**需接管的义务。

| 威胁 | 对应控制 | 覆盖 | 残余风险（部署方义务） |
|---|---|---|---|
| **T0→T2 越权读写**（跨用户/跨角色/绕过行级） | CASL 行级授权 + PoliciesGuard + 工具数据范围限定 + AI 评测/对抗演示 | 系统内一切 API 与 AI 工具路径 | —（应用边界内闭环） |
| **T1→T2 写操作未经确认**（Agent 自主写、确认绕过） | R3 确认 / R4 审批 / R5 阻断；确认 token 一次性；SSE 确认协议 | AI 写工具路径 | 业务人员需审 diff 摘要而非盲批（批量确认语义见 N-7/KB-5） |
| **T0→T2 注入**（提示词注入/工具滥用引导越权） | 工具白名单 + 注入防线 + security-showcase 对抗场景 + eval 注入用例 | AI 对话与工具执行 | — |
| **T2→T3 篡改审计**（改行/删行/换序/改业务字段后伪造一致） | 审计哈希链（prev_hash 连续）+ 写路径串行锁 + `/verify` 逐行重算 | 应用内写路径产生的审计 | **持业务库 + 签名密钥者仍可重算链**（N-1）：靠密钥分离 + DB 最小权限 + 审计独立治理库缓解 |
| **T3 直改库**（绕过 API 改业务数据/审计） | —（应用层无法防持库者） | 不覆盖（N-10/N-3） | OS/DB 访问控制、库外变更留痕、审计库与业务库分离、备份 |
| **T4 密钥泄漏后重签** | 密钥不在证据包内；离线验证需外部提供 `--key` | 证据完整性依赖密钥保密 | 密钥托管/HSM、定期轮换、旧密钥妥善处置（历史断链需重签，ECS 曾实践） |
| **失败路径不可信**（超时/半成功/重放/DB 故障/补偿失败） | failure-path 语料（KB-4）：幂等、有界超时、审计 fail-closed、未知结果如实记录 | 运行时写路径与外部调用 | 跨系统最终一致由企业对账/补偿流程负责（N-6） |

**核心判断**：KeelBase 把「T0/T1/T2 的系统内威胁」在应用边界内闭环；把「T3/T4（持库、持 root、持密钥）」明确交给部署纪律，而不是用一个会碎的密码学承诺硬扛。**这正是 Trust Runtime 该有的诚实**——真正企业级系统不会声称什么都能防。

---

## 4. 信任边界的部署义务清单（Trust-boundary deployment duties）

让 N-1/N-3 边界在真实部署中成立，部署方须做到（缺一则边界降级）：

- [ ] **审计密钥分离**：AUDIT_HMAC_KEY / JWT 密钥不写入业务开发者共享环境；生产走密钥托管/环境隔离
- [ ] **DB 最小权限**：应用账号无 DDL；审计表不允许应用外直写
- [ ] **审计独立落库**（可选增强）：配置 `GOVERNANCE_DB_*` 让治理/审计落独立治理库，与业务库分开（对应 §2 信任域）
- [ ] **库外变更纪律**：任何绕过 API 的 DBA 操作走变更流程并在库外留痕，避免事后无法归因
- [ ] **备份与恢复演练**：恢复流程保留原哈希链与密钥版本，防止恢复后验签失败（曾遇旧密钥断链，见 evidence hub）
- [ ] 法律级取证叠加**外部公证/可信时间戳/密钥托管**（N-2）

---

## 5. 审计完整性怎么证明（可复现验证程序）

三层证据（L0/L1/L2，见 [docs/evidence](../../docs/evidence/README.md)），全部可现算或可离线复现：

```bash
# L0 运行时完整性（带管理员 token，现算现验）
GET /api/v1/audit/verify                    # AI 审计哈希链逐行重算
GET /api/v1/audit/operations/verify         # 操作审计哈希链
GET /api/v1/ai/governance/evidence-root/:resultType/:resultId   # 单动作跨链证据根 v3

# L1 离线独立复核（审计机构/第三方，不装 KeelBase；脚本只依赖 Node 内置）
#   证据包导出后，在 Server-NestJS/：
npm run verify:evidence -- <evidence.json>          # 结构验证：seq 连续 / hash 64hex / prevHash 连续 / 根锚 digest 自洽
npm run verify:evidence -- <evidence.json> --key <AUDIT_HMAC_KEY[,PREVIOUS...]>   # 全量重算每条 payload + 根锚 + 签名
```

- **为什么能离线复核**：`verify-evidence.mjs` 独立实现协议算法（canonicalJSON + HMAC-SHA256 + 根锚 sha256），不 import 任何参考实现，与运行环境无关。
- **证据根 v3（keelbase-audit-evidence/3）回应「哈希链锚在哪」**：单动作证据根把授权快照（含 policy.revision）+ Decision Evidence + 同会话 AI 审计链行 + operation_audit 链行 + 副作用行绑成单文件，`root.anchors` 跨链锚 + `root.digest` 可离线复算——审计方无需信任运行中系统，拿着导出的包即可验证「当时那条 AI 动作在什么授权下发生、改了谁、落在哪条链上」。
- **现有留档样例**：`Server-NestJS/docs/benchmark/evidence-verify-*.json/.md`（离线验证报告，含全量重算 PASS 记录）。

---

## 6. 与 Not-a-* 及后续文档的关系

- 信任边界源表：[SECURITY.md → Trust Boundaries（Not-a-*）](../../SECURITY.md)，N-1/N-2/N-3/N-6/N-7/N-10 与本文一一对应
- 哈希链规格：`docs/hs11-audit-chain.spec.md`
- 授权快照：`docs/audit-authz-snapshot.spec.md`
- 证据根：`docs/evidence-root.spec.md`；证据体系总览：`docs/evidence/README.md`
- 失败路径可信：`docs/failure-path-corpus.spec.md`（KB-4）
- 本模型随能力变化持续修订；新增「提供/不提供」声明前先过本文 §1 边界。

*文档 · 2026-09-07 · KB-3 威胁模型 + 信任边界（对齐 N-1/N-2/N-3）*
