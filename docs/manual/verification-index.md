# 可复现验证清单 / Reproducible Verification Index

> **定位**：M1 演示 / 评审 / 集成商选型用的一站式验证清单——每条「命令 + 前置 + 报告位置」，全部可现场复现。对应产品证明项（V-2/3/4/6）与护城河资产（MOAT-1/2/3、S-1/S-2）。
> **Positioning**: one-stop verification checklist for M1 demos / reviews / integrator evaluation — each entry has command + prerequisite + report location, all reproducible on-site.

---

## 一、护城河：运行时治理 / Runtime Governance

| # | 验证 | 命令（仓库根） | 前置 | 报告 |
|---|---|---|---|---|
| M1 | **30 分钟接入治理**（零代码 sidecar → 治理台审计 + 哈希链） | `node Server-NestJS/scripts/verify-moat-adoption.mjs` | `npm run build`（自起治理台+sidecar+mock LLM，无需真实 key） | `Server-NestJS/docs/benchmark/moat-adoption-*`（实测 **8/8**） |
| M3 | **多系统单控制面**（一个治理台管 Node+Java 两系统） | `node Server-NestJS/scripts/demo-multi-system.mjs` | 同上（自包含） | `Server-NestJS/docs/benchmark/moat3-multisystem-*`（实测 10 条哈希链连续） |
| G | **AI 黄金流程**（分析→确认→创建→审计→撤销） | `node scripts/verify-golden-crm.mjs` | 后端已起 + DeepSeek key | `docs/benchmark/golden-crm-*`（实测 **8/8**） |
| B | **存量系统 AI 化 B 路径**（OpenAPI→Proxy 工具→委托身份→确认→写回→撤销） | `node Server-NestJS/scripts/verify-proxy-bridge.mjs` | 后端已起 + DeepSeek key | `docs/benchmark/proxy-bridge-*`（实测 **8/8**） |

## 二、产品证明：安全边界 / Security Boundary

| # | 验证 | 命令 | 前置 | 报告 |
|---|---|---|---|---|
| T | **Trust 证明包六场景**（正常成功/越权 403/R5 阻断/人工确认/撤销/Java 引导——**DNA 四原则**的聚合证明） | `node Server-NestJS/scripts/verify-trust-proof.mjs` | 后端已起（默认 `PROVIDER=demo` 确定性，无 LLM key 也可跑） | `docs/benchmark/trust-proof-*`（实测 **15/15**） |
| V2 | **越权拒绝 403**（双账号行级权限） | `node Server-NestJS/scripts/verify-permission-denied.mjs` | 后端已起（alex/admin seed 账号） | `Server-NestJS/docs/benchmark/permission-denied-*`（实测 **8/8**） |
| S | **Security Showcase 五项**（越权/工具治理/人工批准/哈希链/Agent 攻击集） | 按 `docs/manual/security-showcase.md` | 一键起环境（docker run 内置 demo provider） | `docs/manual/security-showcase.md` 验收清单 |
| E | **AI 攻击集 + 黄金 8-8**（prompt 注入/越权/确认绕过/撤销绕过） | `./scripts/verify-security-eval.sh` | 后端已起 + LLM key | `docs/benchmark/security-eval-*` |
| R | **撤销/Decision Trace 链路** | `verify-golden-crm.mjs` 步骤 7 | 同 golden-crm | 同 golden-crm |

## 三、产品证明：构建与复位 / Build & Reset

| # | 验证 | 命令 | 前置 | 报告 |
|---|---|---|---|---|
| V4 | **Demo Reset 一键复位** | `./scripts/reset-demo.sh` | 先停后端 | 备份到 `Server-NestJS/data/backups/` |
| V6 | **30min Build 外部验证**（陌生开发者计时） | 按 `docs/manual/30min-build-verification.md` | 干净 clone + Node 22 | 计时记录表（实测待外部执行） |
| B1 | **30min Build 生成闭环**（CI 常驻冒烟） | `node scripts/keelbase-init.mjs --module <m> --label <l> --fields ...` | 无需后端 | CI `stranger-smoke` job |

## 四、私有化 / Private & Adversarial

| # | 验证 | 命令 | 前置 | 报告 |
|---|---|---|---|---|
| P | **私有 AI 黄金路径**（数据不出域） | `./scripts/verify-private-ai.sh` | Ollama（qwen2.5:7b + bge-m3） | `docs/benchmark/private-ai.json` |
| A | **对抗实证**（Run/Safety/攻击回归，真实 LLM） | `./scripts/benchmark/run-adversarial.sh` | DeepSeek key | `docs/benchmark/adversarial-proof.md` |

---

## 快速上手（无 key 可跑 3 条）/ Zero-key Quick Run

```bash
npm run build   # 一次
node Server-NestJS/scripts/verify-moat-adoption.mjs     # MOAT-1：零代码接入治理
node Server-NestJS/scripts/demo-multi-system.mjs        # MOAT-3：多系统单控制面
# 起后端后：
node Server-NestJS/scripts/verify-permission-denied.mjs # V-2：越权 403
```

三条全部绿色 = 治理闭环 + 权限边界 + 多系统可复现（评审/演示的最小证明集）。

## 相关 / Related

- [security-showcase.md](security-showcase.md) — 安全展示五项（人工演示路径）
- [ai-trust-manifesto.md](../ai-trust-manifesto.md) — 企业 AI 信任宣言（DNA 四原则 → 采购/选型四问，参考实现验证映射）
- [keelbase-dna.md](../keelbase-dna.md) — 工程哲学（四原则出处）
- [adoption-30min.md](adoption-30min.md) — 30 分钟接入治理（MOAT-1 指南）
- [multi-system-demo.md](multi-system-demo.md) — 多系统单控制面演示（MOAT-3）
- [30min-build-verification.md](30min-build-verification.md) — 30min Build 外部验证（V-6）
- [demo-live.md](demo-live.md) — 在线 demo 引导 + 数据复位（V-4）
